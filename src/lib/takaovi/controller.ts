/**
 * Conversation state for the /takaovi chat page, with no DOM in it.
 *
 * The page talks to the same backend the contact terminal does, through the
 * shared transport in `../chat/client`, and sends exactly what the terminal
 * sends: the question and the session id. What differs is policy, and it
 * lives here:
 *
 *   - A failed turn is retried on request, never latched off for the session.
 *   - `/health` is probed once on load and again on an explicit retry, never on
 *     a timer. The backend rate-limits per IP, all routes counted, and an
 *     office shares one public IP, so polling tabs would eat the quota the
 *     questions need.
 *   - A health probe that fails only raises a notice. Asking stays allowed: a
 *     cold model can miss the probe's timeout and still answer.
 *   - A stream that goes quiet is aborted, so a hung tunnel ends in a
 *     retryable error instead of a turn that spins forever.
 *
 * The view subscribes and renders; tests drive this module with fakes.
 */
import {
  ChatRequestError,
  probeHealth,
  resetChatSession,
  streamChat,
  type ChatHandlers,
  type ChatSource,
  type HealthProbe,
} from '../chat/client';

export type TurnStatus = 'thinking' | 'streaming' | 'done' | 'error';
export type TurnError = 'unavailable' | 'rate-limited' | 'failed' | 'timeout';
/** `unconfigured`: the build has no backend URL, so nothing can be asked. */
export type Availability = 'unknown' | 'up' | 'down' | 'unconfigured';

export interface Turn {
  readonly id: number;
  readonly question: string;
  answer: string;
  sources: string[];
  status: TurnStatus;
  error?: TurnError;
}

export type ChatEvent =
  | { type: 'turn-added'; turn: Turn }
  | { type: 'token'; turn: Turn; text: string }
  | { type: 'turn-changed'; turn: Turn }
  | { type: 'availability'; availability: Availability }
  | { type: 'cleared' };

export interface ControllerDeps {
  baseUrl: string | null;
  stream?: typeof streamChat;
  probe?: (baseUrl: string) => Promise<HealthProbe>;
  resetSession?: () => Promise<void>;
  /** Abort a turn when no token has arrived for this long. */
  idleTimeoutMs?: number;
}

export interface ChatController {
  readonly turns: readonly Turn[];
  readonly availability: Availability;
  readonly busy: boolean;
  subscribe(listener: (event: ChatEvent) => void): () => void;
  checkHealth(): Promise<void>;
  /** Ignored when blank or while a turn is in flight. */
  ask(question: string): Promise<void>;
  /** Re-ask the last turn's question in place, when that turn failed. */
  retry(): Promise<void>;
  /** Cancel anything in flight, forget the conversation here and on the backend. */
  restart(): Promise<void>;
  dispose(): void;
}

// Poro's first token can take a while on a cold model, and a long answer can
// pause between tokens under load. A minute of silence is past both and still
// short enough that someone watching gets an answer about what happened.
const IDLE_TIMEOUT_MS = 60_000;
const MAX_SOURCE_LABELS = 4;
const MAX_LABEL_LENGTH = 40;

/** Short, de-duplicated labels for the documents an answer drew on. */
export function sourceLabels(sources: readonly ChatSource[]): string[] {
  const labels: string[] = [];
  for (const s of sources) {
    const file = s.source.split('/').pop() ?? s.source;
    let label = file === 'cv.md' ? 'CV' : (s.title ?? '').trim();
    if (!label) label = file.replace(/\.md$/, '').replace(/[-_]+/g, ' ');
    if (label.length > MAX_LABEL_LENGTH) {
      label = `${label.slice(0, MAX_LABEL_LENGTH - 1).trimEnd()}…`;
    }
    if (!labels.includes(label)) labels.push(label);
    if (labels.length === MAX_SOURCE_LABELS) break;
  }
  return labels;
}

function classify(err: unknown, timedOut: boolean): TurnError {
  if (timedOut) return 'timeout';
  if (err instanceof ChatRequestError) {
    if (err.status === 429) return 'rate-limited';
    // The Vercel rewrite answers 5xx when the tunnel or the stack is down.
    return err.status >= 500 ? 'unavailable' : 'failed';
  }
  // fetch rejects with a TypeError when the network or the rewrite target is
  // unreachable; anything else thrown here is a broken stream.
  return err instanceof TypeError ? 'unavailable' : 'failed';
}

