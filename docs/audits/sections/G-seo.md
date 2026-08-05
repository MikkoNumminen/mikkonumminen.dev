# SEO & Structured Data Audit: Agent G

**Date:** 2026-05-17  
**Branch:** audit/G (off audit/baseline)  
**HEAD commit (baseline):** b3de9f2  
**Build used:** local `npm run build`, site URL resolves to `https://mikkonumminen-dev.vercel.app` (no Vercel env vars set locally)

---

## 1. Head Metadata Table (12 endpoints)

### 1.1 Titles and Descriptions

| Route | Locale | `<title>` | `<meta name="description">` |
|-------|--------|-----------|------------------------------|
| `/` | EN | Mikko Numminen, full-stack developer | Full-stack developer in Finland. Seven production apps shipped solo this year, real users, 1828+ tests, AI-native by default. |
| `/projects` | EN | Projects, Mikko Numminen | Interactive solar system of selected projects by Mikko Numminen. |
| `/experience` | EN | Experience, Mikko Numminen | Climb the mountain, Mikko Numminen's experience, skills, and milestones from base camp to today. |
| `/contact` | EN | Contact, Mikko Numminen | Reach Mikko Numminen, interactive terminal with email, links, and CV download. |
| `/fi/` | FI | Mikko Numminen, full-stack-kehittäjä | Mikko Nummisen portfolio. Suomesta käsin toimiva full-stack-kehittäjä rakentaa tuotantotason verkkosovelluksia AI-avusteisilla työnkuluilla. |
| `/fi/projects` | FI | Projektit, Mikko Numminen | Interaktiivinen aurinkokunta Mikko Nummisen valituista projekteista. |
| `/fi/experience` | FI | Kokemus, Mikko Numminen | Kiipeä vuorelle, Mikko Nummisen kokemus, taidot ja virstanpylväät perusleiristä tähän hetkeen. |
| `/fi/contact` | FI | Yhteystiedot, Mikko Numminen | Ota yhteyttä Mikkoon, interaktiivinen terminaali, sähköposti, linkit ja CV:n lataus. |
| `/sv/` | SV | Mikko Numminen, full-stack-utvecklare | Portfolio för Mikko Numminen, en full-stack-utvecklare från Finland som bygger produktionsklara webbapplikationer med AI-assisterade arbetsflöden. |
| `/sv/projects` | SV | Projekt, Mikko Numminen | Interaktivt solsystem av utvalda projekt av Mikko Numminen. |
| `/sv/experience` | SV | Erfarenhet, Mikko Numminen | Klättra uppför berget, Mikko Numminens erfarenhet, kompetenser och milstolpar från baslägret till idag. |
| `/sv/contact` | SV | Kontakt, Mikko Numminen | Nå Mikko Numminen, interaktiv terminal med e-post, länkar och CV-nedladdning. |

All 12 endpoints have valid, locale-specific titles and descriptions. No missing fields.

### 1.2 Canonical URLs

All 12 endpoints self-canonicalize correctly:

| Route | Locale | Canonical |
|-------|--------|-----------|
| `/` | EN | `https://mikkonumminen-dev.vercel.app/` |
| `/projects` | EN | `https://mikkonumminen-dev.vercel.app/projects/` |
| `/experience` | EN | `https://mikkonumminen-dev.vercel.app/experience/` |
| `/contact` | EN | `https://mikkonumminen-dev.vercel.app/contact/` |
| `/fi/` | FI | `https://mikkonumminen-dev.vercel.app/fi/` |
| `/fi/projects` | FI | `https://mikkonumminen-dev.vercel.app/fi/projects/` |
| `/fi/experience` | FI | `https://mikkonumminen-dev.vercel.app/fi/experience/` |
| `/fi/contact` | FI | `https://mikkonumminen-dev.vercel.app/fi/contact/` |
| `/sv/` | SV | `https://mikkonumminen-dev.vercel.app/sv/` |
| `/sv/projects` | SV | `https://mikkonumminen-dev.vercel.app/sv/projects/` |
| `/sv/experience` | SV | `https://mikkonumminen-dev.vercel.app/sv/experience/` |
| `/sv/contact` | SV | `https://mikkonumminen-dev.vercel.app/sv/contact/` |

FI and SV pages canonicalize to themselves, not to their EN equivalents. This is correct.

