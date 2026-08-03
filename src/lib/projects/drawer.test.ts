import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initProjectDrawer } from './drawer';
import type { LocalizedProject } from '../../data/projects';

// drawer.ts is a focus trap: open() must move focus in, Tab/Shift+Tab must
// keep it cycling inside the panel, and close() must hand focus back to
// whatever triggered the open. Every one of those is an accessibility
// guarantee — break one and a keyboard user gets silently trapped or
// dumped to the top of the document. These tests build a real DOM fixture
// and drive it with real focus() calls / dispatched KeyboardEvents rather
// than mocking the module's own internals.

// jsdom has no layout engine, so `offsetParent` is always null — which
// would make getFocusable()'s visibility filter reject every element and
// the trap could never move focus at all. Treat "has a parent in the tree"
// as "visible" for the purposes of this suite.
Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
  configurable: true,
  get(this: HTMLElement) {
    return this.parentElement;
  },
});

const project: LocalizedProject = {
  id: 'test-project',
  name: 'Test Project',
  category: 'app',
  scale: 1,
  orbitRadius: 1,
  orbitSpeed: 1,
  phase: 0,
  tilt: 0,
  color: '#ffffff',
  tech: ['TypeScript'],
  liveUrl: 'https://live.example',
  githubUrl: 'https://github.com/example/repo',
  tagline: 'A test project',
  description: 'Description of the test project.',
};

function makeFixture() {
  document.body.innerHTML = '';

  const trigger = document.createElement('button');
  trigger.textContent = 'Open drawer';
  document.body.appendChild(trigger);

  const detail = document.createElement('div');
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  detail.appendChild(closeBtn);

  const fieldNames = [
    'name',
    'tagline',
    'description',
    'status',
    'highlights',
    'externalApisWrap',
    'externalApis',
    'tech',
    'links',
  ];
  for (const field of fieldNames) {
    const el = document.createElement(
      field === 'tech' || field === 'externalApis' ? 'ul' : 'div',
    );
    el.setAttribute('data-field', field);
    detail.appendChild(el);
  }
  document.body.appendChild(detail);

  const intro = document.createElement('div');
  const legend = document.createElement('div');
  const credits = document.createElement('div');
  const list = document.createElement('div');
  document.body.append(intro, legend, credits, list);

  const onClose = vi.fn();
  const labels = { liveDemo: 'Live demo', githubLink: 'GitHub' };

  const handle = initProjectDrawer({
    detail,
    closeBtn,
    intro,
    legend,
    credits,
    list,
    labels,
    onClose,
  });

  return { trigger, detail, closeBtn, intro, legend, credits, list, handle, onClose };
}

function getFocusableLinks(detail: HTMLElement): HTMLElement[] {
  return Array.from(
    detail.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
  );
}

function dispatchTab(target: HTMLElement, shiftKey = false): KeyboardEvent {
  const evt = new KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(evt);
  return evt;
}

beforeEach(() => {
  // requestAnimationFrame runs synchronously so open()'s deferred
  // closeBtn.focus() is observable without a real animation-frame wait.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('initProjectDrawer: open', () => {
  it('moves focus into the drawer (to the close button) on open', () => {
    const { handle, closeBtn } = makeFixture();
    handle.open(project);
    expect(document.activeElement).toBe(closeBtn);
  });

  it('sets data-open / aria-hidden and hides the surrounding panels', () => {
    const { handle, detail, intro, legend, credits, list } = makeFixture();
    handle.open(project);
    expect(detail.getAttribute('data-open')).toBe('true');
    expect(detail.getAttribute('aria-hidden')).toBe('false');
    expect(intro.classList.contains('is-hidden')).toBe(true);
    expect(legend.classList.contains('is-hidden')).toBe(true);
    expect(credits.classList.contains('is-hidden')).toBe(true);
    expect(list.classList.contains('is-hidden')).toBe(true);
  });

  it('is idempotent: opening the same project twice does not duplicate populated content', () => {
    const { handle, detail } = makeFixture();
    handle.open(project);
    handle.open(project);
    const links = detail.querySelector('[data-field="links"]');
    expect(links?.querySelectorAll('a').length).toBe(2);
  });
});

