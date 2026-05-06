/**
 * Project drawer — focus trap, detail population, open/close lifecycle.
 *
 * Extracted from ProjectsPage.astro so the page's <script> block stays as
 * thin orchestration. All DOM queries are performed at call time so this
 * module can be imported at the top of the script without side effects.
 */

import type { LocalizedProject } from '../../data/projects';

export interface DrawerLabels {
  liveDemo: string;
  githubLink: string;
}

export interface DrawerHandle {
  open: (project: LocalizedProject) => void;
  close: () => void;
  dispose: () => void;
}

export interface DrawerOpts {
  detail: HTMLElement;
  closeBtn: HTMLButtonElement;
  intro: HTMLElement | null;
  legend: HTMLElement | null;
  credits: HTMLElement | null;
  key: HTMLElement | null;
  labels: DrawerLabels;
  /** Called after the drawer closes so the scene can deselect the planet. */
  onClose?: () => void;
}

/** Return all currently-focusable elements inside the drawer. */
function getFocusable(detail: HTMLElement): HTMLElement[] {
  return Array.from(
    detail.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
}

/** Populate the detail panel's data-field slots with the project's data. */
function populateDetail(
  detail: HTMLElement,
  p: LocalizedProject,
  labels: DrawerLabels,
): void {
  const setText = (sel: string, text: string) => {
    const el = detail.querySelector<HTMLElement>(`[data-field="${sel}"]`);
    if (el) el.textContent = text;
  };
  setText('name', p.name);
  setText('tagline', p.tagline);
  setText('description', p.description);

  // The heading is hidden-by-default via [data-empty="true"]; clear the
  // flag once we've populated it.
  const name = detail.querySelector<HTMLElement>('[data-field="name"]');
  if (name) name.removeAttribute('data-empty');

  const status = detail.querySelector<HTMLElement>('[data-field="status"]');
  if (status) {
    if (p.status) {
      status.textContent = p.status;
      status.setAttribute('data-status', p.status);
      status.style.display = '';
    } else {
      status.style.display = 'none';
    }
  }

  const highlights = detail.querySelector<HTMLElement>('[data-field="highlights"]');
  if (highlights) {
    highlights.innerHTML = '';
    (p.highlights ?? []).forEach((h) => {
      const span = document.createElement('span');
      span.className = 'highlight';
      span.textContent = h;
      highlights.appendChild(span);
    });
  }

  const externalApisWrap = detail.querySelector<HTMLElement>(
    '[data-field="externalApisWrap"]',
  );
  const externalApis = detail.querySelector<HTMLElement>('[data-field="externalApis"]');
  if (externalApisWrap && externalApis) {
    externalApis.innerHTML = '';
    if (p.externalApis && p.externalApis.length > 0) {
      p.externalApis.forEach((api) => {
        const li = document.createElement('li');
        li.textContent = api;
        externalApis.appendChild(li);
      });
      externalApisWrap.removeAttribute('hidden');
    } else {
      externalApisWrap.setAttribute('hidden', '');
    }
  }

  const tech = detail.querySelector<HTMLElement>('[data-field="tech"]');
  if (tech) {
    tech.innerHTML = '';
    p.tech.forEach((name) => {
      const li = document.createElement('li');
      li.textContent = name;
      tech.appendChild(li);
    });
  }

  const links = detail.querySelector<HTMLElement>('[data-field="links"]');
  if (links) {
    links.innerHTML = '';
    if (p.liveUrl) {
      const a = document.createElement('a');
      a.href = p.liveUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = 'primary';
      a.textContent = labels.liveDemo;
      links.appendChild(a);
    }
    if (p.githubUrl) {
      const a = document.createElement('a');
      a.href = p.githubUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = 'secondary';
      a.textContent = labels.githubLink;
      links.appendChild(a);
    }
  }
}

/**
 * Wire up the project detail drawer.
 *
 * Returns an object with `open`, `close`, and `dispose` methods. The caller
 * should invoke `dispose` on `beforeunload` or when tearing down the page.
 */
export function initProjectDrawer(opts: DrawerOpts): DrawerHandle {
  const { detail, closeBtn, intro, legend, credits, key, labels } = opts;

  let lastFocused: HTMLElement | null = null;

  const trapTab = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const focusable = getFocusable(detail);
    if (focusable.length === 0) {
      e.preventDefault();
      closeBtn.focus();
      return;
    }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey) {
      if (active === first || !detail.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const open = (project: LocalizedProject) => {
    populateDetail(detail, project, labels);
    lastFocused = document.activeElement as HTMLElement | null;
    detail.setAttribute('data-open', 'true');
    detail.setAttribute('aria-hidden', 'false');
    intro?.classList.add('is-hidden');
    legend?.classList.add('is-hidden');
    credits?.classList.add('is-hidden');
    key?.classList.add('is-hidden');
    detail.addEventListener('keydown', trapTab);
    // Move focus to the close button once the drawer is open so keyboard
    // users can immediately tab through its contents.
    requestAnimationFrame(() => closeBtn.focus());
  };

  const close = () => {
    detail.setAttribute('data-open', 'false');
    detail.setAttribute('aria-hidden', 'true');
    intro?.classList.remove('is-hidden');
    legend?.classList.remove('is-hidden');
    credits?.classList.remove('is-hidden');
    key?.classList.remove('is-hidden');
    detail.removeEventListener('keydown', trapTab);
    opts.onClose?.();
    // Restore focus to the element that opened the drawer, or fall back
    // to the body so subsequent tabs continue from the start of the page.
    if (lastFocused && document.contains(lastFocused)) {
      lastFocused.focus();
    } else {
      (document.body as HTMLElement).focus();
    }
    lastFocused = null;
  };

  const onEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && detail.getAttribute('data-open') === 'true') {
      close();
    }
  };

  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', onEscape);

  const dispose = () => {
    closeBtn.removeEventListener('click', close);
    document.removeEventListener('keydown', onEscape);
    detail.removeEventListener('keydown', trapTab);
  };

  return { open, close, dispose };
}
