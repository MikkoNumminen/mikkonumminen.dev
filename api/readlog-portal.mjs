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
 * The upstream is pinned to the funnel host, the same boundary the /api/rag
 * and /api/songgen rewrites live behind, and the path is prefixed under the
 * mount, so this function cannot be steered to another host or port.
 */

const FUNNEL_ORIGIN = 'https://paskamyrsky.tail6ed53b.ts.net';
const FUNNEL_MOUNT = '/readlog-laravel';
const SNAPSHOT_PREFIX = '/readlog-laravel-snapshot';
const PORTAL_PREFIX = '/readlog-laravel';

/**
 * Seconds the funnel fetch may take. Page loads answer in tens of
 * milliseconds; the one slow route is the AI search (?ask=), where a warm
 * model answers in seconds and a cold one can take tens of seconds, and a
 * submitted form should not be abandoned while the app is mid-write.
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
 * Response headers passed through from the app. Hop-by-hop and encoding
 * headers are recomputed by the platform; set-cookie is handled separately
 * because it is multi-valued.
 */
const FORWARD_RESPONSE = [
  'content-type',
  'location',
  'cache-control',
  'content-security-policy',
  'x-frame-options',
  'x-content-type-options',
  'referrer-policy',
  'retry-after',
];

/** The path under the portal, from the rewrite's ?path= plus the real query. */
export function upstreamPathAndQuery(url) {
  const incoming = new URL(url, 'http://placeholder');
  const path = incoming.searchParams.get('path') ?? '';
  incoming.searchParams.delete('path');
  const query = incoming.searchParams.toString();

  return '/' + path.replace(/^\/+/, '') + (query ? '?' + query : '');
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
  const pathAndQuery = upstreamPathAndQuery(req.url);
  const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'mikkonumminen.dev';

  try {
    const upstream = await fetch(FUNNEL_ORIGIN + FUNNEL_MOUNT + pathAndQuery, {
      method: req.method,
      headers: {
        ...Object.fromEntries(
          FORWARD_REQUEST.filter((h) => req.headers[h]).map((h) => [h, req.headers[h]]),
        ),
        'x-portal-host': host,
        'x-portal-prefix': PORTAL_PREFIX,
        'x-forwarded-proto': 'https',
      },
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : rawBody(req),
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMsFor(req.method, pathAndQuery)),
    });

    // Gateway errors mean the funnel answered but the machine or app did not;
    // those fall back like a network failure. The app's own 4xx and redirects
    // pass through, they are real answers.
    if (![502, 503, 504].includes(upstream.status)) {
      return await send(res, upstream, 'live');
    }
  } catch {
    // Unreachable, unmounted, or out of time: fall through to the snapshot.
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

  const snapshotPath = pathAndQuery.split('?')[0];
  const snapshot = await fetch('https://' + host + SNAPSHOT_PREFIX + snapshotPath, {
    redirect: 'follow',
    signal: AbortSignal.timeout(8000),
  });

  return send(res, snapshot, 'snapshot');
}
