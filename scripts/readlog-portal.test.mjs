/**
 * The rules that keep the readlog portal what it says it is.
 *
 * /readlog-laravel serves a live app proxied from a home machine, with the
 * committed snapshot as its fallback. Three properties make that acceptable and
 * each is a config fact someone could silently break, so they are asserted here
 * the way the /api/* proxy rules are:
 *
 * 1. The path routes to the portal function and nowhere else, and the function
 *    pins its upstream to the funnel host the other proxies use. A retargeted
 *    rewrite or function would be invisible from the source side alone.
 * 2. The portal pages get their own CSP (the live pages hot-link book covers
 *    from the two providers) and that entry sits AFTER the site-wide one,
 *    because for the same header key the last matching entry wins. Reordering
 *    the array would silently re-tighten the covers away or, worse, loosen the
 *    whole site.
 * 3. The snapshot lives at its fallback path and nothing is left at the portal
 *    path, where a static file would shadow the rewrite (the filesystem is
 *    checked before rewrites) and pin the page to the snapshot forever.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vercel = JSON.parse(readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const fn = readFileSync(path.join(root, 'api/readlog-portal.mjs'), 'utf8');

const FUNNEL = 'paskamyrsky.tail6ed53b.ts.net';

const portalRewrites = vercel.rewrites.filter((r) =>
  r.source.startsWith('/readlog-laravel'),
);

describe('readlog portal routing', () => {
  it('routes the portal path to the portal function, bare and nested', () => {
    expect(portalRewrites.map((r) => r.source).sort()).toEqual([
      '/readlog-laravel',
      '/readlog-laravel/:path*',
    ]);
    for (const { destination } of portalRewrites) {
      expect(destination).toMatch(/^\/api\/readlog-portal\?path=/);
    }
  });

  it('pins the function upstream to the funnel host on 443', () => {
    expect(fn).toContain(`const FUNNEL_ORIGIN = 'https://${FUNNEL}'`);
    // One upstream constant, no other absolute host in a fetch call.
    const fetchedHosts = [...fn.matchAll(/fetch\(\s*'https:\/\/([^'/]+)/g)].map(
      (m) => m[1],
    );
    expect(fetchedHosts).toEqual([]);
  });

  it('labels the source so the machine-side control can read the page state', () => {
    expect(fn).toContain("'x-readlog-source'");
    expect(fn).toContain("'live'");
    expect(fn).toContain("'snapshot'");
  });

  it('gives the function room for the AI search but not more than a minute', () => {
    expect(vercel.functions['api/readlog-portal.mjs'].maxDuration).toBe(60);
  });
});

describe('readlog portal headers', () => {
  const index = vercel.headers.findIndex((h) => h.source === '/readlog-laravel(.*)');
  const global = vercel.headers.findIndex((h) => h.source === '/(.*)');

  it('has a portal entry and it comes after the site-wide entry', () => {
    expect(index).toBeGreaterThan(-1);
    expect(global).toBeGreaterThan(-1);
    expect(index).toBeGreaterThan(global);
  });

  it('allows exactly the two cover hosts beyond self, and stays uncached', () => {
    const headers = Object.fromEntries(
      vercel.headers[index].headers.map((h) => [h.key, h.value]),
    );
    const img = headers['Content-Security-Policy']
      .split(';')
      .map((d) => d.trim())
      .find((d) => d.startsWith('img-src'));
    expect(img.split(' ').slice(1).sort()).toEqual([
      "'self'",
      'data:',
      'https://books.google.com',
      'https://covers.openlibrary.org',
    ]);
    expect(headers['Cache-Control']).toBe('no-store');
  });
});

describe('readlog snapshot placement', () => {
  it('keeps the snapshot at the fallback path and the portal path free of files', () => {
    expect(
      existsSync(path.join(root, 'public/readlog-laravel-snapshot/index.html')),
    ).toBe(true);
    expect(existsSync(path.join(root, 'public/readlog-laravel'))).toBe(false);
    expect(fn).toContain("const SNAPSHOT_PREFIX = '/readlog-laravel-snapshot'");
  });
});
