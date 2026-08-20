/**
 * /readlog-laravel, live when the author's machine answers, snapshot when not.
 *
 * The ReadLog Laravel app runs on a home machine and is reachable through a
 * Tailscale Funnel path mount. This function is what makes one address serve
 * both states: every request under /readlog-laravel is tried against the
 * funnel first, and when the machine is off, the funnel path unmounted, or the
 * app simply slow to exist, the same URL falls back to the static snapshot
 * committed under public/readlog-laravel-snapshot/. Visitors never see a bare
 * 502; they see the app or a labelled copy of it.
 *
 * Every response carries `x-readlog-source: live | snapshot` so the machine's
 * own control panel (ops/desktop/readlogctl.py in the readlog-laravel repo)
 * can read what the public page is doing without guessing.
 *
 * Two headers tell the app where its visitor really is: the funnel mount
 * strips its own path prefix, so without them the app would generate links
 * that escape /readlog-laravel. The app validates their shape and rebuilds
 * its URLs; see PortalPrefix in the readlog-laravel repo.
 *
 * WHOSE ANSWER IS IT. The funnel port this mount sits on also carries the RAG
 * chat at its root, and that root handler answers every path the mount does
 * not claim. When ReadLog is switched off its mount is removed, so the funnel
 * answers our paths with the other project's 404, which is a perfectly valid
 * HTTP response and would be served here as if it were ReadLog's. So a live
 * verdict needs proof: the app names itself with `X-ReadLog-App` on every
 * response, nginx included, and an answer without that header is treated as
 * nobody's and falls back to the snapshot.
 *
 * THE CONFINEMENT RULE. This is the one function on the site that forwards a
 * caller-supplied path to a machine in a house, so the path is not trusted for
 * a moment. The funnel's port 443 also carries the RAG chat at its root, and
 * `..%2f..%2f` in the path decodes to `../../`, which `new URL()` then
 * normalises away: the naive version of this function let a visitor reach
 * `/chat` and every other route on that origin, same-origin, through this
 * site. So the upstream URL is built segment by segment with dot segments
 * dropped, and then checked to still start with the mount before any request
 * is made. Both halves stay; the check is what catches whatever normalisation
 * the next runtime decides to do.
 */

const FUNNEL_ORIGIN = 'https://paskamyrsky.tail6ed53b.ts.net';
const FUNNEL_MOUNT = '/readlog-laravel';
const UPSTREAM_BASE = FUNNEL_ORIGIN + FUNNEL_MOUNT;

/**
 * Where the snapshot is fetched from, pinned rather than taken from the
 * request's own Host: this function must not be able to fetch a page from a
 * host a caller names and serve it as ours. The same constant is what the app
 * is told to build its links from.
 */
const PORTAL_ORIGIN = 'https://mikkonumminen.dev';
const SNAPSHOT_PREFIX = '/readlog-laravel-snapshot';
const PORTAL_PREFIX = '/readlog-laravel';

/**
 * The rewrite's own query parameter. Named so a visitor's query string is
 * unlikely to collide with it; if one ever does, the confinement rule above
 * bounds the damage to a different page of the same app.
 */
const PATH_PARAM = '__portal_path';

/** The header the app names itself with. Without it, an answer is not ReadLog's. */
const APP_MARKER = 'x-readlog-app';

/**
 * How long a failed upstream attempt is remembered, in milliseconds.
 *
 * A snapshot page asks for its own stylesheet and a screenful of cover images,
 * all under the portal path, and without this each one would probe a machine
 * that was just found to be off. One probe per burst is enough; the window is
 * short enough that switching the machine on is visible immediately, and the
 * control panel's own check retries anyway. Module scope, so it lives as long
 * as the instance and costs nothing when the machine is up.
 */
const UPSTREAM_DOWN_MS = 5000;
let upstreamDownUntil = 0;

/**
 * Milliseconds the funnel fetch may take. Page loads answer in tens of
 * milliseconds; the one slow route is the AI search (?ask=), where a warm
 * model answers in seconds and a cold one can take tens of seconds, and a
 * submitted form should not be abandoned while the app is mid-write. All three
 * stay under the function's 60 s maxDuration in vercel.json.
 */
function timeoutMsFor(method, search) {
  if (method !== 'GET' && method !== 'HEAD') return 15000;
  if (search.includes('ask=')) return 50000;
  return 8000;
}

/** Request headers worth forwarding to the app. Host is deliberately absent. */
const FORWARD_REQUEST = [
  'accept',
  'accept-language',
  'content-type',
  'cookie',
  'referer',
  'user-agent',
];

/**
 * Response headers passed through from the app.
 *
 * The security headers the app sets (CSP, X-Frame-Options, Referrer-Policy,
 * X-Content-Type-Options) are deliberately NOT forwarded: vercel.json sets
 * those for this path, and a second copy of the same header is not a stricter
 * page, it is an ambiguous one. Hop-by-hop and encoding headers are recomputed
 * by the platform; set-cookie is handled separately because it is multi-valued.
 */
