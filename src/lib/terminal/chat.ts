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
 *                   event: context  data: {"used":<int>,"limit":<int>}
 *   POST /session/reset -> { ok: true }  (Phase 4 session memory endpoint)
 */

import type { getTranslations } from '../../i18n';
import type { CommandContext } from './types';
import { projects } from '../../data/projects';

type Translations = ReturnType<typeof getTranslations>;

export interface ChatSource {
  /** content-dir-relative path, e.g. `projects/hrm.md`. */
  source: string;
  title?: string;
  project?: string | null;
}

export interface ChatHandlers {
  onSources?: (sources: ChatSource[]) => void;
  onToken: (text: string) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
  /** Called once per /chat response with the session context usage from the backend. */
  onContext?: (used: number, limit: number) => void;
}

interface FetchOpts {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

// How long the load-time health probe waits before deciding the backend is not
// available. The probe is async and only gates the optional chat reveal, so a
// longer wait costs nothing in the terminal's usability — and `/health` runs a
// real 1-token generation, which a cold model (VRAM warm-up) can take a few
// seconds to return. Generous on purpose so an up-but-cold backend isn't judged
// unavailable on the first visit; a truly-off backend refuses the connection
// immediately and never reaches this timeout.
const HEALTH_TIMEOUT_MS = 5000;

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

// The first `/health` probe is memoized so the initial gate decision is made
// once; `startChatAvailabilityPolling` then re-probes to keep
// `lastKnownAvailable` current, so the affordance can appear/disappear as the
// backend is toggled — without a reload.
let availabilityProbe: Promise<boolean> | null = null;
// The latest probed availability, updated by every probe (initial + polled).
// The dispatcher reads this (via `isChatAvailable`) so it tracks live on/off
// transitions, not just the load-time result.
let lastKnownAvailable = false;
// The model the backend reports via /health (e.g. "qwen2.5:7b"), or null when
// chat is unavailable. Surfaced in the prompt's live AI indicator.
let lastKnownModel: string | null = null;
// Latched true the first time a `/chat` call fails, forcing scripted-only for
// the rest of the session regardless of any later probe.
let sessionDisabled = false;

// Per-session identity sent with every /chat POST so the backend's Phase 4
// memory layer can thread turns without the frontend re-sending full history.
// Regenerated on reset/disable so the new session starts memory-clean.
// This id must be UNGUESSABLE, not merely unique: the backend keys its
// conversation memory on it, so anyone who can predict one can read or poison
// that session's context. The previous fallback used Math.random, which is not
// a CSPRNG — flagged by CodeQL as js/insecure-randomness. `getRandomValues` has
// shipped in every browser since ~2011, so the weak path bought nothing.
function newSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return `rag-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
  }
  // No CSPRNG at all: return EMPTY, which the backend reads as "no session".
  // `SessionMemory.history`/`record` both short-circuit on a falsy id, so this
  // turns conversation memory off rather than keying it on something weak.
  //
  // A constant placeholder would be worse than the Math.random it replaced:
  // every client without a CSPRNG would send the SAME id and therefore share
  // one server-side memory bucket, reading each other's turns. Unguessable or
  // absent are the only safe options; "unique-looking" is not one of them.
  return '';
}

let sessionId = newSessionId();

/** The session id included in every /chat POST body. Useful for tests. */
export function getSessionId(): string {
  return sessionId;
}

/** Force scripted-only for the rest of the session after a mid-session failure. */
export function disableChatForSession(): void {
  sessionDisabled = true;
  lastKnownAvailable = false;
  lastKnownModel = null;
  sessionId = newSessionId();
}

/** Test seam: clear the memoized probe + live state + disabled latch + session. */
export function resetChatStateForTests(): void {
  availabilityProbe = null;
  lastKnownAvailable = false;
  lastKnownModel = null;
  sessionDisabled = false;
  sessionId = newSessionId();
}

/**
 * Best-effort POST to /session/reset to clear the backend's conversation memory
 * for the current session, then regenerate the session id so the next turn
 * starts fresh. All errors are swallowed — if the backend is unreachable the
 * local state is still cleared, which is the important invariant.
 */
export async function resetChatSession(opts?: {
  fetchImpl?: typeof fetch;
}): Promise<void> {
  // Roll the local session state SYNCHRONOUSLY, before any await: a fire-and-forget
  // caller (Ctrl+L) lets the user submit the next turn immediately, and it must read
  // the NEW id — never the one still being reset. The POST uses the captured old id.
  const previous = sessionId;
  sessionId = newSessionId();
  const base = getChatBaseUrl();
  // Skip the POST when there was no session to reset: the reset endpoint
  // requires a non-empty id (min_length=1), so sending the empty id that means
  // "memory is off" would just earn a 422 the catch below silently eats.
  if (base && previous) {
    const f = opts?.fetchImpl ?? fetch;
    try {
      await f(`${base}/session/reset`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session_id: previous }),
        cache: 'no-store',
      });
    } catch {
      // Best-effort: a down backend shouldn't block the local clear.
    }
  }
}

/** The `/health` fields the terminal cares about: is the LLM answering, and which model. */
export interface HealthProbe {
  available: boolean;
  model: string | null;
}

/**
 * Shorten a backend model tag for the prompt badge. Registry-style Ollama tags
 * (`hf.co/mradermacher/Llama-Poro-2-8B-Instruct-GGUF:Q4_K_M`) overflow the
 * prompt line, so drop the registry path, a trailing `-GGUF` marker, and a
 * quantization tag — while keeping short size tags (`qwen2.5:7b` stays as-is),
 * which carry real information. The full tag belongs in the tooltip.
 */
export function displayModelName(model: string): string {
  const base = model.split('/').pop() ?? model;
  const colon = base.lastIndexOf(':');
  let name = colon === -1 ? base : base.slice(0, colon);
  const tag = colon === -1 ? '' : base.slice(colon + 1);
  name = name.replace(/-GGUF$/i, '');
  // Quant codes (Q4_K_M, IQ4_XS, F16, BF16…) are noise in a badge; size tags are not.
  const isQuant = /^(i?q\d|f(16|32)|bf16)/i.test(tag);
  return tag && !isQuant ? `${name}:${tag}` : name;
}

/**
 * Probe `${baseUrl}/health` for whether free chat should be enabled AND which
 * model is answering.
 *
 * `available` is true only on a 2xx within the timeout whose payload reports
 * `checks.llm === true`; `model` is the reported model name when available, else
 * null. Any failure resolves to `{ available: false, model: null }`. Never throws
 * and never logs: an unreachable backend is the expected state.
 */
export async function probeHealth(
  baseUrl: string,
  { fetchImpl = fetch, signal }: FetchOpts = {},
): Promise<HealthProbe> {
  try {
    const res = await fetchImpl(`${baseUrl}/health`, {
      cache: 'no-store',
      signal: signal ?? AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    if (!res.ok) return { available: false, model: null };
    const body: unknown = await res.json();
    const checks =
      typeof body === 'object' && body !== null && 'checks' in body
        ? (body as { checks?: unknown }).checks
        : null;
    const available =
      typeof checks === 'object' &&
      checks !== null &&
      (checks as { llm?: unknown }).llm === true;
    const rawModel =
      typeof body === 'object' && body !== null && 'model' in body
        ? (body as { model?: unknown }).model
        : null;
    const model = typeof rawModel === 'string' ? rawModel : null;
    return { available, model: available ? model : null };
  } catch {
    return { available: false, model: null };
  }
}

/**
 * Whether free chat is available this session (memoized).
 *
 * Resolves `false` immediately when no backend is configured or chat was
 * disabled mid-session — so the scripted-only path stays instant and the
 * `/health` probe only fires when a URL is actually set.
 */
export async function isChatAvailable(): Promise<boolean> {
  if (sessionDisabled) return false;
  const base = getChatBaseUrl();
  if (!base) return false;
  availabilityProbe ??= refreshAvailability(base);
  await availabilityProbe;
  // Reflect the latest probed value (which polling keeps current) rather than the
  // memoized first result, so the dispatcher tracks live on/off transitions.
  return lastKnownAvailable;
}

/** Run one `/health` probe and record the latest availability + model. */
async function refreshAvailability(base: string, opts: FetchOpts = {}): Promise<boolean> {
  const { available, model } = await probeHealth(base, opts);
  lastKnownAvailable = available;
  lastKnownModel = available ? model : null;
  return available;
}

// How often the live page re-checks the backend so the chat affordance can
// appear or disappear as the operator toggles the stack on/off — without a
// reload. Each probe reaches the chat backend (the operator's own machine, via
// the tunnel) — same-origin through the Vercel `/api/rag/*` rewrite since
// ADR 0012, so the edge relays it but the work lands on that box; 25s is a
// calm cadence.
const AVAILABILITY_POLL_MS = 25_000;
// Ceiling for the exponential backoff below: once the backend has been
// unreachable for a few probes, fall back to checking at most this often, so a
// down stack doesn't spam the console with failed /health requests (each logs a
// CORS/502 the browser surfaces regardless of our try/catch).
const MAX_AVAILABILITY_POLL_MS = 240_000;

export interface AvailabilityPollOpts {
  intervalMs?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

/**
 * Keep the chat affordance in sync with the backend's live state — no reload.
 *
 * Probes `/health` immediately, then on an interval and whenever the tab regains
 * focus, calling `onChange(available, model)` only when availability OR the model
 * name changes. This is what makes the "ask about the projects" hint and the
 * "● ai · <model>" badge appear within one interval of the backend coming up,
 * update when the model is switched, and disappear when it goes away.
 *
 * Inert when no backend is configured (nothing probes, `onChange` never fires —
 * the terminal stays pixel-identical to today), and reports `false` once chat
 * has been disabled for the session after a failed turn. Cleanup is via
 * `opts.signal` (the terminal's AbortController): on abort the interval and the
 * visibility listener are removed and no further probes run.
 */
export function startChatAvailabilityPolling(
  onChange: (available: boolean, model: string | null) => void,
  { intervalMs = AVAILABILITY_POLL_MS, signal, fetchImpl }: AvailabilityPollOpts = {},
): void {
  // Bail if already torn down: addEventListener('abort') on an already-aborted
  // signal never fires, so the interval/listener below would leak uncleaned.
  if (signal?.aborted) return;
  const base = getChatBaseUrl();
  if (!base) return; // No backend -> nothing to reveal, ever.

  // Tracks what the hint currently reflects (nothing shown yet = false), not the
  // module-level probe state, so the first "available" result always reveals.
  let last = false;
  let lastModel: string | null = null;
  // Exponential backoff: each consecutive failed probe doubles the gap (capped at
  // MAX_AVAILABILITY_POLL_MS), so a backend that stays down isn't hammered with
  // /health requests that each log a console error. Resets to the base cadence on
  // the first success, so coming-back-up is still noticed within `intervalMs`.
  // `failures` is an unbounded counter, but the delay is doubly bounded (the
  // 2**min(failures,5) exponent ceiling and the outer Math.min), so it can't
  // overflow into a problem.
  let failures = 0;
  let ticking = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    if (signal?.aborted) return;
    const delay = Math.min(
      intervalMs * 2 ** Math.min(failures, 5),
      MAX_AVAILABILITY_POLL_MS,
    );
    timer = setTimeout(() => void tick(), delay);
  };

