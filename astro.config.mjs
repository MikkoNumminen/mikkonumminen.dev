import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// Canonical site URL. Used to build absolute canonical / og:image /
// hreflang / sitemap URLs at build time, and (via Astro.site) the
// JSON-LD `url` on the home page.
//
// We resolve it dynamically from Vercel's deployment env vars so every
// deployment (production, preview, branch) emits OG / canonical URLs
// pointing at the host the page is actually served from:
//   - Production:  uses `VERCEL_PROJECT_PRODUCTION_URL` — currently
//                  `mikkonumminen-dev.vercel.app`, and the moment the
//                  apex `mikkonumminen.dev` DNS records point at Vercel
//                  and the custom domain is promoted to primary, this
//                  env var flips automatically — no config edit needed.
//   - Preview / branch: uses `VERCEL_URL`, the per-deployment URL
//                  (e.g. `mikkonumminen-dev-git-foo.vercel.app`), so
//                  preview cards self-reference instead of pointing at
//                  the production alias.
//   - Local dev / `npm run build` off-Vercel: falls back to the
//                  vercel.app alias, which is currently the canonical.
//
// Once `mikkonumminen.dev` DNS is live and Vercel has promoted it,
// configure a 301 from the `vercel.app` alias to the custom domain at
// the Vercel project level so any search-engine canonical that
// accumulated on the alias migrates cleanly.
const siteUrl =
  process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://mikkonumminen-dev.vercel.app';

// https://astro.build/config
export default defineConfig({
  site: siteUrl,
  output: 'static',
  // Astro 7 changed the default to 'jsx', which deletes EVERY whitespace-only
  // text node between elements (measured on this site: 284 inter-<span> spaces
  // across 13 pages) and trims text-node edges (' EN ' -> 'EN'). Inline-flow
  // copy that relies on a natural space would silently run together. Pin the
  // v6 semantics: compress safely, keep inter-element whitespace.
  compressHTML: true,
  // Emit slash-less URLs so the in-page canonical / og:url / hreflang match
  // what is actually served — vercel.json sets `trailingSlash: false` +
  // `cleanUrls`, so a trailing-slash (or .html) canonical would 308-redirect.
  trailingSlash: 'never',
  build: {
    inlineStylesheets: 'auto',
  },
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'fi', 'sv'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
  // Warm the browser cache for sibling routes after the current page is
  // interactive. Because the nav is fixed at the top of every page, every
  // nav link is always in the viewport — so prefetch fires immediately on
  // an idle callback and clicks land on already-cached HTML + JS chunks.
  // Independent of the custom canvas particle transition (which intercepts
  // clicks and does a hard navigation).
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'viewport',
  },
  integrations: [
    sitemap({
      i18n: {
        defaultLocale: 'en',
        locales: { en: 'en', fi: 'fi', sv: 'sv' },
      },
    }),
  ],
  vite: {
    ssr: {
      noExternal: ['three', 'gsap'],
    },

    plugins: [tailwindcss()],
  },
});
