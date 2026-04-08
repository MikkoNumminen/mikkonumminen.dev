import { Camera, Vector3 } from 'three';

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    // The character class above guarantees `c` is one of these five keys,
    // so the lookup is always defined.
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

export interface HoverLabelEntry {
  name: string;
  tagline: string;
  tech: readonly string[];
}

export interface HoverLabelHandle {
  show: (entry: HoverLabelEntry) => void;
  hide: () => void;
  position: (worldPos: Vector3, camera: Camera, scratch: Vector3) => void;
  reset: () => void;
}

export function createHoverLabel(element: HTMLElement): HoverLabelHandle {
  return {
    show: (entry): void => {
      element.innerHTML = `
        <span class="hover-label__name">${escapeHtml(entry.name)}</span>
        <span class="hover-label__tag">${escapeHtml(entry.tagline)}</span>
        <span class="hover-label__tech">${entry.tech.slice(0, 4).map(escapeHtml).join(' · ')}</span>
      `;
      element.dataset.visible = 'true';
    },
    hide: (): void => {
      element.dataset.visible = 'false';
    },
    position: (worldPos, camera, scratch): void => {
      scratch.copy(worldPos).project(camera);
      const x = (scratch.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-scratch.y * 0.5 + 0.5) * window.innerHeight;
      element.style.transform = `translate(${x + 24}px, ${y - 12}px)`;
    },
    reset: (): void => {
      element.dataset.visible = 'false';
      element.style.transform = '';
      element.innerHTML = '';
    },
  };
}