### 1.3 hreflang Alternates

Each endpoint emits 4 `<link rel="alternate">` tags, one per supported locale plus `x-default`. Sample from `/fi/projects`:

```
[en] https://mikkonumminen-dev.vercel.app/projects/
[fi] https://mikkonumminen-dev.vercel.app/fi/projects/
[sv] https://mikkonumminen-dev.vercel.app/sv/projects/
[x-default] https://mikkonumminen-dev.vercel.app/projects/
```

`x-default` correctly points to the EN (unprefixed) URL on all 12 endpoints.

### 1.4 Open Graph (per endpoint)

| Route | Locale | og:type | og:locale | og:image | og:image:alt |
|-------|--------|---------|-----------|----------|--------------|
| `/` | EN | website | en_US | /og-default.png | `<title>` text |
| `/projects` | EN | website | en_US | /og-projects.png | `<title>` text |
| `/experience` | EN | website | en_US | /og-experience.png | `<title>` text |
| `/contact` | EN | website | en_US | /og-contact.png | `<title>` text |
| `/fi/` | FI | website | fi_FI | /og-default.png | `<title>` text |
| `/fi/projects` | FI | website | fi_FI | /og-projects.png | `<title>` text |
| `/fi/experience` | FI | website | fi_FI | /og-experience.png | `<title>` text |
| `/fi/contact` | FI | website | fi_FI | /og-contact.png | `<title>` text |
| `/sv/` | SV | website | sv_SE | /og-default.png | `<title>` text |
| `/sv/projects` | SV | website | sv_SE | /og-projects.png | `<title>` text |
| `/sv/experience` | SV | website | sv_SE | /og-experience.png | `<title>` text |
| `/sv/contact` | SV | website | sv_SE | /og-contact.png | `<title>` text |

All endpoints also emit `og:url` (= canonical), `og:title`, `og:description`, `og:site_name`, `og:image:secure_url`, `og:image:type` (image/png), `og:image:width` (1200), `og:image:height` (630). No missing OG fields.

### 1.5 Twitter Card (per endpoint)

All 12 endpoints emit `twitter:card=summary_large_image`, `twitter:title`, `twitter:description`, `twitter:image`, and `twitter:image:alt`. All values are locale-correct and match the OG equivalents. No missing fields.

### 1.6 JSON-LD Blocks

`<script type="application/ld+json">` is present on **home pages only** (EN `/`, FI `/fi/`, SV `/sv/`). All other routes (projects, experience, contact) carry no structured data. Full EN schema:

```json
{
  "@context": "https://schema.org",
  "@type": "Person",
  "name": "Mikko Numminen",
  "jobTitle": "Seven repos. They build on each other",
  "url": "https://mikkonumminen-dev.vercel.app/",
  "email": "numminen.mikko.petteri@gmail.com",
  "nationality": "Finnish",
  "sameAs": [
    "https://github.com/MikkoNumminen",
    "https://www.linkedin.com/in/mikko-numminen-269795205/"
  ],
  "knowsAbout": ["TypeScript", "Python", "Next.js", "React", "Node.js",
    "PostgreSQL", "MongoDB", "Prisma", "Material-UI", "Tailwind CSS",
    "Astro", "Three.js", "Jest", "Playwright", "Docker", "Turborepo",
    "Open data", "UI design", "Usability"]
}
```

FI and SV home pages emit the same schema structure with localized `jobTitle` strings (`"Seitsemän repoa. Ne rakentavat toistensa päälle"` and `"Sju repon. De bygger på varandra"` respectively). The `url` field always points to the root `https://mikkonumminen-dev.vercel.app/` regardless of locale. It does not point to the locale-specific home URL.

---

## 2. hreflang Verification

### 2.1 Completeness

All 12 endpoints correctly declare alternates for all three locales plus `x-default`. Every cross-direction is present: `en → fi`, `fi → en`, `fi → sv`, `sv → fi`, etc.

Both the `<link rel="alternate">` tags in HTML and the `<xhtml:link>` entries in `sitemap-0.xml` cover all 12 URLs.

### 2.2 Reciprocity

hreflang requires symmetric (reciprocal) declarations, if `/fi/projects` points to `/projects` as the `en` alternate, then `/projects` must point back to `/fi/projects` as the `fi` alternate. Verified: all 12 endpoints satisfy the reciprocity requirement.

