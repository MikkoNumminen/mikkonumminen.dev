// Client-side observability bootstrap. Loaded by BaseLayout.astro on every
// page, runs once on page load. No-op if PUBLIC_SENTRY_DSN is unset (so dev
// builds and forks without a Sentry account stay silent).
//
// Two captures:
//   1. Errors / unhandled rejections via Sentry's browser SDK (auto-installed
//      on Sentry.init).
//   2. Core Web Vitals (LCP, CLS, INP, FCP, TTFB) reported as Sentry custom
//      measurements so dashboards can chart real-user metrics, not just
//      Lighthouse-on-CI guesses.
//
// Privacy: Do Not Track is honored (skip init entirely). No replay, no
// session recording, no PII capture beyond Sentry's defaults (URL, browser,
// stack trace). tracesSampleRate is low — this is a portfolio, not a SaaS.
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
  // Sentry's custom-measurement API. Only available on transactions, so we
  // attach to the active span if one exists; otherwise breadcrumb-log so the
  // value is still visible alongside any error that fires shortly after.
  const span = Sentry.getActiveSpan();
  if (span) {
    span.setAttribute(`webvital.${metric.name.toLowerCase()}`, metric.value);
    span.setAttribute(`webvital.${metric.name.toLowerCase()}.rating`, metric.rating);
    return;
  }
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
    // Conservative sampling for a portfolio site. Bump if traffic is so low
    // that 10% of a handful of visitors is statistically meaningless.
    tracesSampleRate: 0.1,
    // No session replay — this is a public portfolio, not a SaaS dashboard.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
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
