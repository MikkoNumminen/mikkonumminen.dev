# ADR 0019 · One runtime function, for the ReadLog portal

**Status:** accepted
**Date:** 2026-08-20
**Amends:** the "static output only" rule in `CLAUDE.md`

## Context

`CLAUDE.md` has carried one line since the site was rebuilt: **static output
only, no SSR, no edge functions, no runtime secrets, the build must remain
portable across static hosts.** It is a good rule and it has held through
everything else, including two backends that run on a machine in a house. Both
of those reach the site through `vercel.json` rewrites, which are configuration,
not code: the RAG chat at `/api/rag/*` and SongGenerator at `/api/songgen/*`.

ReadLog Laravel asked for something those rewrites cannot express. The
requirement from the repo owner was exact: when the machine is on,
`/readlog-laravel` is the real running app; when it is off, the same address is
the static snapshot; and it is never a broken page. A rewrite is unconditional.
Point it at the funnel and the address dies whenever the machine sleeps; point
it at the snapshot and the live app is unreachable. The switch has to be made
per request, by something that can try one and fall back to the other, and on
this platform that is a function.

Three alternatives were considered and rejected before writing one:

- **Two addresses**, `/readlog-laravel` for the snapshot and another for the
  live app. Honest and static, and it fails the requirement: the address on
  the CV, in the corpus and in every existing link would keep showing a frozen
  copy while the real thing sat somewhere else.
- **Client-side switching**: ship the snapshot, probe the funnel from the
  browser, redirect when it answers. It moves the machine's address into every
  visitor's browser, needs the funnel to allow cross-origin reads, and shows a
  visible flash of the wrong page. It also cannot pass the app's cookies.
- **Rewrite to the funnel, accept the dead page.** Rejected by the requirement,
  and it is the failure mode most likely to be seen by exactly the person the
  site is for, since the machine is off more often than it is on.

## Decision

One function, `api/readlog-portal.mjs`, scoped to one path prefix. The rule in
`CLAUDE.md` stands for everything else, and this record is the exception it now
points at.

What the function may do is deliberately narrow:

- **One upstream, and it is confined.** The host is a constant, and the path is
  rebuilt segment by segment with dot segments dropped, then checked to still
  sit under `/readlog-laravel` before any request goes out. The first draft did
  not do this, and a review found that `..%2f..%2f` in the path reached the RAG
  chat's own routes, same-origin, through this site: `URLSearchParams` decodes
  `%2f` and `new URL()` then resolves the `..` away. That is the whole reason
  the confinement is two independent mechanisms rather than one.
- **No secrets.** It reads no environment variable and holds no credential. Its
  entire configuration is five constants at the top of the file.
- **No state beyond a five second memo** of "the machine did not answer", so a
  snapshot page does not probe a sleeping machine once per image.
- **It decides nothing about content.** It forwards a request and returns an
  answer, labelled `x-readlog-source: live` or `snapshot` so the machine's own
  control panel can read what the public page is doing.

## Consequences

The build is no longer portable to a pure static host without losing this one
feature. That is the real cost, and it is bounded: delete the function and the
two rewrites, point `/readlog-laravel` at the snapshot directory, and the site
is static again with the same content it had before, minus the live view. The
guard test `scripts/readlog-portal.test.mjs` pins the confinement, the pinned
snapshot origin, the marker requirement and the header placement, so the
narrowness above is enforced rather than remembered.

One thing this record left open has since been measured against the running
deployment: a later `headers` entry in `vercel.json` **replaces** an earlier
one's `Content-Security-Policy` rather than adding a second copy. Confirmed on
2026-08-20 with `curl -I https://mikkonumminen.dev/readlog-laravel/library`:
exactly one policy arrives, the portal's, and every other page keeps the
site-wide policy untouched.

That measurement was right about which policy arrives and wrong about what it
lets through. It said hot-linked covers render. Opened in a browser on
2026-08-23, seven of the ten covers on the library page were blocked, and the
same page served straight from the app on port 8080 rendered all ten. `curl -L`
had reported a valid JPEG for every cover it was pointed at, because curl
follows redirects without enforcing a policy. Open Library serves a cover
either directly or as a 302 into `ia######.us.archive.org`, its storage at the
Internet Archive, and CSP checks the host again on each redirect hop. Naming
`covers.openlibrary.org` alone allowed the request and blocked the file.
`https://*.us.archive.org` is now in `img-src` for that reason, which is the
same provider named where it keeps the files. Measured the same day across 118
cover URLs from both providers, every redirect chain ends on one of three
hosts: `books.google.com`, `covers.openlibrary.org` and
`ia######.us.archive.org`, so the list is now complete rather than plausible.
From here on, what a page renders is checked in a browser, and `curl` is used
for what the headers say.

One thing it still does not settle, to be checked the same way rather than
argued here:
- Whether the funnel's own latency makes the live view pleasant enough to keep
  pointing the canonical address at it. If it is not, the fallback becomes the
  default and the live view moves behind a query string or a second address.