export function createChatController(deps: ControllerDeps): ChatController {
  const stream = deps.stream ?? streamChat;
  const probe = deps.probe ?? ((base: string) => probeHealth(base));
  const resetSession = deps.resetSession ?? (() => resetChatSession());
  const idleTimeoutMs = deps.idleTimeoutMs ?? IDLE_TIMEOUT_MS;

  const turns: Turn[] = [];
  const listeners = new Set<(event: ChatEvent) => void>();
  let availability: Availability = deps.baseUrl ? 'unknown' : 'unconfigured';
  let nextId = 1;
  let inFlight: AbortController | null = null;
  // Bumped by restart(): a probe or turn that started before it must not write
  // into the conversation that replaced it.
  let generation = 0;
  // Bumped whenever a turn settles. A health probe that started before the
  // latest turn settled carries older news than that turn and is dropped: a
  // slow cold-start probe must not raise "down" under an answer that arrived.
  let settled = 0;
  let disposed = false;

  const emit = (event: ChatEvent): void => {
    for (const l of listeners) l(event);
  };

  const setAvailability = (next: Availability): void => {
    if (next === availability) return;
    availability = next;
    emit({ type: 'availability', availability });
  };

  // The caller claims `inFlight` BEFORE emitting anything, so no listener can
  // observe a turn on screen while `busy` still reads false.
  async function run(turn: Turn, abort: AbortController): Promise<void> {
    const base = deps.baseUrl;
    if (!base) {
      turn.status = 'error';
      turn.error = 'unavailable';
      if (inFlight === abort) inFlight = null;
      emit({ type: 'turn-changed', turn });
      return;
    }
    const gen = generation;
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        timedOut = true;
        abort.abort();
      }, idleTimeoutMs);
    };
    const live = (): boolean => gen === generation && !disposed;

    let failedFrame = false;
    let collected: ChatSource[] = [];
    const handlers: ChatHandlers = {
      onSources: (sources) => {
        collected = sources;
      },
      onToken: (text) => {
        if (!live()) return;
        arm();
        if (turn.status === 'thinking') {
          turn.status = 'streaming';
          emit({ type: 'turn-changed', turn });
        }
        turn.answer += text;
        emit({ type: 'token', turn, text });
      },
      onError: () => {
        failedFrame = true;
      },
    };

    arm();
    try {
      await stream(base, turn.question, handlers, { signal: abort.signal });
      if (!live()) return;
      if (failedFrame || turn.answer.trim() === '')
        throw new Error('empty or failed answer');
      turn.status = 'done';
      turn.sources = sourceLabels(collected);
      settled++;
      setAvailability('up');
      emit({ type: 'turn-changed', turn });
    } catch (err) {
      if (!live()) return;
      turn.status = 'error';
      turn.error = classify(err, timedOut);
      settled++;
      if (turn.error === 'unavailable') setAvailability('down');
      emit({ type: 'turn-changed', turn });
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      if (inFlight === abort) inFlight = null;
    }
  }

  return {
    get turns() {
      return turns;
    },
    get availability() {
      return availability;
    },
    get busy() {
      return inFlight !== null;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async checkHealth() {
      const base = deps.baseUrl;
      if (!base || disposed) return;
      const gen = generation;
      const before = settled;
      const { available } = await probe(base);
      if (gen !== generation || before !== settled || disposed) return;
      setAvailability(available ? 'up' : 'down');
    },
    async ask(question) {
      const q = question.trim();
      if (!q || inFlight || disposed) return;
      const abort = new AbortController();
      inFlight = abort;
      const turn: Turn = {
        id: nextId++,
        question: q,
        answer: '',
        sources: [],
        status: 'thinking',
      };
      turns.push(turn);
      emit({ type: 'turn-added', turn });
      await run(turn, abort);
    },
    async retry() {
      const turn = turns[turns.length - 1];
      if (!turn || turn.status !== 'error' || inFlight || disposed) return;
      const abort = new AbortController();
      inFlight = abort;
      turn.answer = '';
      turn.sources = [];
      turn.status = 'thinking';
      delete turn.error;
      emit({ type: 'turn-changed', turn });
      await run(turn, abort);
    },
    async restart() {
      if (disposed) return;
      generation++;
      inFlight?.abort();
      inFlight = null;
      turns.length = 0;
      emit({ type: 'cleared' });
      await resetSession();
    },
    dispose() {
      disposed = true;
      generation++;
      inFlight?.abort();
      inFlight = null;
      listeners.clear();
    },
  };
}
