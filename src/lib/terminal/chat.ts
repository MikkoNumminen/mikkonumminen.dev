/**
 * RAG chat client for the contact-page terminal.
 *
 * This is the *progressive-enhancement* layer (build brief constraint 5): it sits
 * on top of the existing scripted terminal and only ever activates when a chat
 * backend AND its local LLM are reachable and actually responding. When the
 * backend is absent — the common case, and the state the static build/CI runs in
 * (`PUBLIC_CHAT_API_URL` unset) — every function here is inert: no fetch, no DOM
 * change, no console output, no chat affordance. The terminal then behaves
 * exactly as it does today.
 *
 * Availability is decided by a single `/health` probe whose result is memoized
 * for the session. If a `/chat` call later fails mid-session, the chat degrades
 * silently to scripted-only for the rest of the session (`disableChatForSession`)
 * — a clean shell-style line, never a broken chat box.
 *
 * Backend contract (see chat-backend, Phase 2):
 *   GET  /health -> { status, checks: { db: bool, llm: bool }, model }
 *                   chat is available iff checks.llm === true
 *   POST /chat   -> Server-Sent Events:
 *                   event: sources  data: {"sources":[{source,title,project}]}
 *                   event: token    data: {"text":"..."}        (repeated)
 *                   event: done     data: {}
 *                   event: error    data: {"message":"..."}
 */

import type { getTranslations } from '../../i18n';
import type { CommandContext } from './types';

type Translations = ReturnType<typeof getTranslations>;

export interface ChatSource {
  /** content-dir-relative path, e.g. `projects/hrm.md`. */
  source: string;
  title?: string;
  project?: string | null;
}

export interface ChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatHandlers {
  onSources?: (sources: ChatSource[]) => void;
  onToken: (text: string) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
}

interface FetchOpts {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

// How long the load-time health probe waits before deciding the backend is not
// there. Short on purpose: when a backend URL is configured but the model is
// off, the user should fall through to scripted-only quickly, with no visible
// hang. The far more common "no backend configured" case never gets this far.
const HEALTH_TIMEOUT_MS = 2500;

/**
 * The configured backend base URL, or `null` when chat is disabled.
 *
 * `PUBLIC_CHAT_API_URL` is a build-time env var (unset in CI / local builds, so
 * the chat layer is dormant by default). A trailing slash is trimmed so the
 * `${base}/health` / `${base}/chat` joins never double up.
 */
export function getChatBaseUrl(): string | null {
  const raw = import.meta.env.PUBLIC_CHAT_API_URL;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/\/+$/, '');
  return trimmed.length > 0 ? trimmed : null;
}

// --- session availability state -------------------------------------------

// Memoized so the `/health` probe runs at most once per page load (constraint
// 5: "check /health on load, cache the result"). A reload re-probes.
let availabilityProbe: Promise<boolean> | null = null;
// Latched true the first time a `/chat` call fails, forcing scripted-only for
// the rest of the session regardless of the cached probe.
let sessionDisabled = false;

/** Force scripted-only for the rest of the session after a mid-session failure. */
export function disableChatForSession(): void {
  sessionDisabled = true;
}

/** Test seam: clear the memoized probe + disabled latch between tests. */
export function resetChatStateForTests(): void {
  availabilityProbe = null;
  sessionDisabled = false;
}

/**
 * Probe `${baseUrl}/health` and report whether free chat should be enabled.
 *
 * Returns true only when the endpoint responds 2xx within the timeout AND its
 * payload reports the LLM is actually responding (`checks.llm === true`). Any
 * failure — network error, non-2xx, timeout, malformed body — resolves to
 * `false`. It never throws and never logs: an unreachable backend is the
 * expected state, not an error to surface.
 */
