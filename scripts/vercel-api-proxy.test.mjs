/**
 * The rules that keep `/api/*` from becoming an open door to a home machine.
 *
 * Two backends on this site are proxied through Vercel's edge to a Tailscale
 * funnel: the RAG chat on 443 and SongGenerator on 10000. Both run on hardware
 * in a house. The rewrites are what decide which paths the public internet can
 * reach on them.
 *
 * A wildcard is one character of convenience and a different security posture:
 * `/api/songgen/:path*` forwards ANYTHING anyone appends, including paths the
 * API does not document and paths it has not written yet. Enumeration keeps the
 * reachable surface to what somebody chose. The PR that added SongGenerator
 * argued this at length and then relied on nobody undoing it, which is the part
 * a test is for.
 *
 * These are properties of the deployment config, so they are checked here rather
 * than at runtime: by the time a wildcard is live, it is live.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vercel = JSON.parse(readFileSync(path.join(root, 'vercel.json'), 'utf8'));

/** Rewrites that proxy to a backend rather than rearranging this site. */
const proxies = vercel.rewrites.filter((r) => r.source.startsWith('/api/'));

/** The one host allowed to sit behind /api/*, and the ports it answers on. */
const FUNNEL = 'paskamyrsky.tail6ed53b.ts.net';

describe('vercel /api proxies', () => {
  it('finds the proxy rewrites at all', () => {
    // Guards the guard: an empty list satisfies every rule below, and a renamed
    // prefix would empty it silently.
    expect(proxies.length).toBeGreaterThanOrEqual(9);
  });

  it('never proxies a wildcard path to a backend', () => {
    // `:path*` and `(.*)` both match any suffix. Either one turns a named set of
    // endpoints into "whatever the caller appends".
    for (const { source } of proxies) {
      expect(source, `${source} forwards an unbounded path to a home machine`).not.toMatch(
        /:[a-z]+\*|\(\.\*\)|\*$/i,
      );
    }
  });

  it('sends every proxied path to the funnel and nowhere else', () => {
    for (const { source, destination } of proxies) {
      const url = new URL(destination);
      expect(url.hostname, `${source} -> ${url.hostname}`).toBe(FUNNEL);
      expect(url.protocol, `${source} is not https`).toBe('https:');
    }
  });

  it('keeps each backend on its own port', () => {
    // 443 is the RAG chat, 10000 is SongGenerator. 8443 is oauth2-proxy and is
    // deliberately absent: nothing here should be routing to it.
    const byPrefix = {};
    for (const { source, destination } of proxies) {
      const prefix = source.split('/')[2];
      (byPrefix[prefix] ??= new Set()).add(new URL(destination).port || '443');
    }
    expect(Object.keys(byPrefix).sort()).toEqual(['rag', 'songgen']);
    expect([...byPrefix.rag]).toEqual(['443']);
    expect([...byPrefix.songgen]).toEqual(['10000']);
  });

  it('forwards each path to the same path on the backend', () => {
    // A rewrite that silently retargets — /api/songgen/health going to /admin —
    // would be invisible from the source side alone.
    for (const { source, destination } of proxies) {
      const tail = source.replace(/^\/api\/(rag|songgen)/, '');
      expect(new URL(destination).pathname, `${source} retargets`).toBe(tail);
    }
  });

  it('gives every proxied prefix a no-store cache header', () => {
    // Job status and chat responses must never be served stale from the edge.
    const prefixes = [...new Set(proxies.map((r) => r.source.split('/')[2]))];
    for (const prefix of prefixes) {
      const rule = vercel.headers.find((h) => h.source === `/api/${prefix}/(.*)`);
      expect(rule, `/api/${prefix}/* has no cache header rule`).toBeTruthy();
      const values = Object.fromEntries(rule.headers.map((h) => [h.key, h.value]));
      expect(values['Cache-Control']).toBe('no-store');
      expect(values['x-vercel-enable-rewrite-caching']).toBe('0');
    }
  });
});

describe('project redirects', () => {
  it('gives SongGenerator the same shape every other project has', () => {
    // The address convention: one lowercase top-level path per project. It was
    // missing, which is why /songgenerator 404'd while every sibling worked.
    const songgen = vercel.redirects.find((r) => r.source === '/songgenerator');
    expect(songgen, 'no /songgenerator redirect').toBeTruthy();
    expect(songgen.permanent, 'project redirects are temporary; the target moves').toBe(
      false,
    );
    expect(songgen.destination).toMatch(/^https:\/\//);
    expect(songgen.source, 'lowercase, one entry, no camelCase variant').toBe(
      songgen.source.toLowerCase(),
    );
  });

  it('has no camelCase duplicate of any project redirect', () => {
    for (const { source } of vercel.redirects) {
      expect(source, `${source} is not lowercase`).toBe(source.toLowerCase());
    }
  });
});