  // Read fresh on every call — never a narrowed literal — so the getter's live
  // value is honoured after an await, and the finally check below isn't seen by
  // TS as an impossible comparison against the guard's narrowing.
  const isHidden = (): boolean => document.visibilityState === 'hidden';

  const tick = async (): Promise<void> => {
    // Re-entrancy guard: a visibilitychange can fire mid-probe; serialising keeps
    // `failures`/`last` race-free and avoids a doubled in-flight request.
    if (signal?.aborted || ticking) return;
    // Pause while the tab is hidden. An unattended or backgrounded tab left open
    // (overnight, say) would otherwise probe /health forever — and every probe is
    // a fresh TLS connection over the funnel plus a real 1-token LLM completion
    // server-side. Returning WITHOUT rescheduling stops the loop; `onVisibility`
    // restarts it the moment the tab is looked at again, so a watching user still
    // sees the indicator refresh within one interval.
    if (isHidden()) return;
    ticking = true;
    try {
      const probe = sessionDisabled
        ? Promise.resolve(false)
        : refreshAvailability(base, { fetchImpl });
      // Let the first poll satisfy `isChatAvailable`'s memo, so the dispatcher and
      // the poller share one initial probe rather than each firing its own.
      availabilityProbe ??= probe;
      const available = await probe;
      if (signal?.aborted) return;
      failures = available ? 0 : failures + 1;
      const model = available ? lastKnownModel : null;
      // Fire on a change to EITHER availability or the model, so the indicator
      // updates when the operator switches models even while chat stays up.
      if (available !== last || model !== lastModel) {
        last = available;
        lastModel = model;
        onChange(available, model);
      }
    } finally {
      ticking = false;
      // Don't re-arm while hidden. If the tab was hidden mid-probe, stop cleanly
      // rather than leaving a timer that would fire one more (no-op) tick;
      // onVisibility restarts the loop on 'visible'.
      if (!isHidden()) schedule();
    }
  };

