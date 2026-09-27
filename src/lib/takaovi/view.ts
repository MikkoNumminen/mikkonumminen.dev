/**
 * DOM binding for the /takaovi chat: renders controller events into the markup
 * from `TakaoviIntro.astro` and `ChatThread.astro`, and turns taps and key
 * presses into controller calls.
 *
 * Everything the model or the visitor wrote goes in through `textContent` or
 * text nodes, never `innerHTML`. Focus is only moved when the element holding
 * it is about to disappear (a retry button, the restart button); an arriving
 * answer never steals it from the composer, so a phone keyboard stays open.
 */
import { getChatBaseUrl } from '../chat/client';
import { takaoviCopy, type TakaoviCopy } from '../../data/takaovi';
import { createChatController, type ChatController, type Turn } from './controller';

interface TurnView {
  root: HTMLElement;
  body: HTMLElement;
  typing: HTMLElement | null;
  bubble: HTMLElement | null;
  text: HTMLElement | null;
  caret: HTMLElement | null;
  extra: HTMLElement | null;
}

// Within this distance of the bottom, new content keeps the view pinned there.
// Further up, the visitor is reading back and is left alone.
const STICK_PX = 140;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function need<T extends Element>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`takaovi view: missing ${selector}`);
  return found;
}

export interface MountOptions {
  controller?: ChatController;
  copy?: TakaoviCopy;
}