describe('initProjectDrawer: Tab trap', () => {
  it('Tab from the last focusable element cycles to the first', () => {
    const { handle, detail, closeBtn } = makeFixture();
    handle.open(project);
    const focusable = getFocusableLinks(detail);
    const last = focusable[focusable.length - 1]!;
    expect(focusable[0]).toBe(closeBtn);

    last.focus();
    const evt = dispatchTab(detail);

    expect(document.activeElement).toBe(closeBtn);
    expect(evt.defaultPrevented).toBe(true);
  });

  it('Shift+Tab from the first focusable element cycles to the last', () => {
    const { handle, detail, closeBtn } = makeFixture();
    handle.open(project);
    const focusable = getFocusableLinks(detail);
    const last = focusable[focusable.length - 1]!;

    closeBtn.focus();
    const evt = dispatchTab(detail, true);

    expect(document.activeElement).toBe(last);
    expect(evt.defaultPrevented).toBe(true);
  });

  it('Tab from a middle element is left alone (browser default tab order applies)', () => {
    const { handle, detail } = makeFixture();
    handle.open(project);
    const focusable = getFocusableLinks(detail);
    const middle = focusable[1]!;

    middle.focus();
    const evt = dispatchTab(detail);

    // Not the wrap-around case, so the trap must not intervene.
    expect(evt.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(middle);
  });

  it('repeated open() calls do not stack the keydown trap listener', () => {
    const { handle, detail } = makeFixture();
    handle.open(project);
    handle.open(project);

    const focusable = getFocusableLinks(detail);
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const focusSpy = vi.spyOn(first, 'focus');

    last.focus();
    dispatchTab(detail);

    // If the listener were registered twice, first.focus() would fire twice.
    expect(focusSpy).toHaveBeenCalledTimes(1);
  });
});

describe('initProjectDrawer: Escape', () => {
  it('Escape closes an open drawer', () => {
    const { handle, detail, onClose } = makeFixture();
    handle.open(project);

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );

    expect(detail.getAttribute('data-open')).toBe('false');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape is a no-op when the drawer is not open', () => {
    const { onClose } = makeFixture();

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );

    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('initProjectDrawer: focus restoration', () => {
  it('closing restores focus to the element that had it before opening', () => {
    const { handle, trigger } = makeFixture();
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    handle.open(project);
    expect(document.activeElement).not.toBe(trigger);

    handle.close();
    expect(document.activeElement).toBe(trigger);
  });

  it('prepareOpen overrides the restore target with an explicit trigger element', () => {
    const { handle, trigger } = makeFixture();
    const listItem = document.createElement('button');
    document.body.appendChild(listItem);

    // Simulate the click-outside interim close() having reset activeElement
    // back to `trigger` before the new open() runs (see the doc-comment on
    // DrawerHandle.prepareOpen in drawer.ts).
    trigger.focus();
    handle.prepareOpen(listItem);
    handle.open(project);
    handle.close();

    expect(document.activeElement).toBe(listItem);
  });

  it(
    'BUG: the "fall back to body" path does not actually move focus, because ' +
      '`document.body` has no tabindex and is not focus()-able by script — so when ' +
      'the original trigger is gone, focus is silently left wherever it was (the ' +
      'close button inside the now-hidden drawer) instead of returning to a sane ' +
      "place. Correct behavior would be `document.body.setAttribute('tabindex', '-1')` " +
      'before focusing it, or focusing `document.documentElement`, so keyboard users ' +
      'are not left with focus inside `aria-hidden="true"` content.',
    () => {
      const { handle, trigger, closeBtn } = makeFixture();
      trigger.focus();
      handle.open(project);
      trigger.remove();

      handle.close();

      // What the code intends (and what a correct implementation would do):
      // expect(document.activeElement).toBe(document.body);
      // What actually happens — focus() on body is a no-op, so it stays put:
      expect(document.activeElement).toBe(closeBtn);
    },
  );
});

describe('initProjectDrawer: close', () => {
  it('unsets data-open / aria-hidden and restores the surrounding panels', () => {
    const { handle, detail, intro, legend, credits, list } = makeFixture();
    handle.open(project);
    handle.close();

    expect(detail.getAttribute('data-open')).toBe('false');
    expect(detail.getAttribute('aria-hidden')).toBe('true');
    expect(intro.classList.contains('is-hidden')).toBe(false);
    expect(legend.classList.contains('is-hidden')).toBe(false);
    expect(credits.classList.contains('is-hidden')).toBe(false);
    expect(list.classList.contains('is-hidden')).toBe(false);
  });

  it(
    'calling close() again while already closed still fires onClose (no open-state guard) — ' +
      'documenting actual behavior, not asserting it as ideal; callers (Escape/click-outside) ' +
      'guard on data-open before calling close(), so this only bites a caller that does not',
    () => {
      const { handle, onClose } = makeFixture();
      handle.open(project);
      handle.close();
      expect(onClose).toHaveBeenCalledTimes(1);

      expect(() => handle.close()).not.toThrow();
      expect(onClose).toHaveBeenCalledTimes(2);
    },
  );
});

describe('initProjectDrawer: dispose', () => {
  it('removes the document-level Escape and click-outside listeners', () => {
    const { handle, detail, onClose } = makeFixture();
    handle.open(project);
    handle.dispose();

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );

    expect(onClose).not.toHaveBeenCalled();
    expect(detail.getAttribute('data-open')).toBe('true');
  });

  it('removes the close-button click listener', () => {
    const { handle, closeBtn, onClose } = makeFixture();
    handle.open(project);
    handle.dispose();

    closeBtn.click();

    expect(onClose).not.toHaveBeenCalled();
  });
});