### 2.3 Gaps

**None found in HTML.** One gap exists in the **sitemap**:

The sitemap `<xhtml:link>` blocks are missing the `hreflang="x-default"` entry on every URL. Google's documentation recommends including `x-default` in the sitemap alongside the per-locale entries. The HTML `<head>` includes `x-default` correctly; the sitemap omits it. This is a low-priority gap: Google resolves hreflang from HTML when the sitemap annotation is incomplete.

---

## 3. Canonicalization

All 12 locale-specific pages canonicalize to **themselves**. FI and SV pages do not incorrectly point to the EN canonical. This is correct and will allow the FI and SV pages to rank independently in Finnish and Swedish SERPs.

No cross-locale canonical pollution found.

---

## 4. OG Images Per Locale

There is **one set of four OG images** shared across all three locales:

| File | Used by |
|------|---------|
| `public/og-default.png` | `/`, `/fi/`, `/sv/` |
| `public/og-projects.png` | `/projects`, `/fi/projects`, `/sv/projects` |
| `public/og-experience.png` | `/experience`, `/fi/experience`, `/sv/experience` |
| `public/og-contact.png` | `/contact`, `/fi/contact`, `/sv/contact` |

The images contain **English copy** hardcoded in SVG (`"FULL-STACK DEVELOPER · FINLAND"`, `"7 PROJECTS · 1828+ TESTS · 91.9% COVERAGE · AI-NATIVE"`, `"/ PORTFOLIO · 2026"`). When a Finnish or Swedish user shares a page link in a chat app, the unfurl preview renders English text.

**Severity judgment:** Low–medium. The audience is likely Finnish/Swedish-reading tech recruiters who are comfortable with English. However, a Finnish recruiter sharing `/fi/` in a Finnish-language Slack will show an English card, which is a minor brand inconsistency. Creating locale-keyed OG images would fix this but requires build-time image generation (e.g., `@astrojs/og` with Satori) or three separate SVG/PNG variants per page type (12 extra images).

---

## 5. JSON-LD Validity

### 5.1 Required Person Fields Check

| Field | Present | Value | Issue? |
|-------|---------|-------|--------|
| `@context` | Yes | `https://schema.org` |, |
| `@type` | Yes | `Person` |, |
| `name` | Yes | `Mikko Numminen` |, |
| `url` | Yes | root site URL | See §5.2 |
| `jobTitle` | Yes | see §5.2 | **Bug** |
| `sameAs` | Yes | GitHub + LinkedIn |, |
| `email` | Yes | personal address | Note: exposed publicly |
| `nationality` | Yes | `Finnish` |, |
| `knowsAbout` | Yes | 19 skills |, |

JSON is syntactically valid and parses without error. No comments or trailing commas. `sameAs` contains valid URLs.

### 5.2 jobTitle Bug: Wrong Source Field

**This is the most significant SEO finding.**

The `jobTitle` field is populated from `t.intro.heading.replace(/\.$/, '')`:

```typescript
// src/page-content/HomePage.astro:44
jobTitle: t.intro.heading.replace(/\.$/, ''),
```

`intro.heading` is the section tagline, not a job title. The resulting values are:

- **EN:** `"Seven repos. They build on each other"`. This is a marketing slogan, not a job title.
- **FI:** `"Seitsemän repoa. Ne rakentavat toistensa päälle"`, Finnish marketing copy.
- **SV:** `"Sju repon. De bygger på varandra"`, Swedish marketing copy.

A valid `jobTitle` for a Person schema would be something like `"Full-Stack Developer"` (EN), `"Full-Stack-kehittäjä"` (FI), `"Full-stack-utvecklare"` (SV). The current value will not be recognized as a job title by Google's Rich Results processing and will fail the Rich Results Test. It also reduces the likelihood of appearing in "About this person" knowledge-panel snippets.

**Fix:** Add a `meta.jobTitle` key to each locale file and reference `t.meta.jobTitle` in [`src/page-content/HomePage.astro`](src/page-content/HomePage.astro). Alternatively, derive it from `t.meta.home.title` by extracting the substring after the em-dash.

### 5.3 JSON-LD url Field Does Not Match Locale