export async function probeAvailability(
  baseUrl: string,
  { fetchImpl = fetch, signal }: FetchOpts = {},
): Promise<boolean> {
  try {
    const res = await fetchImpl(`${baseUrl}/health`, {
      cache: 'no-store',
      signal: signal ?? AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    if (!res.ok) return false;
    const body: unknown = await res.json();
    return (
      typeof body === 'object' &&
      body !== null &&
      'checks' in body &&
      typeof (body as { checks?: unknown }).checks === 'object' &&
      (body as { checks: Record<string, unknown> }).checks !== null &&
      (body as { checks: { llm?: unknown } }).checks.llm === true
    );
  } catch {
    return false;
  }
}

/**
 * Whether free chat is available this session (memoized).
 *
 * Resolves `false` immediately when no backend is configured or chat was
 * disabled mid-session — so the scripted-only path stays instant and the
 * `/health` probe only fires when a URL is actually set.
 */
export function isChatAvailable(): Promise<boolean> {
  if (sessionDisabled) return Promise.resolve(false);
  const base = getChatBaseUrl();
  if (!base) return Promise.resolve(false);
  availabilityProbe ??= probeAvailability(base);
  return availabilityProbe;
}

// --- SSE parsing -----------------------------------------------------------

export interface SSEEvent {
  event: string;
  data: string;
}

/**
 * Incremental Server-Sent-Events parser.
 *
 * Returns a function fed successive decoded text chunks; each call returns the
 * complete events that became available. Events are separated by a blank line;
 * a frame's `data:` lines are concatenated with newlines (per the SSE spec).
 * Carriage returns are tolerated so CRLF streams parse identically.
 */
export function createSSEParser(): (chunk: string) => SSEEvent[] {
  // Accumulate the RAW stream and normalize lazily. A trailing lone `\r` at the
  // end of the buffer is ambiguous — it may be the head of a `\r\n` whose `\n`
  // arrives in the next chunk — so it is held back and re-attached, rather than
  // normalized to `\n` immediately (which would forge a spurious `\n\n` frame
  // separator and split one frame in two, losing its event name).
  let raw = '';
  return (chunk: string): SSEEvent[] => {
    raw += chunk;
    const heldCR = raw.endsWith('\r');
    let buffer = (heldCR ? raw.slice(0, -1) : raw)
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
    const events: SSEEvent[] = [];
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const parsed = parseFrame(buffer.slice(0, sep));
      buffer = buffer.slice(sep + 2);
      if (parsed) events.push(parsed);
    }
    raw = heldCR ? `${buffer}\r` : buffer;
    return events;
  };
}

function parseFrame(frame: string): SSEEvent | null {
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of frame.split('\n')) {
    if (line.startsWith(':')) continue; // SSE comment / keep-alive
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).replace(/^ /, ''));
    }
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join('\n') };
}

function dispatchSSE(ev: SSEEvent, handlers: ChatHandlers): void {
  switch (ev.event) {
    case 'sources': {
      const sources = safeParseSources(ev.data);
      if (sources && handlers.onSources) handlers.onSources(sources);
      break;
    }
    case 'token':
    case 'message': {
      const text = safeParseText(ev.data);
      if (text) handlers.onToken(text);
      break;
    }
    case 'done':
      handlers.onDone?.();
      break;
    case 'error':
      handlers.onError?.(safeParseText(ev.data) ?? 'unknown error');
      break;
  }
}

function safeParseSources(data: string): ChatSource[] | null {
  try {
    const parsed: unknown = JSON.parse(data);
    const arr =
      parsed && typeof parsed === 'object' && 'sources' in parsed
        ? (parsed as { sources: unknown }).sources
        : parsed;
    if (!Array.isArray(arr)) return null;
    return arr
      .filter(
        (s): s is { source: unknown } =>
          typeof s === 'object' && s !== null && 'source' in s,
      )
      .map((s) => ({
        source: String((s as { source: unknown }).source),
        title: 'title' in s ? String((s as { title: unknown }).title) : undefined,
        project:
          'project' in s && (s as { project: unknown }).project != null
            ? String((s as { project: unknown }).project)
            : null,
      }));
  } catch {
    return null;
  }
}

function safeParseText(data: string): string | null {
  try {
    const parsed: unknown = JSON.parse(data);
    if (typeof parsed === 'string') return parsed;
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      if (typeof obj.text === 'string') return obj.text;
      if (typeof obj.message === 'string') return obj.message;
    }
    return null;
  } catch {
    // A non-JSON data payload is treated as raw text — robust to a server that
    // streams bare token strings.
    return data || null;
  }
}

/**
 * POST `${baseUrl}/chat` and drive `handlers` from the SSE response.
 *
 * Throws if the request itself fails (non-2xx, no body, network error) so the
 * caller can degrade; per-event `error` frames are routed to `handlers.onError`
 * instead. Token text is set via `textContent` downstream, never `innerHTML`,
 * so streamed model output is not an XSS sink.
 */
