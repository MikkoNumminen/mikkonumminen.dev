# J: Internationalization Audit

**Date:** 2026-05-17
**Branch:** audit/J (off audit/baseline, HEAD = b3de9f2)
**Scope:** EN / FI / SV across all four pages

---

## Per-locale completeness table

| Section | EN | FI | SV | Notes |
|---------|----|----|-----|-------|
| `meta` (titles + descriptions) | ✓ | ✓ | ✓ | All four pages |
| `nav` | ✓ | ✓ | ✓ | All 7 keys |
| `hero` | ✓ | ✓ | ✓ | All 7 keys |
| `intro` | ✓ | ✓ | ✓ | All 6 keys |
| `focus` | ✓ | ✓ | ✓ | items array (3 entries each) |
| `integrations` | ✓ | ✓ | ✓ | items array (4 entries each) |
| `velocity` | ✓ | ✓ | ✓ | stats array (3 entries each) |
| `navCards` | ✓ | ✓ | ✓ | footer strings included |
| `projectsPage` | ✓ | ✓ | ✓ | All 20 keys + `connectionKindLabels` |
| `projectsData` | ✓ | ✓ | ✓ | 7 projects; all have tagline + description |
| `experiencePage` | ✓ | ✓ | ✓ | All 14 keys |
| `timelineData` | ✓ | ✓ | ✓ | 6 entries; lessons array on `2026-build` |
| `contactPage` | ✓ | ✓ | ✓ | All 11 keys |
| `mobileContact` | ✓ | ✓ | ✓ | All 12 keys |
| `terminal` | ✓ | ✓ | ✓ | All 36 keys |
| `langSwitcher` | ✓ | ✓ | ✓ | |
| `notFound` | ✓ | ✓ | ✓ | |
| **Voice assets** | ✓ | **MISSING** | **MISSING** | `public/audio/`, see §6 |

**No missing or empty translation keys were found.** The `Translations` interface in `src/i18n/types.ts` enforces structural parity at compile time; `npm run typecheck` passes with 0 errors, which confirms FI and SV satisfy every required key.

---

## Findings by severity

### MAJOR

#### J-MA1: Voice audio files absent for FI and SV (confirmed from baseline)

**Files:** [`public/audio/`](public/audio/)
**Severity:** Major, feature ships broken for 2 of 3 locales

`public/audio/` contains only:
```
voice-landing-en.mp3   (461 kB)
voice-projects-en.mp3  (301 kB)
```
The locale-keyed filenames `voice-landing-fi.mp3`, `voice-landing-sv.mp3`, `voice-projects-fi.mp3`, and `voice-projects-sv.mp3` are absent.

