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
//   - Production:  PINNED to the custom domain `https://mikkonumminen.dev`.
//                  We pin it rather than derive from
//                  `VERCEL_PROJECT_PRODUCTION_URL` so canonical / OG / sitemap
//                  don't hinge on Vercel's "primary domain" flag being set —
//                  the domain is decided.
//   - Preview / branch: uses `VERCEL_URL`, the per-deployment URL
//                  (e.g. `mikkonumminen-dev-git-foo.vercel.app`), so
//                  preview cards self-reference instead of pointing at
//                  production.
//   - Local dev / `npm run build` off-Vercel: falls back to the
//                  production domain.
const siteUrl =
  process.env.VERCEL_ENV === 'production'
    ? 'https://mikkonumminen.dev'
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://mikkonumminen.dev';

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
    locales: ['en', 'fi'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
  // Warm the browser cache for sibling routes after the current page is
  // interactive. Because the nav is fixed at the top of every page, every
  // nav link is always in the viewport — so prefetch fires immediately on
  // an idle callback and clicks land on already-cached HTML + JS chunks,
  // which the <ClientRouter/> then swaps in without a full page load.
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'viewport',
  },
  integrations: [
    sitemap({
      i18n: {
        defaultLocale: 'en',
        locales: { en: 'en', fi: 'fi' },
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