The `url` field in the schema is hardcoded to `Astro.site?.href` (the site root), even on the FI and SV home pages. Schema.org recommends `url` points to the canonical URL of the page that carries the schema. Technically this is not an error (the root URL is a valid identifier for the Person), but it means `/fi/` and `/sv/` declare the same `url` as `/`, which could confuse Google into treating all three home pages as describing the same document.

**Fix:** Use the locale-specific canonical URL: `new URL(Astro.url.pathname, Astro.site).toString()`.

### 5.4 Structured Data Scope: Only Home Pages

No structured data on `/projects`, `/experience`, or `/contact`. Opportunities:

- `/experience`: A `ProfilePage` or `ItemList` of `WorkExperience` / `EducationalOccupationalCredential` would help Google surface timeline entries as rich snippets.
- `/projects`: An `ItemList` of `SoftwareApplication` or `CreativeWork` items would allow individual projects to appear in rich results.
- `/contact`: A `ContactPoint` node on the Person schema (or a link to the `/contact` URL from the home Person schema) would complete the entity profile.

These are enhancements, not bugs.

---

## 6. Sitemap and robots.txt

### 6.1 robots.txt

```
User-agent: *
Allow: /
Disallow:

Sitemap: https://mikkonumminen.dev/sitemap-index.xml
```

**Issue:** The Sitemap directive points to `https://mikkonumminen.dev/sitemap-index.xml` (the apex custom domain), but the canonical URL baked into the sitemap and HTML is `https://mikkonumminen-dev.vercel.app/`. When Googlebot fetches the sitemap URL from robots.txt, it hits the apex domain; the sitemap content resolves URLs against the Vercel subdomain. If the apex domain is live and redirecting to the Vercel subdomain (or vice versa), the mismatch generates a Search Console warning. There is also a comment in `robots.txt` that notes this: *"Update the Sitemap URL below when the custom domain ships."*

**Fix (pending custom domain):** Once `mikkonumminen.dev` DNS is live and Vercel promotes it to primary, update `astro.config.mjs` `siteUrl` to use `https://mikkonumminen.dev` so all canonical/sitemap/OG URLs align with the custom domain, and robots.txt already points there.

### 6.2 Sitemap Contents

`sitemap-0.xml` contains exactly 12 `<url>` entries: all 12 expected routes are present, and the 404 page is correctly excluded.

| Check | Result |
|-------|--------|
| All 12 route URLs present | Yes |
| 404 page excluded | Yes |
| hreflang `<xhtml:link>` per URL | Yes (3 per URL, all locales) |
| `x-default` in sitemap hreflang | **No, missing** |
| `<lastmod>` entries | **No, missing** |
| `<changefreq>` / `<priority>` | Not set (acceptable, Google ignores them) |

### 6.3 Sitemap: Missing `x-default`

The `@astrojs/sitemap` integration version 3.7.2 does not automatically emit `x-default` in sitemap hreflang annotations. The HTML `<head>` correctly includes `x-default`; the sitemap does not. This creates a minor inconsistency: crawlers using the sitemap as their hreflang source will lack the `x-default` signal. Not a blocking issue.

### 6.4 Sitemap: No `lastmod`

No `<lastmod>` dates in the sitemap. Googlebot uses `lastmod` as a crawl-priority hint. Without it, Google crawls on its own schedule. For a portfolio that updates regularly (1–3 commits/day), adding `lastmod` would help surface fresh content faster. The `@astrojs/sitemap` integration supports a `lastmod` option; alternatively a `customPages` or `serialize` hook can inject the current build timestamp.

---

## 7. 2026 Date Discoverability

### 7.1 Human-visible "2026" references

| Location | Context |
|----------|---------|
| `dist/index.html` | `portfolio · 2026` (hero eyebrow) and `© 2026 Mikko Numminen` (footer) |
| `dist/experience/index.html` | Timeline cards with years `2026`, `2025–2026`, and heading "The 2026 build" |
| `og-default.svg` | `/ PORTFOLIO · 2026` corner text baked into the OG image |

### 7.2 Machine-readable dates: None

There are **no `datePublished`, `dateModified`, or `<time datetime="...">` elements** anywhere in the 12 pages. The experience timeline uses plain `<span class="timeline__year">2026</span>`, not `<time>` elements with `datetime` attributes.

