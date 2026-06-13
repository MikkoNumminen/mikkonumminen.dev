import { describe, it, expect } from 'vitest';
import { linkifyBody } from './linkify';
import { projects } from '../../data/projects';

// linkifyBody turns timeline prose into text/link spans by matching known
// project hosts. The renderer wraps link spans in <a> tags, so the invariants
// that matter are: no characters are dropped (reassembly === input), a known
// host becomes a link to its own liveUrl, and prose with no host stays a single
// text part. Hosts are derived from the real projects data, like production.

const liveHosts = projects
  .map((p) => p.liveUrl)
  .filter((u): u is string => typeof u === 'string' && u.length > 0)
  .map((u) => new URL(u).host);

describe('linkifyBody', () => {
  it('returns a single text part when no project host appears', () => {
    const body = 'plain prose with no links whatsoever';
    expect(linkifyBody(body)).toEqual([{ type: 'text', value: body }]);
  });

  it('reassembles to the original string — no characters dropped', () => {
    const host = liveHosts[0];
    expect(host, 'expected at least one project with a liveUrl').toBeTruthy();
    const body = `Built ${host} last year and shipped it.`;
    const joined = linkifyBody(body)
      .map((p) => p.value)
      .join('');
    expect(joined).toBe(body);
  });

  it('emits a link span for a known host pointing at the matching liveUrl', () => {
    const host = liveHosts[0];
    if (!host) return;
    const link = linkifyBody(`see ${host} now`).find((p) => p.type === 'link');
    expect(link?.type).toBe('link');
    if (link?.type === 'link') {
      expect(link.value).toBe(host);
      expect(link.href).toMatch(/^https?:\/\//);
      expect(new URL(link.href).host).toBe(host);
    }
  });

  it('produces no empty text spans when a host sits at the very start', () => {
    const host = liveHosts[0];
    if (!host) return;
    const parts = linkifyBody(`${host} is live`);
    expect(parts[0]?.type).toBe('link');
    expect(parts.every((p) => p.value.length > 0)).toBe(true);
  });
});
