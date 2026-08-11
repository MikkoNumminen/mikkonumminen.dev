/**
 * The rules that keep `/api/*` from becoming an open door to a home machine.
 *
 * Two backends on this site are proxied through Vercel's edge to a Tailscale
 * funnel: the RAG chat on 443 and SongGenerator on 10000. Both run on hardware
 * in a house. The rewrites are what decide which paths the public internet can
 * reach on them.
 *
 * The two backends get different rules because they authenticate differently.
 *
 * SongGenerator checks a verified Google token against a server-side allowlist,
 * so a wildcard mostly forwards unknown paths into a 401. Measured against port
 * 10000 on 2026-08-12: `/library`, `/users`, `/jobs` and `/banks` all 401,
 * `/health` is 200, an unrouted path is 404. Enumeration bought nothing against
 * that and charged a PR in this repo per endpoint added upstream, which is why a
 * shipped admin panel and player 404'd through the site while answering 401
 * direct.
 *
 * "Mostly" because the same probe found `/docs`, `/redoc` and `/openapi.json`
 * answering 200 unauthenticated, so this wildcard publishes FastAPI's schema and
 * Swagger UI at `/api/songgen/docs`. The funnel already served them to anyone who
 * read this file for the hostname, but off the site's own origin is where they
 * had been sitting. Gate them on the backend if that matters. Re-enumerating here
 * to paper over it is what this test exists to argue against.
 *
 * The RAG chat authenticates nothing. Absence from this list hides nothing
 * either — the funnel proxies its whole origin, as `SECURITY.md` and the
 * docstring on `chat-backend/app/main.py` both say plainly. What enumeration
 * still buys there is that each route the *site* publishes same-origin is a
 * decision someone made, and the RAG route set is fixed and small, so the ban
 * costs nothing. It stays until something argues it off, the way SongGenerator's
 * did.
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

/** `:path*` and `(.*)` both match an unbounded suffix. */
const WILDCARD = /:[a-z]+\*|\(\.\*\)|\*$/i;

/** Backends whose own auth, rather than this list, decides what a stranger reaches. */
const AUTHENTICATED = new Set(['songgen']);

/** The `/api/<prefix>/` segment that picks which backend a rewrite reaches. */
const prefixOf = (source) => source.split('/')[2];

describe('vercel /api proxies', () => {
  it('finds the proxy rewrites at all', () => {
    // Guards the guard: an empty list satisfies every rule below, and a renamed
    // prefix would empty it silently. Collapsing songgen to one wildcard is why
    // this floor is 5 (four RAG routes) rather than a count per endpoint.
    expect(proxies.length).toBeGreaterThanOrEqual(5);
    expect([...new Set(proxies.map((r) => prefixOf(r.source)))].sort()).toEqual([
      'rag',
      'songgen',
    ]);
  });

  it('only wildcards a backend that authenticates every route', () => {
    // An unbounded suffix forwards paths the API has not written yet. That is
    // fine into a 401 and not fine into an open backend.
    for (const { source } of proxies) {
      if (AUTHENTICATED.has(prefixOf(source))) continue;
      expect(
        source,
        `${source} forwards an unbounded path to a home machine`,
      ).not.toMatch(WILDCARD);
    }
  });

  it('anchors every wildcard below the backend selector', () => {
    // `/api/:path*` or `/api/songgen:path*` would let the caller pick which
    // machine and port to reach, which is a different thing from picking a path
    // on one that was chosen for them.
    for (const { source } of proxies) {
      const selector = `/api/${prefixOf(source)}`;
      expect(selector, `${source} wildcards the backend selector`).not.toMatch(WILDCARD);
      expect(
        source.startsWith(`${selector}/`),
        `${source} has no path below ${selector}`,
      ).toBe(true);
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
      (byPrefix[prefixOf(source)] ??= new Set()).add(new URL(destination).port || '443');
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
    const prefixes = [...new Set(proxies.map((r) => prefixOf(r.source)))];
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