**Impact:** A recruiter Googling "Mikko Numminen portfolio 2026" will find the page (the string exists in body text), but Google has no structured signal that the portfolio *is from* 2026. If Googlebot indexes a cached version from late 2025 and the body copy later changes, there is no `dateModified` hint to trigger a re-crawl. The JSON-LD Person schema also carries no `dateModified` or `dateCreated`.

**Recommended fix:**
1. Add `"dateModified": "<ISO 8601 build date>"` to the Person JSON-LD. The build date can be injected via `new Date().toISOString()` in `HomePage.astro`.
2. Wrap timeline year spans in `<time datetime="2026">2026</time>` and `<time datetime="2025">2025</time>`.
3. For the experience page specifically, consider a `ResumeAction` or `ItemList` of `WorkExperience` nodes with `startDate`/`endDate` in ISO 8601 format.

---

## 8. Heading Structure

### 8.1 Summary

| Route | Locale | `<h1>` count | `<h1>` content | Notes |
|-------|--------|-------------|----------------|-------|
| `/` | EN | 1 | `"Mikko Numminen"` (sr-only) | Visually hidden, screen-reader only |
| `/projects` | EN | 1 | `"Projects"` | **In fallback grid only, not visible on desktop** |
| `/experience` | EN | 1 | `"Experience"` | Visible in timeline |
| `/contact` | EN | 2 | `"Contact"` × 2 | One sr-only, one visible |
| `/fi/` | FI | 1 | `"Mikko Numminen"` (sr-only) | |
| `/sv/` | SV | 1 | `"Mikko Numminen"` (sr-only) | |

(FI/SV routes for projects/experience/contact mirror EN identically in structure.)

### 8.2 Projects Page: Desktop h1 Missing

This is the most actionable heading finding.

PR #86 (`chore(projects): drop the white 'Projects' title overlay`) intentionally removed the `<header data-intro><h1>` from the desktop WebGL scene:

> "The h1 sat at the top-left of the scene and was redundant with the nav chip plus the document `<title>`."

As a result, **on desktop (viewport > 860 px), [`src/page-content/ProjectsPage.astro`](src/page-content/ProjectsPage.astro) has no visible or in-DOM `<h1>`**. The only `<h1>` element for "Projects" exists inside `.projects-fallback`, which is `display: none` on desktop via CSS media query.

From Google's perspective (Googlebot renders JavaScript but does not run Three.js):
- It sees the fallback grid (`.projects-fallback` has `display: none` but is present in DOM).
- CSS-hidden elements are generally not indexed as visible content.
- The page `<title>` (`"Projects — Mikko Numminen"`) provides the document-level signal, but a missing `<h1>` weakens on-page SEO for the primary keyword.