export async function streamChat(
  baseUrl: string,
  message: string,
  history: ChatHistoryItem[],
  handlers: ChatHandlers,
  { fetchImpl = fetch, signal }: FetchOpts = {},
): Promise<void> {
  const res = await fetchImpl(`${baseUrl}/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, history }),
    cache: 'no-store',
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`chat request failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const feed = createSSEParser();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    for (const ev of feed(decoder.decode(value, { stream: true }))) {
      dispatchSSE(ev, handlers);
    }
  }
}

// --- source-ref rendering --------------------------------------------------

/** Render a source path as a terminal ref, e.g. `projects/hrm.md` -> `projects/hrm`. */
export function formatSourceRef(source: string): string {
  return `→ ${source.replace(/\.md$/, '')}`;
}

function dedupeSources(sources: ChatSource[]): string[] {
  const seen = new Set<string>();
  const refs: string[] = [];
  for (const s of sources) {
    const ref = formatSourceRef(s.source);
    if (!seen.has(ref)) {
      seen.add(ref);
      refs.push(ref);
    }
  }
  return refs;
}

// --- terminal orchestration ------------------------------------------------

/**
 * Answer a free-form question by streaming the backend's response into the
 * terminal output. Shows a "…thinking" line that becomes the answer in place,
 * appends deduped source refs, and on any failure prints one clean shell-style
 * line and disables chat for the rest of the session.
 *
 * `output` is the raw output element (not `ctx`) because the answer streams
 * token-by-token into a single line node via `textContent` — append-as-you-go
 * rather than one finished `print`.
 */
export async function askChat(
  message: string,
  ctx: CommandContext,
  output: HTMLElement,
  t: Translations,
  opts: FetchOpts = {},
): Promise<void> {
  const base = getChatBaseUrl();
  if (!base) return; // gated by the caller; defensive.

  const line = document.createElement('span');
  line.className = 'line line--dim';
  line.textContent = t.terminal.chatThinking;
  output.appendChild(line);
  output.appendChild(document.createTextNode('\n'));
  output.scrollTop = output.scrollHeight;

  let started = false;
  let failed = false;
  let collected: ChatSource[] = [];

  const handlers: ChatHandlers = {
    onSources: (sources) => {
      collected = sources;
    },
    onToken: (text) => {
      if (!started) {
        started = true;
        line.className = 'line line--plain';
        line.textContent = '';
      }
      line.textContent += text;
      output.scrollTop = output.scrollHeight;
    },
    onError: () => {
      // The raw server message is not echoed — a single clean shell-style line
      // is shown below. We only need to mark the turn failed.
      failed = true;
    },
  };

  try {
    await streamChat(base, message, [], handlers, opts);
    if (failed || !started) {
      // An `error` frame, or a stream that closed before any token, is treated
      // as a failed turn: show the clean line and degrade.
      throw new Error('empty or failed chat response');
    }
    const refs = dedupeSources(collected);
    if (refs.length > 0) {
      ctx.print('');
      for (const ref of refs) ctx.print(ref, 'dim');
    }
  } catch {
    if (!started) {
      // Repurpose the thinking line into the error line so we don't leave a
      // dangling "…thinking".
      line.className = 'line line--err';
      line.textContent = t.terminal.chatError;
    } else {
      ctx.print(t.terminal.chatError, 'err');
    }
    output.scrollTop = output.scrollHeight;
    disableChatForSession();
  }
}

/**
 * The seam the command dispatcher routes through. `isAvailable` gates whether
 * unrecognized input / `ask` reaches the model; `ask` runs one turn. Kept as an
 * interface so the dispatcher is testable with a fake router and the real one
 * (which touches `fetch` + the DOM) is wired only in `initTerminal`.
 */
export interface ChatRouter {
  isAvailable: () => Promise<boolean>;
  ask: (
    message: string,
    ctx: CommandContext,
    output: HTMLElement,
    t: Translations,
  ) => Promise<void>;
}

/** The production chat router: session-memoized availability + streamed answers. */
export function createChatRouter(): ChatRouter {
  return {
    isAvailable: isChatAvailable,
    ask: (message, ctx, output, t) => askChat(message, ctx, output, t),
  };
}
