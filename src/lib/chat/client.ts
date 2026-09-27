/**
 * Transport for the RAG chat backend: base URL, session identity, the `/health`
 * probe, the SSE parser and the streamed `/chat` call.
 *
 * Shared by every chat surface (the contact terminal, the mobile contact card,
 * the /takaovi page). It holds no UI and no policy: when to probe, how to show
 * an answer and what to do after a failure are each surface's own decisions.
 * The terminal's "degrade to scripted-only for the rest of the session" latch,
 * for example, lives in `terminal/chat.ts`, because a page with a retry button
 * must not inherit it.
 *
 * Nothing here imports site data, so a surface that only chats does not pull
 * the projects catalogue into its bundle.
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

export interface ChatFetchOpts {
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

// --- session identity -------------------------------------------------------

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

/** Start a new, memory-clean session locally, without telling the backend. */
export function rotateSessionId(): void {
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

// --- health -------------------------------------------------------------------

/** The `/health` fields a chat surface cares about: is the LLM answering, and which model. */
export interface HealthProbe {
  available: boolean;
  model: string | null;
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
  { fetchImpl = fetch, signal }: ChatFetchOpts = {},
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
 * A `/chat` request the backend answered with a non-2xx status (or no body).
 * Carries the status so a surface can tell "rate limited" (429) apart from
 * "down"; a network failure throws the fetch error instead, with no status.
 */
export class ChatRequestError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`chat request failed (${status})`);
    this.name = 'ChatRequestError';
    this.status = status;
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
  { fetchImpl = fetch, signal }: ChatFetchOpts = {},
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
    throw new ChatRequestError(res.status);
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
