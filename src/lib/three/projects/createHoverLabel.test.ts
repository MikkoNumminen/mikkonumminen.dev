import { describe, it, expect, afterEach } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { createHoverLabel } from './createHoverLabel';

// The hover label writes project metadata into innerHTML and positions itself by
// projecting a world point to screen pixels. Two things matter and were
// previously untested: every interpolated string is HTML-escaped (it feeds
// innerHTML), and the screen projection applies the +24/-12px cursor offset.

const savedW = window.innerWidth;
const savedH = window.innerHeight;
afterEach(() => {
  Object.defineProperty(window, 'innerWidth', { value: savedW, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: savedH, configurable: true });
});

describe('createHoverLabel — show/hide/reset', () => {
  it('escapes interpolated text — no markup is injected into innerHTML', () => {
    const el = document.createElement('div');
    createHoverLabel(el).show({
      name: '<b>pwn</b>',
      tagline: 'a & b',
      tech: ['ts'],
    });
    expect(el.dataset.visible).toBe('true');
    // The <b> was escaped, so no real <b> element exists — it's text.
    expect(el.querySelector('b')).toBeNull();
    expect(el.querySelector('.hover-label__name')?.textContent).toBe('<b>pwn</b>');
  });

  it('caps the tech list at the first four entries', () => {
    const el = document.createElement('div');
    createHoverLabel(el).show({
      name: 'n',
      tagline: 't',
      tech: ['t1', 't2', 't3', 't4', 't5'],
    });
    const tech = el.querySelector('.hover-label__tech')?.textContent ?? '';
    expect(tech).toContain('t4');
    expect(tech).not.toContain('t5');
  });

  it('renders the external-APIs span only when APIs are present', () => {
    const withApis = document.createElement('div');
    createHoverLabel(withApis).show({
      name: 'n',
      tagline: 't',
      tech: [],
      externalApis: ['Stripe'],
    });
    expect(withApis.querySelector('.hover-label__apis')).not.toBeNull();

    const without = document.createElement('div');
    createHoverLabel(without).show({ name: 'n', tagline: 't', tech: [] });
    expect(without.querySelector('.hover-label__apis')).toBeNull();
  });

  it('hide() flips visibility without clearing content; reset() clears everything', () => {
    const el = document.createElement('div');
    const label = createHoverLabel(el);
    label.show({ name: 'n', tagline: 't', tech: ['a'] });
    label.hide();
    expect(el.dataset.visible).toBe('false');
    expect(el.innerHTML).not.toBe('');
    label.reset();
    expect(el.dataset.visible).toBe('false');
    expect(el.innerHTML).toBe('');
    expect(el.style.transform).toBe('');
  });
});

describe('createHoverLabel — position', () => {
  it('maps an on-axis world point to screen-centre plus the +24/-12 offset', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    const el = document.createElement('div');
    const label = createHoverLabel(el);
    const camera = new PerspectiveCamera(50, 1000 / 800, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    label.position(new Vector3(0, 0, 0), camera, new Vector3());

    // origin projects to NDC (0,0) → centre: x = 0.5*1000 + 24, y = 0.5*800 - 12
    const m = el.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/);
    expect(m).not.toBeNull();
    if (m) {
      expect(Number(m[1])).toBeCloseTo(524, 1);
      expect(Number(m[2])).toBeCloseTo(388, 1);
    }
  });
});
