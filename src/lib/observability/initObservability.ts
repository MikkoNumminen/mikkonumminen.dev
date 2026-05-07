// Client-side observability bootstrap. Loaded by BaseLayout.astro on every
// page, runs once on page load. No-op if PUBLIC_SENTRY_DSN is unset (so dev
// builds and forks without a Sentry account stay silent).
//
// Two captures:
//   1. Errors / unhandled rejections via Sentry's browser SDK (auto-installed
//      on Sentry.init).
//   2. Core Web Vitals (LCP, CLS, INP, FCP, TTFB) attached as attributes on
//      the auto-started pageload span (browserTracingIntegration), so they
//      land in Sentry's Performance / Insights dashboards as real-user
//      metrics — not just Lighthouse-on-CI guesses.
//
// Sampling: tracesSampleRate is 1.0 deliberately. The previous 0.1 setting
// dropped 90% of pageload spans, which meant 90% of Web Vitals had nowhere
// to attach and fell through to the breadcrumb fallback (where vitals are
// readable but not chartable). For personal-portfolio traffic the per-month
// performance-unit volume is well under Sentry's free-tier cap (10K/month);
// the right tradeoff is full sampling. Bump down only if traffic grows past
// the cap.
//
// Privacy: Do Not Track is honored (skip init entirely). No replay, no
// session recording, no PII capture beyond Sentry's defaults (URL, browser,
// stack trace).
//
// CSP: connect-src must include https://*.sentry.io and
// https://*.ingest.sentry.io for the beacon to land. See vercel.json.

import * as Sentry from '@sentry/browser';
import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals';

const DSN_ENV_KEY = 'PUBLIC_SENTRY_DSN';

function dntEnabled(): boolean {
  if (typeof navigator === 'undefined') return false;
  // Safari uses navigator.doNotTrack, Firefox/Chrome use the same key with
  // string '1'. Treat any truthy "1" or "yes" as a request to skip.
  const dnt =
    (navigator as Navigator & { doNotTrack?: string }).doNotTrack ||
    (window as Window & { doNotTrack?: string }).doNotTrack;
  return dnt === '1' || dnt === 'yes';
}

function reportVital(metric: Metric): void {
  // browserTracingIntegration auto-starts a pageload span, so getActiveSpan()
  // resolves on every visit (modulo init failure). Attach the metric as span
  // attributes — Sentry surfaces these on the transaction's Performance view.
  const span = Sentry.getActiveSpan();
  if (span) {
    span.setAttribute(`webvital.${metric.name.toLowerCase()}`, metric.value);
    span.setAttribute(`webvital.${metric.name.toLowerCase()}.rating`, metric.rating);
    return;
  }
  // Defensive fallback: if for any reason the pageload span has already
  // finished by the time a vital fires (e.g. INP late in the visit), stash
  // the value as a breadcrumb so it's still visible alongside any error
  // that fires shortly after. Not chartable, but better than dropped.
  Sentry.addBreadcrumb({
    category: 'web-vital',
    level: 'info',
    message: `${metric.name}=${metric.value.toFixed(2)} (${metric.rating})`,
    data: {
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      delta: metric.delta,
      id: metric.id,
    },
  });
}

export function initObservability(): void {
  if (typeof window === 'undefined') return;
  if (dntEnabled()) return;

  const dsn = import.meta.env[DSN_ENV_KEY] as string | undefined;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // browserTracingIntegration auto-creates a pageload transaction so Web
    // Vitals always have a span to attach attributes to. Without it, vitals
    // fall through to the breadcrumb fallback and aren't chartable.
    integrations: [Sentry.browserTracingIntegration()],
    // Full sampling — see the file header comment for the rationale.
    tracesSampleRate: 1.0,
    // No session replay. The Replay integration isn't loaded here, so
    // replaysSessionSampleRate is documentary rather than functional —
    // explicit so a future "drop in @sentry/replay" mistake stays silent.
    replaysSessionSampleRate: 0,
    // Pre-filter known-irrelevant noise. Browser extensions injecting into
    // every page generate a wave of "Script error." that drowns real signal.
    ignoreErrors: [
      'Script error.',
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications.',
    ],
    // Limit breadcrumb retention so DNT-adjacent privacy stays defensible.
    maxBreadcrumbs: 50,
  });

  // Web Vitals reporting. Each callback fires once when the metric stabilizes
  // (LCP / CLS) or on every interaction (INP). Sentry batches sends.
  onLCP(reportVital);
  onCLS(reportVital);
  onINP(reportVital);
  onFCP(reportVital);
  onTTFB(reportVital);
}