  void tick();
  const onVisibility = (): void => {
    if (!isHidden()) {
      void tick();
    } else if (timer !== undefined) {
      // Cancel the pending probe the instant the tab is hidden, so not even one
      // more request fires while nobody is watching.
      clearTimeout(timer);
      timer = undefined;
    }
  };
  document.addEventListener('visibilitychange', onVisibility);
  signal?.addEventListener(
    'abort',
    () => {
      if (timer !== undefined) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    },
    { once: true },
  );
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
    case 'context': {
      const ctxFrame = safeParseContext(ev.data);
      if (ctxFrame && handlers.onContext)
        handlers.onContext(ctxFrame.used, ctxFrame.limit);
      break;
    }
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
 * Parse a `context` SSE frame. Returns null when the payload is missing, not
 * valid JSON, or the numbers are out of range (non-finite, negative used, or
 * non-positive limit). The donut is only updated on valid frames.
 */
export function safeParseContext(data: string): { used: number; limit: number } | null {
  try {
    const parsed: unknown = JSON.parse(data);
    if (!parsed || typeof parsed !== 'object') return null;
    const obj = parsed as Record<string, unknown>;
    const used = obj['used'];
    const limit = obj['limit'];
    if (
      typeof used !== 'number' ||
      typeof limit !== 'number' ||
      !isFinite(used) ||
      !isFinite(limit) ||
      used < 0 ||
      limit <= 0
    ) {
      return null;
    }
    return { used, limit };
  } catch {
    return null;
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
  handlers: ChatHandlers,
  { fetchImpl = fetch, signal }: FetchOpts = {},
): Promise<void> {
  const res = await fetchImpl(`${baseUrl}/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    // session_id only. The backend threads prior turns from its own memory and
    // no longer accepts a client-supplied `history`: on an unauthenticated
    // endpoint that let anyone hand the model text it is told is its own prior
    // output, and the server cannot tell the difference.
    body: JSON.stringify({ message, session_id: sessionId }),
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

/**
 * Per-project external URL (repo preferred, else live site), built once from the
 * version-controlled `projects.ts`. Used to make citations clickable. These hrefs
 * are build-time-trusted (they ship in the bundle), never user/model input.
 */
export const PROJECT_URLS: Record<string, string> = Object.fromEntries(
  projects
    .map((p): [string, string | undefined] => [p.id, p.githubUrl ?? p.liveUrl])
    .filter((e): e is [string, string] => typeof e[1] === 'string'),
);

/**
 * Locale-aware on-site path to the /projects galaxy, carrying the project id as a
 * `?id=` query. The galaxy doesn't focus by id on load today, so this currently
 * lands on /projects generally — it's forward-compatible if a focus-on-load
 * handler is added, and the locale prefix keeps Finnish visitors on their locale.
 */
function onsiteProjectPath(projectId: string): string {
  const lang = document.documentElement.lang;
  const prefix = lang && lang !== 'en' ? `/${lang}` : '';
  return `${prefix}/projects?id=${encodeURIComponent(projectId)}`;
}

/** Dedupe retrieved sources by their rendered ref, preserving order + project id. */
function dedupeSources(sources: ChatSource[]): ChatSource[] {
  const seen = new Set<string>();
  const out: ChatSource[] = [];
  for (const s of sources) {
    const ref = formatSourceRef(s.source);
    if (!seen.has(ref)) {
      seen.add(ref);
      out.push(s);
    }
  }
  return out;
}

/**
 * Append one source citation line. A project-mapped source becomes two links:
 * the "→ projects/hrm" label deep-links on-site to the /projects galaxy, and a
 * trailing "↗" opens the repo/live URL in a new tab. Built via DOM with
 * `textContent` labels + build-time-trusted hrefs — never `innerHTML`, so it is
 * not an XSS sink. Unmapped sources (cv, posts) stay plain dim text.
 */
function appendSourceCitation(output: HTMLElement, source: ChatSource): void {
  const label = formatSourceRef(source.source);
  const line = document.createElement('span');
  line.className = 'line line--dim';
  const externalUrl = source.project ? PROJECT_URLS[source.project] : undefined;
  if (source.project && externalUrl) {
    const onsite = document.createElement('a');
    onsite.className = 'chat-cite';
    onsite.href = onsiteProjectPath(source.project);
    onsite.textContent = label;
    line.appendChild(onsite);

    const repo = document.createElement('a');
    repo.className = 'chat-cite-ext';
    repo.href = externalUrl;
    repo.target = '_blank';
    repo.rel = 'noopener noreferrer';
    repo.textContent = ' ↗';
    repo.setAttribute('aria-label', `${label} — open repository`);
    line.appendChild(repo);
  } else {
    line.textContent = label;
  }
  output.appendChild(line);
  output.appendChild(document.createTextNode('\n'));
  output.scrollTop = output.scrollHeight;
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
 *
 * `onContext` receives the context usage numbers from the `context` SSE frame
 * that the backend emits after the answer. The donut updates ONLY from this
 * real frame, never from a guess.
 */
export async function askChat(
  message: string,
  ctx: CommandContext,
  output: HTMLElement,
  t: Translations,
  opts: FetchOpts = {},
  onContext?: (used: number, limit: number) => void,
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
    onContext,
  };

  try {
    await streamChat(base, message, handlers, opts);
    if (failed || !started) {
      // An `error` frame, or a stream that closed before any token, is treated
      // as a failed turn: show the clean line and degrade.
      throw new Error('empty or failed chat response');
    }
    const cited = dedupeSources(collected);
    if (cited.length > 0) {
      ctx.print('');
      for (const source of cited) appendSourceCitation(output, source);
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
 *
 * `reset` clears the backend session and local history (called by `clear`).
 * `setContextCallback` wires the donut: Terminal.astro calls this once after
 * creating the router so every `ask` turn updates the context bar automatically.
 */
export interface ChatRouter {
  isAvailable: () => Promise<boolean>;
  ask: (
    message: string,
    ctx: CommandContext,
    output: HTMLElement,
    t: Translations,
  ) => Promise<void>;
  reset: () => Promise<void>;
  setContextCallback: (fn: (used: number, limit: number) => void) => void;
}

/** The production chat router: session-memoized availability + streamed answers. */
export function createChatRouter(): ChatRouter {
  let contextCb: ((used: number, limit: number) => void) | undefined;
  return {
    isAvailable: isChatAvailable,
    ask: (message, ctx, output, t) => askChat(message, ctx, output, t, {}, contextCb),
    reset: () => resetChatSession(),
    setContextCallback: (fn) => {
      contextCb = fn;
    },
  };
}