[`src/components/home/HeroVoiceover.astro:37`](src/components/home/HeroVoiceover.astro#L37) resolves the source as:
```
const voiceSrc = `/audio/voice-landing-${locale}.mp3`;
```
[`src/components/projects/ProjectsVoiceover.astro:20`](src/components/projects/ProjectsVoiceover.astro#L20) uses the same pattern for `/audio/voice-projects-${locale}.mp3`.

The components handle 404 silently via try/catch (`/* autoplay blocked, source missing, or play interrupted */`) so no visible error occurs: the feature simply does nothing for Finnish and Swedish visitors. This is a silent regression: the locale-aware voice feature described in commits #82 and #83 is only operational in English.

**Recommendation:** Either record and commit Finnish and Swedish voiceovers to `public/audio/`, or add an explicit EN fallback in both voiceover components when the locale-keyed source 404s (a `<source>` fallback element pointing to the EN file, or a JS-level asset-existence check before constructing `voiceSrc`).

---

#### J-MA2: Background audio toggle labels hardcoded in English

**File:** [`src/components/BackgroundAudio.astro:45`](src/components/BackgroundAudio.astro#L45), [`src/components/BackgroundAudio.astro:87`](src/components/BackgroundAudio.astro#L87)–88
**Severity:** Major, visible UI text, not localized

The sound-toggle button contains three hardcoded English strings that are not pulled from `src/i18n/locales/`:

```html
aria-label="Toggle background sound"   <!-- line 45 -->
<span class="bg-audio__label-on">sound on</span>   <!-- line 87 -->
<span class="bg-audio__label-off">sound off</span>  <!-- line 88 -->
```

`BackgroundAudio.astro` is rendered inside `BaseLayout.astro` on every page and every locale. Finnish and Swedish users see "sound on" / "sound off" in English. The `aria-label` is exposed to screen readers in all locales.

The component does not currently accept a `locale` prop and does not import `getTranslations`. Fixing this requires either: (a) adding a `locale` prop threaded from [`src/layouts/BaseLayout.astro`](src/layouts/BaseLayout.astro), or (b) adding a `bgAudio` key group to the `Translations` interface and passing it via a `data-*` attribute (the same pattern used in [`src/components/contact/MobileContactCard.astro`](src/components/contact/MobileContactCard.astro)).

---

#### J-MA3: LinkedIn button `aria-label` hardcoded in English

**File:** [`src/components/contact/MobileContactCard.astro:56`](src/components/contact/MobileContactCard.astro#L56)
**Severity:** Major, visible to screen readers in all locales

```html
aria-label="LinkedIn (opens in a new tab)"
```

This label is hardcoded English on the mobile contact card. Finnish and Swedish screen-reader users hear "LinkedIn (opens in a new tab)" regardless of page locale. Should be added to `mobileContact` translations and threaded through the component the same way `m.btnLinkedin` already is for the button text.

---

### MODERATE

#### J-MI1: `Now` timeline year not localized

**File:** [`src/data/timeline.ts:46`](src/data/timeline.ts#L46)
**Severity:** Moderate, visible to all users on the Experience page

```typescript
{ id: 'now', altitude: 0.97, year: 'Now', kind: 'now' }
```

The `year` field is explicitly noted in the type comment as "never translated" and is rendered directly in `TimelineContent.astro` (lines 77–81). However, "Now" is a visible English word displayed prominently in the Experience page timeline for FI and SV users. The other year fields (`'1998–2022'`, `'2026'`, etc.) are numerals and locale-neutral; only `'Now'` is a natural-language word.

**Recommendation:** Add a `yearNow` key to `experiencePage` translations (FI: "Nyt", SV: "Nu") and replace the hardcoded `'Now'` string in `timeline.ts` with a lookup, or allow `TimelineEntry.year` to be an i18n key when the entry id is `'now'`.

---

### INFORMATIONAL / JUDGMENT CALL

#### J-NI1: Translation quality assessment (10 non-trivial strings sampled)

Sampled strings from `fi.ts` and `sv.ts`:

| Key | FI judgment | SV judgment |
|-----|-------------|-------------|
| `intro.body` | Native-phrased. "HRM on Platformin arkkitehtuuripohja" flows naturally. | Native-phrased. Good use of "ryggraden i Platform". |
| `focus.items[1].body` | Good: "Jokaisella repolla on CI joka pushissa" is tech-Finnish that developers would use. | Good: "Varje repo kör CI vid varje push" is idiomatic. |
| `velocity.body` | Very good. "AI-natiivi ei ole sloganpuhetta, se on matematiikkaa" is punchy and natural. | Good: "AI-nativt är inte snack, det är matematik" mirrors the punch. |
| `experiencePage.cta` | "astu terminaaliin →", idiomatic (not "siirry terminaaliin"). | "hoppa in i terminalen →", casual and fitting. |
| `terminal.bootWelcome` | "tervetuloa, mikko numminen, full-stack-kehittäjä.", correct and natural. | "välkommen till mikko numminen, full-stack-utvecklare.", correct. |
| `mobileContact.typedWhoamiOutputBio` | "vie full-stack-tuotantosovellukset maaliin päästä päähän", "viedä maaliin" (carry to the finish) is a strong idiomatic choice. | "levererar full-stack-produktionsappar från ände till ände", natural Swedish. |
| `timelineData.now.body` | "Saatavilla nyt. Avoin kunnianhimoisille full-stack-rooleille", professional and direct. | "Tillgänglig nu. Öppen för ambitiösa full-stack-roller", equivalent quality. |
| `projectsData.spacepotatis.description` | Long; technical terms mostly preserved in English (Next.js, Phaser 3, Three.js, Kysely, ORM), correct for tech content. | Same approach, appropriate. |
| `navCards.heading` | "Valitse maailma.", excellent, matches the metaphor. | "Välj en värld.", perfect equivalent. |
| `contactPage.noscriptIntro` | "Tämä sivu on interaktiivinen terminaali joka vaatii JavaScriptin.", grammatically correct, clear. | "Den här sidan är en interaktiv terminal som kräver JavaScript.", correct. |

**Overall quality: high.** Neither FI nor SV reads as word-for-word machine translation. Metaphors ("climb the mountain", "pick a world") translate to cultural equivalents rather than literal. Technical terms (repo, CI, TTS, OAuth, etc.) are kept in English consistently across all locales: the correct call for an international dev audience.

---

#### J-NI2: "Spacepotatis" and "vuohitiimi" brand names handled correctly

Both are proper nouns / brand names and are correctly **kept as-is** in all three locales:

- `Spacepotatis` (the game): appears verbatim in FI and SV translations throughout `projectsData` and body copy. This is the right call: it is a product name and should not be translated (Swedish "potatis" = potato is already present, making it somewhat self-explaining to SV readers; FI readers encounter it as an opaque brand name, consistent with how product names work in Finnish marketing).

- `vuohiliitto.com` (the WoW guild's domain, appears in `intro.body` and `projectsData.platform.description`): kept as-is. Correct: it is a URL and a proper noun.

- `VUOHITIIMI` does not appear as user-visible text in any template, component, or locale file. It appears only in `baseline.md` as an audit label; it is not a UI string that requires localization.

**Recommendation:** No action needed on brand names.

---

#### J-NI3: `liveDemo` intentional localization divergence

**File:** [`src/i18n/locales/fi.ts:141`](src/i18n/locales/fi.ts#L141), [`src/i18n/locales/sv.ts:141`](src/i18n/locales/sv.ts#L141)
**Severity:** Informational

Both FI and SV use `'demo →'` while EN uses `'live demo →'`. This is an intentional editorial decision documented in a comment in both locale files:
```typescript
// "live demo" doesn't translate idiomatically; the Finnish/Swedish UI uses just "demo".
```
This is the correct call: "live demo" is an English collocation; the shortened "demo" is natural in FI and SV. No action needed.

---

### PASS, no findings

#### §2: Translation key coverage
All keys defined in `en.ts` exist in `fi.ts` and `sv.ts`. The TypeScript `Translations` interface enforces this structurally; `typecheck` passes with 0 errors.

#### §4: Date / number formatting
No `Intl.DateTimeFormat` or `Intl.NumberFormat` usage in any template or component. Timeline year values (`'1998–2022'`, `'2022–2024'`, `'2024–2025'`, `'2025–2026'`, `'2026'`) are ISO year numerals: locale-neutral. Percentages and test counts in locale strings use each locale's decimal separator: EN uses `91.9%`, FI and SV use `91,9 %` (space before `%`, comma decimal), correct per Finnish/Swedish conventions. No date literals formatted with `Intl` are needed because no runtime dates are rendered.

#### §5: Locale switcher deep-link behavior
`SiteNav.astro` (lines 29–36) builds language switch links by calling `stripLocale(current)` on the current URL pathname, then `localizePath(barePath, l)` for each locale. This is the correct pattern: a user on `/fi/projects` clicking EN lands on `/projects`; clicking SV lands on `/sv/projects`. The `routing.ts` implementation and `routing.test.ts` tests both confirm this:

- `stripLocale('/fi/projects')` → `'/projects'`
- `localizePath('/projects', 'sv')` → `'/sv/projects'`

**Deep-link coverage:** `routing.test.ts` covers:
- Root path for non-default locales (`/fi/`, `/sv/`)
- Already-localized paths re-localized to a different locale
- Query string preservation (`/projects?id=hrm`)
- Hash fragment preservation (`/#top`)
- Idempotency (double-strip)
- Missing leading slash normalization (`fi/projects` → `/projects`)

All 13 tests pass. The test suite adequately covers the deep-link switching scenario.

**One gap:** There is no test asserting that `localizePath('/fi/projects', 'fi')` is idempotent (i.e., does not double-prefix to `/fi/fi/projects`). The implementation handles this correctly via the `LOCALE_PREFIX_REGEX` strip on input, but the test suite does not explicitly assert it.

#### §7: `<html lang>` correctness
Verified from baseline dist:

| Route | `lang` attribute |
|-------|-----------------|
| `/index.html` | `lang="en"` ✓ |
| `/fi/index.html` | `lang="fi"` ✓ |
| `/sv/index.html` | `lang="sv"` ✓ |

All correct. `BaseLayout.astro` line 39: `<html lang={locale} data-theme={theme}>`, the `locale` value is derived from `asLocale(Astro.currentLocale)` which falls back to `'en'` rather than producing an invalid value.

#### §8: Astro i18n config
`astro.config.mjs` (lines 40–46):
```js
i18n: {
  defaultLocale: 'en',
  locales: ['en', 'fi', 'sv'],
  routing: {
    prefixDefaultLocale: false,
  },
},
```
`prefixDefaultLocale: false` is correctly set. English routes are served at `/`, `/projects/`, etc. (no `/en/` prefix). Finnish and Swedish routes are served at `/fi/` and `/sv/`. This matches the `localizePath` / `stripLocale` logic in `src/i18n/routing.ts`.

The sitemap integration also declares the locales correctly:
```js
sitemap({ i18n: { defaultLocale: 'en', locales: { en: 'en', fi: 'fi', sv: 'sv' } } })
```

---

## What this audit did not cover

- **Native-speaker translation review.** The quality judgment in §J-05 is based on structural analysis (word-for-word vs. idiomatic rendering, correct use of locale-specific punctuation, correct decimal separators). It is not a native-speaker review. Both FI and SV translations should be reviewed by a native speaker before the site is marketed as fully localized in those languages.
- **RTL languages.** None are configured; no RTL findings apply.
- **Pluralization rules.** Finnish has 15 grammatical cases; Swedish fewer but still non-trivial. No dynamic pluralization is used anywhere in the codebase (all counts are hardcoded strings in locale files: `'1828+ tests'`), so there is nothing to check beyond what is reviewed above. If counts become dynamic in future, a proper plural-forms library (e.g. `Intl.PluralRules`) will be required for FI/SV.
- **Right-to-left layout or locale-specific typography.** Not applicable.
- **User-visible terminal commands.** The terminal commands themselves (`whoami`, `contact --email`, `download --cv`) are kept in English in all locales. This appears intentional (a terminal aesthetic), consistent with how `cmdDownloadUsage: 'download --cv'` is the same in FI and SV. Not flagged.