export function mountTakaoviChat(root: HTMLElement, opts: MountOptions = {}): () => void {
  const copy = opts.copy ?? takaoviCopy;
  const controller =
    opts.controller ?? createChatController({ baseUrl: getChatBaseUrl() });
  const doc = root.ownerDocument;
  const html = doc.documentElement;
  const log = need<HTMLElement>(root, '[data-log]');
  const empty = need<HTMLElement>(root, '[data-empty]');
  const notice = need<HTMLElement>(root, '[data-notice]');
  const live = need<HTMLElement>(root, '[data-live]');
  const form = need<HTMLFormElement>(root, '[data-composer]');
  const input = need<HTMLTextAreaElement>(root, '[data-input]');
  const send = need<HTMLButtonElement>(root, '[data-send]');
  const restart = need<HTMLButtonElement>(root, '[data-restart]');
  const scrollBox = need<HTMLElement>(root, '[data-scroll]');
  const shell = need<HTMLElement>(root, '[data-composer-shell]');
  const avatarTemplate = need<HTMLTemplateElement>(root, '[data-avatar-template]');
  const views = new Map<number, TurnView>();
  const cleanups: Array<() => void> = [];
  const reduceMotion = doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)');

  // The desktop layout scrolls the thread in its own column; on a phone the
  // whole document scrolls. Whichever actually overflows is the one to pin.
  const scroller = (): HTMLElement => {
    const style = doc.defaultView?.getComputedStyle(scrollBox);
    if (
      style &&
      style.overflowY !== 'visible' &&
      scrollBox.scrollHeight > scrollBox.clientHeight + 1
    ) {
      return scrollBox;
    }
    const page = doc.scrollingElement;
    return page instanceof HTMLElement ? page : html;
  };
  const nearBottom = (): boolean => {
    const s = scroller();
    return s.scrollHeight - s.scrollTop - s.clientHeight < STICK_PX;
  };
  const toBottom = (force = false): void => {
    if (!force && !nearBottom()) return;
    const s = scroller();
    s.scrollTo({
      top: s.scrollHeight,
      behavior: reduceMotion?.matches ? 'auto' : 'smooth',
    });
  };

  const announce = (message: string): void => {
    // Clear first so an identical message is still read out again.
    live.textContent = '';
    doc.defaultView?.setTimeout(() => {
      live.textContent = message;
    }, 60);
  };

  const setBusy = (busy: boolean): void => {
    root.toggleAttribute('data-busy', busy);
    send.setAttribute('aria-disabled', String(busy));
    log.setAttribute('aria-busy', String(busy));
  };

  const setHasChat = (has: boolean): void => {
    html.classList.toggle('tk-has-chat', has);
    empty.hidden = has;
    restart.hidden = !has;
  };

  const avatar = (): Node => avatarTemplate.content.cloneNode(true);

  function addTurn(turn: Turn): void {
    const user = el('div', 'tk-msg tk-msg--user');
    user.append(
      el('span', 'tk-sr', `${copy.thread.you}:`),
      el('p', 'tk-bubble', turn.question),
    );

    const bot = el('div', 'tk-msg tk-msg--bot');
    bot.tabIndex = -1;
    bot.append(avatar());
    const body = el('div', 'tk-msg__body');
    body.append(el('span', 'tk-sr', `${copy.thread.assistant}:`));
    bot.append(body);

    log.append(user, bot);
    const view: TurnView = {
      root: bot,
      body,
      typing: null,
      bubble: null,
      text: null,
      caret: null,
      extra: null,
    };
    views.set(turn.id, view);
    showThinking(view);
    setHasChat(true);
    toBottom(true);
  }

  function showThinking(view: TurnView): void {
    view.bubble?.remove();
    view.extra?.remove();
    view.bubble = view.text = view.caret = view.extra = null;
    view.root.classList.add('is-thinking');
    const typing = el('div', 'tk-typing');
    typing.setAttribute('aria-hidden', 'true');
    typing.append(el('i'), el('i'), el('i'));
    view.body.append(typing);
    view.typing = typing;
  }

  function showStreaming(view: TurnView): void {
    view.typing?.remove();
    view.typing = null;
    view.root.classList.remove('is-thinking');
    if (view.bubble) return;
    const bubble = el('p', 'tk-bubble');
    const text = el('span');
    const caret = el('span', 'tk-caret');
    caret.setAttribute('aria-hidden', 'true');
    bubble.append(text, caret);
    view.body.append(bubble);
    view.bubble = bubble;
    view.text = text;
    view.caret = caret;
  }

  function finish(turn: Turn, view: TurnView): void {
    view.typing?.remove();
    view.typing = null;
    view.root.classList.remove('is-thinking');
    view.caret?.remove();
    view.caret = null;

    if (turn.status === 'done') {
      if (turn.sources.length > 0) {
        const sources = el('div', 'tk-sources');
        sources.append(el('span', 'tk-sources__label', copy.thread.sources));
        for (const label of turn.sources) sources.append(el('span', 'tk-source', label));
        view.body.append(sources);
        view.extra = sources;
      }
      announce(`${copy.thread.answered} ${turn.answer}`);
      return;
    }

    if (turn.status === 'error' && turn.error) {
      if (view.bubble && !turn.answer.trim()) {
        view.bubble.remove();
        view.bubble = view.text = null;
      }
      const message = copy.errors[turn.error];
      const alert = el('div', 'tk-alert');
      alert.setAttribute('role', 'alert');
      alert.append(
        el('p', 'tk-alert__title', message.title),
        el('p', 'tk-alert__text', message.text),
      );
      const retry = el('button', 'tk-alert__retry', copy.retry);
      retry.type = 'button';
      retry.dataset.retry = '';
      alert.append(retry);
      view.body.append(alert);
      view.extra = alert;
    }
  }

  function renderNotice(): void {
    notice.replaceChildren();
    const state = controller.availability;
    if (state !== 'down' && state !== 'unconfigured') return;
    const message = state === 'down' ? copy.notices.down : copy.notices.unconfigured;
    const box = el('div', 'tk-notice');
    box.setAttribute('role', 'status');
    box.append(
      el('p', 'tk-notice__title', message.title),
      el('p', 'tk-notice__text', message.text),
    );
    if (state === 'down') {
      const recheck = el('button', 'tk-notice__recheck', copy.notices.recheck);
      recheck.type = 'button';
      recheck.addEventListener('click', () => {
        recheck.disabled = true;
        void controller.checkHealth().finally(() => {
          recheck.disabled = false;
        });
      });
      box.append(recheck);
    }
    notice.append(box);
  }

  const unsubscribe = controller.subscribe((event) => {
    switch (event.type) {
      case 'turn-added':
        setBusy(true);
        addTurn(event.turn);
        announce(copy.thread.thinking);
        break;
      case 'token': {
        const view = views.get(event.turn.id);
        if (!view) break;
        const stick = nearBottom();
        if (!view.text) showStreaming(view);
        view.text?.append(event.text);
        if (stick) toBottom(true);
        break;
      }
      case 'turn-changed': {
        const view = views.get(event.turn.id);
        if (!view) break;
        const { status } = event.turn;
        if (status === 'thinking') {
          setBusy(true);
          showThinking(view);
          announce(copy.thread.thinking);
        } else if (status === 'streaming') {
          showStreaming(view);
        } else {
          setBusy(false);
          finish(event.turn, view);
        }
        toBottom();
        break;
      }
      case 'availability':
        renderNotice();
        break;
      case 'cleared':
        setBusy(false);
        log.replaceChildren();
        views.clear();
        setHasChat(false);
        announce(copy.thread.cleared);
        break;
    }
  });
  cleanups.push(unsubscribe);

  const on = <K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    handler: (e: HTMLElementEventMap[K]) => void,
  ): void => {
    target.addEventListener(type, handler);
    cleanups.push(() => target.removeEventListener(type, handler));
  };

  const autosize = (): void => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 132)}px`;
  };

  on(form, 'submit', (e) => {
    e.preventDefault();
    if (controller.busy || !input.value.trim()) return;
    const question = input.value;
    input.value = '';
    autosize();
    void controller.ask(question);
  });
  on(input, 'input', autosize);
  on(input, 'keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  for (const card of root.querySelectorAll<HTMLButtonElement>('[data-question]')) {
    on(card, 'click', () => {
      const question = card.dataset.question;
      if (question && !controller.busy) void controller.ask(question);
    });
  }
  on(log, 'click', (e) => {
    const target = e.target instanceof Element ? e.target.closest('[data-retry]') : null;
    if (!target || controller.busy) return;
    const bot = target.closest<HTMLElement>('.tk-msg--bot');
    bot?.focus({ preventScroll: true });
    void controller.retry();
  });
  on(restart, 'click', () => {
    root
      .querySelector<HTMLButtonElement>('[data-question]')
      ?.focus({ preventScroll: true });
    void controller.restart();
  });

  // iOS Safari keeps the layout viewport when the keyboard opens and lays the
  // keyboard over it, so a bottom-fixed composer ends up underneath. The
  // visual viewport knows how much is covered; the CSS lifts the composer by
  // that much. Android honours `interactive-widget=resizes-content` in the
  // viewport meta instead, where this works out to zero.
  const vv = doc.defaultView?.visualViewport;
  if (vv && doc.defaultView) {
    const win = doc.defaultView;
    const sync = (): void => {
      const covered = Math.max(0, win.innerHeight - vv.height - vv.offsetTop);
      html.style.setProperty('--tk-kb', `${Math.round(covered)}px`);
    };
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    cleanups.push(() => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
    });
    sync();
  }

  const ResizeObs = doc.defaultView?.ResizeObserver;
  if (ResizeObs) {
    const ro = new ResizeObs(() => {
      html.style.setProperty('--tk-composer-h', `${Math.ceil(shell.offsetHeight)}px`);
    });
    ro.observe(shell);
    cleanups.push(() => ro.disconnect());
  }

  renderNotice();
  void controller.checkHealth();

  return () => {
    for (const fn of cleanups) fn();
    controller.dispose();
  };
}
