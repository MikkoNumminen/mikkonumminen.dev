import type { APIRoute } from 'astro';

// Generated at build time so the Sitemap line always matches the deploy's
// resolved `site` (mikkonumminen.dev in production; the preview URL on branch
// deploys) — no drift between robots.txt and the sitemap @astrojs/sitemap emits.
export const GET: APIRoute = ({ site }) => {
  const sitemap = new URL('sitemap-index.xml', site).href;
  const body = `User-agent: *
Allow: /
Disallow:

Sitemap: ${sitemap}
`;
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
