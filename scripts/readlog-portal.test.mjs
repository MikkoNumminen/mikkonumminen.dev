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
import { upstreamUrl, snapshotUrl, safeSegments } from '../api/readlog-portal.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vercel = JSON.parse(readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const fn = readFileSync(path.join(root, 'api/readlog-portal.mjs'), 'utf8');

const MOUNT = 'https://paskamyrsky.tail6ed53b.ts.net/readlog-laravel';
const ask = (p) => upstreamUrl('/api/readlog-portal?__portal_path=' + p);

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
      expect(destination).toMatch(/^\/api\/readlog-portal\?__portal_path=/);
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

describe('readlog portal confinement', () => {
  // The funnel port also carries the RAG chat at its root. Every one of these
  // reached it before the confinement rule existed: URLSearchParams decodes
  // %2f and %5c, and new URL() then resolves the dot segments away.
  it('cannot be walked out of the mount', () => {
    for (const attempt of [
      '../../chat',
      '..%2F..%2Fchat',
      '..%5C..%5Cchat',
      '%2e%2e%2f%2e%2e%2fsession%2freset',
      '.%2e/.%2e/health',
      'library/../../../shout',
      '//evil.com/x',
      '@evil.com/x',
    ]) {
      const url = ask(attempt);
      expect(url, attempt).not.toBeNull();
      expect(url.startsWith(MOUNT + '/'), `${attempt} -> ${url}`).toBe(true);
    }
  });

  it('keeps ordinary paths and query strings intact', () => {
    expect(ask('library')).toBe(MOUNT + '/library');
    expect(ask('')).toBe(MOUNT + '/');
    expect(upstreamUrl('/api/readlog-portal?__portal_path=library&view=list')).toBe(
      MOUNT + '/library?view=list',
    );
    expect(upstreamUrl('/api/readlog-portal?__portal_path=library&ask=a+b')).toBe(
      MOUNT + '/library?ask=a+b',
    );
  });

  it('bounds a query parameter that collides with the rewrite to the same app', () => {
    const url = upstreamUrl(
      '/api/readlog-portal?__portal_path=library&__portal_path=../../chat',
    );
    expect(url.startsWith(MOUNT + '/')).toBe(true);
  });

  it('drops dot segments rather than resolving them', () => {
    expect(safeSegments('a/../b')).toEqual(['a', 'b']);
    expect(safeSegments('./.')).toEqual([]);
  });

  it("fetches the snapshot from a pinned origin, never the caller's host", () => {
    expect(snapshotUrl('/api/readlog-portal?__portal_path=library')).toBe(
      'https://mikkonumminen.dev/readlog-laravel-snapshot/library',
    );
    expect(fn).toContain("const PORTAL_ORIGIN = 'https://mikkonumminen.dev'");
    // The caller's Host must not reach either fetch or the app's link building.
    expect(fn).not.toContain("req.headers['x-forwarded-host']");
  });

  it('requires the app to name itself before calling an answer live', () => {
    // Without this, the other project's 404 on the shared funnel port is served
    // as ReadLog whenever ReadLog's mount is absent, which is what "off" does.
    expect(fn).toContain("const APP_MARKER = 'x-readlog-app'");
    expect(fn).toContain('answer.headers.get(APP_MARKER) !== null');
  });

  it('does not forward the security headers the edge already sets', () => {
    const forwarded = fn.match(/const FORWARD_RESPONSE = \[([^\]]*)\]/s)[1];
    for (const header of [
      'content-security-policy',
      'x-frame-options',
      'referrer-policy',
      'x-content-type-options',
    ]) {
      expect(forwarded, `${header} would arrive twice`).not.toContain(header);
    }
  });
});

describe('readlog portal headers', () => {
  const index = vercel.headers.findIndex((h) => h.source === '/readlog-laravel(.*)');
  const global = vercel.headers.findIndex((h) => h.source === '/(.*)');

  it('has a portal entry and it comes after the site-wide entry', () => {
    // Ordering is what decides the outcome IF Vercel lets a later rule replace
    // an earlier one's header; if instead both are sent, browsers apply the
    // intersection, which is the site-wide policy plus nothing. Either way the
    // page is no less protected than the rest of the site, and the only thing
    // at stake is whether hot-linked book covers render. Confirmed against the
    // deployment with `curl -I`, not by this assertion.
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
  it('keeps the direct snapshot copy out of search results', () => {
    // Two URLs serve the same pages; the portal path is the canonical one.
    const entry = vercel.headers.find(
      (h) => h.source === '/readlog-laravel-snapshot(.*)',
    );
    expect(entry).toBeDefined();
    expect(entry.headers).toContainEqual({ key: 'X-Robots-Tag', value: 'noindex' });
  });

  it('keeps the snapshot at the fallback path and the portal path free of files', () => {
    expect(
      existsSync(path.join(root, 'public/readlog-laravel-snapshot/index.html')),
    ).toBe(true);
    expect(existsSync(path.join(root, 'public/readlog-laravel'))).toBe(false);
    expect(fn).toContain("const SNAPSHOT_PREFIX = '/readlog-laravel-snapshot'");
  });
});
