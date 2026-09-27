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
    try {
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
    } finally {
      // Faked on the shared document; left behind, it would skew later tests.
      Reflect.deleteProperty(page, 'clientHeight');
      Reflect.deleteProperty(page, 'scrollHeight');
    }
  });
});

describe('following a streamed answer', () => {
  it('jumps rather than animates on each token', () => {
    const scrollTo = vi.mocked(Element.prototype.scrollTo);
    const t1 = turn(1);
    controller.emit({ type: 'turn-added', turn: t1 });
    const streaming = { ...t1, status: 'streaming' as const };
    controller.emit({ type: 'turn-changed', turn: streaming });
    scrollTo.mockClear();
    controller.emit({ type: 'token', turn: streaming, text: 'Hei' });

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }));
  });
});

describe('the availability notice', () => {
  it('keeps focus on a recheck in progress and hands it on when the notice clears', async () => {
    // Through a real click this time. The first version disabled the button
    // while the probe ran, and a browser moves focus off a control the moment
    // it is disabled, so focus was already on <body> when the notice cleared.
    let settle: () => void = () => {};
    controller.checkHealth = () =>
      new Promise<void>((resolve) => {
        settle = () => {
          controller.setAvailability('up');
          resolve();
        };
      });
    controller.setAvailability('down');
    const recheck = root.querySelector<HTMLButtonElement>('[data-notice] button')!;
    recheck.focus();

    recheck.click();
    expect(recheck.disabled).toBe(false);
    expect(recheck.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(recheck);

    settle();
    await Promise.resolve();

    expect(root.querySelector('[data-notice]')!.childElementCount).toBe(0);
    // A question card, not the composer: focusing the textarea would open the
    // keyboard on Android without being asked.
    expect(document.activeElement).toBe(root.querySelector('[data-question]'));
  });
});

describe('Enter in the composer', () => {
  it('sends the question even where form.requestSubmit is missing (Safari before 16)', () => {
    const asked: string[] = [];
    controller.ask = async (q: string) => {
      asked.push(q);
    };
    const form = root.querySelector<HTMLFormElement>('[data-composer]')!;
    Object.defineProperty(form, 'requestSubmit', {
      configurable: true,
      value: undefined,
    });
    const input = root.querySelector<HTMLTextAreaElement>('[data-input]')!;
    input.value = 'Mitä Mikko tekee?';

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(asked).toEqual(['Mitä Mikko tekee?']);
  });
});
