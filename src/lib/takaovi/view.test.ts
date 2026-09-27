import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Availability, ChatController, ChatEvent, Turn } from './controller';
import { mountTakaoviChat } from './view';

/**
 * The view is where the page meets the visitor: which button retries which
 * turn, where focus goes, when the thread scrolls. The controller tests cannot
 * see any of that, so this file mounts the real view on the page's markup
 * (reduced to the data hooks `view.ts` reads) and drives it with a fake
 * controller whose events the test emits by hand.
 */

const MARKUP = `
  <div class="tk-app" data-takaovi>
    <ul><li><button type="button" data-question="Kysymys A">Kysymys A</button></li></ul>
    <div data-scroll>
      <button type="button" data-restart hidden>Aloita alusta</button>
      <div data-notice></div>
      <p data-empty>Tyhjä</p>
      <div data-log role="log" aria-live="off"></div>
    </div>
    <div data-composer-shell>
      <form data-composer>
        <textarea data-input></textarea>
        <button type="submit" data-send>Kysy</button>
      </form>
    </div>
    <p data-live></p>
    <template data-avatar-template><span class="tk-avatar"></span></template>
  </div>`;

interface FakeController extends ChatController {
  emit(event: ChatEvent): void;
  setAvailability(next: Availability): void;
  retryCalls: number;
  checkHealthCalls: number;
}

function fakeController(): FakeController {
  const listeners = new Set<(e: ChatEvent) => void>();
  let availability: Availability = 'unknown';
  let busy = false;
  const fake: FakeController = {
    turns: [],
    get availability() {
      return availability;
    },
    get busy() {
      return busy;
    },
    retryCalls: 0,
    checkHealthCalls: 0,
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    async checkHealth() {
      fake.checkHealthCalls++;
    },
    async ask() {},
    async retry() {
      fake.retryCalls++;
    },
    async restart() {},
    dispose() {},
    emit(event) {
      if (event.type === 'turn-added') busy = true;
      if (event.type === 'turn-changed') {
        busy = event.turn.status === 'thinking' || event.turn.status === 'streaming';
      }
      for (const l of listeners) l(event);
    },
    setAvailability(next) {
      availability = next;
      fake.emit({ type: 'availability', availability: next });
    },
  };
  return fake;
}

function turn(id: number, patch: Partial<Turn> = {}): Turn {
  return {
    id,
    question: `Kysymys ${id}`,
    answer: '',
    sources: [],
    status: 'thinking',
    ...patch,
  };
}

let root: HTMLElement;
let controller: FakeController;
let unmount: () => void;

beforeEach(() => {
  // jsdom lays nothing out and has no scrollTo on elements; the view only
  // needs the call to exist.
  Element.prototype.scrollTo = vi.fn();
  document.body.innerHTML = MARKUP;
  root = document.querySelector<HTMLElement>('[data-takaovi]')!;
  controller = fakeController();
  unmount = mountTakaoviChat(root, { controller });
});

afterEach(() => {
  unmount();
  document.body.innerHTML = '';
});

describe('retry buttons', () => {
  it('only the latest failed turn offers a retry, so a button never retries a different question', () => {
    // Before the fix, turn 1's button stayed after turn 2 failed too, and the
    // controller (which always retries the last turn) re-sent question 2.
    const t1 = turn(1);
    controller.emit({ type: 'turn-added', turn: t1 });
    controller.emit({
      type: 'turn-changed',
      turn: { ...t1, status: 'error', error: 'failed' },
    });
    const t2 = turn(2);
    controller.emit({ type: 'turn-added', turn: t2 });
    controller.emit({
      type: 'turn-changed',
      turn: { ...t2, status: 'error', error: 'failed' },
    });

    const buttons = root.querySelectorAll<HTMLButtonElement>('[data-retry]');
    expect(buttons).toHaveLength(1);
    const log = root.querySelector('[data-log]')!;
    expect(buttons[0]!.closest('.tk-msg--bot')).toBe(log.lastElementChild);
    // The older alert keeps its message; only the action went away.
    expect(root.querySelectorAll('.tk-alert')).toHaveLength(2);

    buttons[0]!.click();
    expect(controller.retryCalls).toBe(1);
  });
});

describe('keeping the latest message in view', () => {
  it('scrolls to an error card that arrives while the visitor is at the bottom', () => {
    // A fake page: 800 px tall viewport, scrolled to the bottom of a 1000 px
    // document that grows by 300 px per error card, taller than the 140 px
    // stick threshold. Deciding "near the bottom" after the card is in the
    // DOM would leave the retry button under the fixed composer.
    const page = document.documentElement;
    Object.defineProperty(page, 'clientHeight', { configurable: true, value: 800 });
    Object.defineProperty(page, 'scrollHeight', {
      configurable: true,
      get: () => 1000 + 300 * document.querySelectorAll('.tk-alert').length,
    });
    page.scrollTop = 200;
    const scrollTo = vi.mocked(Element.prototype.scrollTo);

    const t1 = turn(1);
    controller.emit({ type: 'turn-added', turn: t1 });
    scrollTo.mockClear();
    controller.emit({
      type: 'turn-changed',
      turn: { ...t1, status: 'error', error: 'timeout' },
    });

    expect(scrollTo).toHaveBeenCalled();
    Reflect.deleteProperty(page, 'clientHeight');
    Reflect.deleteProperty(page, 'scrollHeight');
  });
});
