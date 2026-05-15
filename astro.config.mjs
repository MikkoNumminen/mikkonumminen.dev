import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// Canonical site URL. Used to build absolute canonical / og:image /
// hreflang / sitemap URLs at build time. Currently set to the Vercel
// production alias because the custom `mikkonumminen.dev` domain isn't
// DNS-mapped yet — pages built with the custom domain produced
// `og:image` URLs that didn't resolve, so chat-app unfurlers (Telegram,
// WhatsApp, Slack) silently dropped the image while still rendering the
// title + description. Flip back to `https://mikkonumminen.dev` once
// the apex `A`/`CNAME` records point at Vercel.
// https://astro.build/config
export default defineConfig({
  site: 'https://mikkonumminen-dev.vercel.app',
  output: 'static',
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
  build: {
    inlineStylesheets: 'auto',
  },
  vite: {
    ssr: {
      noExternal: ['three', 'gsap'],
    },

    plugins: [tailwindcss()],
  },
});
