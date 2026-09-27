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
 *
 * The transport (base URL, session id, /health probe, SSE parser, streamChat)
 * lives in `../chat/client` and is re-exported here, so existing importers keep
 * one entry point. What stays in this file is terminal policy: the availability
 * poll, the degrade-for-the-session latch, and rendering answers and citations.
 */

import type { getTranslations } from '../../i18n';
import type { CommandContext } from './types';
import { projects } from '../../data/projects';
import {
  getChatBaseUrl,
  probeHealth,
  resetChatSession,
  rotateSessionId,
  streamChat,
  type ChatFetchOpts,
  type ChatHandlers,
  type ChatSource,
} from '../chat/client';

export {
  createSSEParser,
  getChatBaseUrl,
  getSessionId,
  probeHealth,
  resetChatSession,
  safeParseContext,
  streamChat,
} from '../chat/client';
export type { ChatHandlers, ChatSource, HealthProbe, SSEEvent } from '../chat/client';

type FetchOpts = ChatFetchOpts;

type Translations = ReturnType<typeof getTranslations>;

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

/** Force scripted-only for the rest of the session after a mid-session failure. */
export function disableChatForSession(): void {
  sessionDisabled = true;
  lastKnownAvailable = false;
  lastKnownModel = null;
  rotateSessionId();
}

/** Test seam: clear the memoized probe + live state + disabled latch + session. */
export function resetChatStateForTests(): void {
  availabilityProbe = null;
  lastKnownAvailable = false;
  lastKnownModel = null;
  sessionDisabled = false;
  rotateSessionId();
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