**Fix options:**
1. Add a visually hidden `<h1 class="sr-only">Projects</h1>` directly inside the `.projects-scene` div (above the canvas), so it is in-DOM and accessible regardless of the CSS state of `.projects-fallback`.
2. Alternatively, make the `<h1>` in `ProjectGrid.astro` always visible via an absolute overlay in the scene wrapper (as was done before PR #86, but with less visual prominence).

### 8.3 Contact Page: Two `<h1>` Elements

`/contact` renders two `<h1>` elements:
1. `<h1 class="sr-only">Contact</h1>`: screen-reader-only, at [`src/components/contact/Terminal.astro:12`](src/components/contact/Terminal.astro#L12)
2. `<h1>Contact</h1>`: the visible terminal heading, at [`src/components/contact/Terminal.astro:73`](src/components/contact/Terminal.astro#L73)

Having two `<h1>` elements on a page is an HTML spec violation and an SEO anti-pattern. One is intentionally `sr-only`, so the fix is to demote the visible heading to `<h2>` (or promote the sr-only to be the only `<h1>` and remove the duplicate).

### 8.4 Home Page h1: Screen-Reader Only

The home page `<h1 class="hero__title sr-only">Mikko Numminen</h1>` is rendered only for screen readers; the visual title is generated by Three.js canvas. This is a valid pattern for a visually rich page, though it means Googlebot (which does not fully render Three.js) will see only the sr-only h1. This is fine: the sr-only h1 contains the primary keyword.

---

## 9. Site URL / Custom Domain Pending

A cross-cutting issue affects all 12 endpoints: the canonical URL, OG image URLs, sitemap, and JSON-LD `url` all resolve against `https://mikkonumminen-dev.vercel.app/` rather than `https://mikkonumminen.dev`. The `astro.config.mjs` comment explains this is intentional until the apex domain DNS is live.

Until the custom domain is promoted:
- Any search-engine index built now will associate authority with the `.vercel.app` subdomain.
- A 301 redirect from the subdomain to the apex domain at promotion time will migrate PageRank, but there will be a re-indexing lag.

**Not a bug to fix now**: the config comment explicitly calls this out. Worth revisiting as a checklist item when the custom domain goes live.

---

## 10. Findings by Severity

### G-MI1: jobTitle is a marketing slogan, not a job title (JSON-LD)

[`src/page-content/HomePage.astro:44`](src/page-content/HomePage.astro#L44): `t.intro.heading` produces `"Seven repos. They build on each other"` as the `jobTitle` in the Person schema. This will fail Google's Rich Results Test and prevents knowledge-panel eligibility. Fix: dedicate a `meta.jobTitle` locale string (e.g. `"Full-Stack Developer"`).

### G-MI2: Desktop projects page has no h1

`/projects`, `/fi/projects`, `/sv/projects`: the only `<h1>` is inside `.projects-fallback`, which is `display:none` on desktop. A CSS-hidden h1 is not reliably indexed by Google as a primary heading signal. Fix: add `<h1 class="sr-only">` (or locale-equivalent) inside `.projects-scene` in [`src/page-content/ProjectsPage.astro`](src/page-content/ProjectsPage.astro).

### G-NI1: Two h1 elements on /contact

[`src/components/contact/Terminal.astro:12`](src/components/contact/Terminal.astro#L12) and [`src/components/contact/Terminal.astro:73`](src/components/contact/Terminal.astro#L73). One is sr-only, one is visible. Both say "Contact". Demote the visible one to `<h2>` or remove the sr-only duplicate.

### G-NI2, No machine-readable dates anywhere

No `datePublished`, `dateModified`, or `<time datetime="...">` in any of the 12 pages. The 2026 brand story is human-visible but not structured. Fix: add `"dateModified"` to the Person JSON-LD and `<time>` elements to the experience timeline.

### G-NI3: Sitemap missing x-default hreflang and lastmod

`dist/sitemap-0.xml` omits `hreflang="x-default"` annotations (present in HTML but not sitemap) and has no `<lastmod>` entries. Add a `serialize` hook in [`astro.config.mjs`](astro.config.mjs) to emit `lastmod` as the build date, and open a feature request / patch for `@astrojs/sitemap` to support `x-default`.

### G-NI4: OG images are English-only for all locales

All FI and SV pages use the same OG PNG/SVG as their EN counterparts. The images contain English copy. Low impact for a technical/bilingual audience, but worth noting if locale-specific social sharing ever becomes a priority.

### G-NI5: JSON-LD url does not match locale page

The Person schema `url` field always points to the site root (`/`), even on `/fi/` and `/sv/`. Each locale's home page should use its own canonical URL as the `url` value to avoid ambiguity.

### G-NI6: robots.txt Sitemap directive points to apex domain; canonical/sitemap point to vercel.app subdomain

Intentional and documented. Revisit when custom domain goes live.

### G-NI7, No structured data on /projects, /experience, /contact

Enhancement opportunity only: `SoftwareApplication` items on projects, `WorkExperience` nodes on experience, `ContactPoint` on contact.

---

## 11. What This Audit Did Not Cover

- **Google Search Console data**, no live index, impression, CTR, or coverage reports.
- **Live SERP inspection**, no checks for actual ranking position or featured snippet eligibility.
- **Link-graph analysis**: inbound links, domain authority, competitor backlink profiles.
- **Structured data validator API**: the JSON-LD was analyzed by reading source + applying schema.org rules manually; no live call to `https://validator.schema.org` was made.
- **Social preview rendering**: OG card rendering was not tested in Facebook Debugger, Twitter Card Validator, or LinkedIn Post Inspector.
- **Google Rich Results Test**, not run; jobTitle bug was identified by source inspection.
- **International SEO for non-supported locales**: the site supports en/fi/sv only; no assessment of other locale coverage.
- **Vercel Edge Network / CDN behaviour**: canonical URL consistency after Vercel's trailing-slash normalization was not tested live (only analyzed via `vercel.json`).