const FORWARD_RESPONSE = ['content-type', 'location', 'cache-control', 'retry-after'];

/**
 * The path under the portal, as a list of safe segments: dot segments are
 * dropped rather than resolved, and each surviving segment is re-encoded, so
 * nothing in it can end a path early or climb out of the mount.
 */
export function safeSegments(path) {
  return path
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.' && segment !== '..')
    .map((segment) => encodeURIComponent(segment));
}

/**
 * The upstream URL for a request, or null when the result would not sit under
 * the mount. Callers must treat null as "do not fetch".
 */
export function upstreamUrl(url) {
  const incoming = new URL(url, PORTAL_ORIGIN);
  const path = incoming.searchParams.get(PATH_PARAM) ?? '';
  incoming.searchParams.delete(PATH_PARAM);
  const query = incoming.searchParams.toString();

  const candidate =
    UPSTREAM_BASE + '/' + safeSegments(path).join('/') + (query ? '?' + query : '');
  const resolved = new URL(candidate);

  // Belt and braces: whatever the URL parser did with what it was given, the
  // request only goes out if it still points inside the mount.
  if (resolved.origin !== FUNNEL_ORIGIN) return null;
  if (
    resolved.pathname !== FUNNEL_MOUNT &&
    !resolved.pathname.startsWith(FUNNEL_MOUNT + '/')
  ) {
    return null;
  }

  return resolved.href;
}

/** The snapshot URL for a request: same path, pinned origin, no query. */
export function snapshotUrl(url) {
  const incoming = new URL(url, PORTAL_ORIGIN);
  const path = incoming.searchParams.get(PATH_PARAM) ?? '';

  return PORTAL_ORIGIN + SNAPSHOT_PREFIX + '/' + safeSegments(path).join('/');
}

/** Rebuild a raw body from what Vercel's body parsing left us. */
export function rawBody(req) {
  if (req.body === undefined || req.body === null) return undefined;
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body;
  const type = req.headers['content-type'] ?? '';
  if (type.includes('application/x-www-form-urlencoded')) {
    return new URLSearchParams(req.body).toString();
  }

  return JSON.stringify(req.body);
}

async function send(res, upstream, source) {
  res.statusCode = upstream.status;
  for (const name of FORWARD_RESPONSE) {
    const value = upstream.headers.get(name);
    if (value) res.setHeader(name, value);
  }
  const cookies = upstream.headers.getSetCookie?.() ?? [];
  if (cookies.length > 0) res.setHeader('set-cookie', cookies);
  res.setHeader('x-readlog-source', source);
  const body = Buffer.from(await upstream.arrayBuffer());
  res.end(body);
}

export default async function handler(req, res) {
  const upstream = upstreamUrl(req.url);

  if (upstream === null) {
    res.statusCode = 400;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.setHeader('x-readlog-source', 'rejected');
    res.end('That path does not sit under /readlog-laravel.');
    return;
  }

  try {
    if (Date.now() < upstreamDownUntil) throw new Error('upstream known down');

    const answer = await fetch(upstream, {
      method: req.method,
      headers: {
        ...Object.fromEntries(
          FORWARD_REQUEST.filter((h) => req.headers[h]).map((h) => [h, req.headers[h]]),
        ),
        'x-portal-host': new URL(PORTAL_ORIGIN).host,
        'x-portal-prefix': PORTAL_PREFIX,
        'x-forwarded-proto': 'https',
      },
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : rawBody(req),
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMsFor(req.method, upstream)),
    });

    // Two ways an answer is not ReadLog's: a gateway error means the funnel
    // reached nothing, and a missing marker means it reached somebody else.
    // The app's own 4xx and redirects carry the marker and pass through, they
    // are real answers.
    const isReadLog = answer.headers.get(APP_MARKER) !== null;
    if (isReadLog && ![502, 503, 504].includes(answer.status)) {
      upstreamDownUntil = 0;

      return await send(res, answer, 'live');
    }
    upstreamDownUntil = Date.now() + UPSTREAM_DOWN_MS;
  } catch {
    // Unreachable, unmounted, or out of time: fall through to the snapshot.
    upstreamDownUntil = Date.now() + UPSTREAM_DOWN_MS;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 503;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.setHeader('x-readlog-source', 'snapshot');
    res.end(
      "ReadLog runs on its author's machine, which is not answering right now, so the form could not be submitted. The browsable snapshot is still up.",
    );
    return;
  }

  const snapshot = await fetch(snapshotUrl(req.url), {
    redirect: 'follow',
    signal: AbortSignal.timeout(8000),
  });

  return send(res, snapshot, 'snapshot');
}
