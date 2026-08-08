import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The client-side observability bootstrap.
 *
 * WHY IT NEEDED A TEST. This module is the sole consumer of `web-vitals`, and it
 * had none. A dependabot bump (6.0.1 to 6.1.0) turned out to be a no-op for us —
 * the only source change upstream was in `src/attribution/`, which we do not
 * import — but reaching that conclusion meant reading an upstream diff, because
 * nothing here would have told us either way. web-vitals shipped a major two
 * weeks before that with real API removals. The next one will not be a no-op.
 *
 * WHAT IT PINS is the contract with two third-party packages: the five metric
 * registrars we call, and the four `Metric` fields we read off the callback.
 * Renamed or dropped, they fail here rather than as vitals quietly missing from
 * a dashboard nobody checks daily.
 *
 * The privacy guards are pinned for a different reason: Do Not Track and the
 * missing-DSN case are the two paths where the correct behaviour is to do
 * NOTHING, and "nothing happened" is the one outcome that looks identical to a
 * silent breakage.
 */

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  getActiveSpan: vi.fn(),
  addBreadcrumb: vi.fn(),
  browserTracingIntegration: vi.fn(() => ({ name: 'BrowserTracing' })),
}));

/** Registered vital callbacks, keyed by the metric each `on*` reports. */
const registered = vi.hoisted(() => new Map<string, (m: unknown) => void>());

vi.mock('@sentry/browser', () => sentry);
vi.mock('web-vitals', () => ({
  onCLS: (cb: (m: unknown) => void) => registered.set('CLS', cb),
  onFCP: (cb: (m: unknown) => void) => registered.set('FCP', cb),
  onINP: (cb: (m: unknown) => void) => registered.set('INP', cb),
  onLCP: (cb: (m: unknown) => void) => registered.set('LCP', cb),
  onTTFB: (cb: (m: unknown) => void) => registered.set('TTFB', cb),
}));

const DSN = 'https://examplePublicKey@o0.ingest.sentry.io/0';

function metric(name: string, value: number) {
  // The shape `reportVital` reads. Deliberately only these fields: if the
  // module starts reading another, this fixture stops describing reality and
  // the assertions below are the place that should notice.
  return { name, value, rating: 'good', delta: value, id: `v1-${name}` };
}

async function load({ dsn = DSN, dnt = false }: { dsn?: string; dnt?: boolean } = {}) {
  vi.resetModules();
  registered.clear();
  vi.stubEnv('PUBLIC_SENTRY_DSN', dsn);
  vi.stubGlobal('navigator', { ...navigator, doNotTrack: dnt ? '1' : undefined });
  const mod = await import('./initObservability');
  mod.initObservability();
  return mod;
}

beforeEach(() => {
  sentry.init.mockClear();
  sentry.getActiveSpan.mockReset();
  sentry.addBreadcrumb.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('initObservability: the web-vitals contract', () => {
  it('registers every metric it claims to collect', async () => {
    await load();
    // The file header promises "LCP, CLS, INP, FCP, TTFB". A dropped registrar
    // loses one silently: no error, just a metric missing from the dashboard.
    expect([...registered.keys()].sort()).toEqual(['CLS', 'FCP', 'INP', 'LCP', 'TTFB']);
  });

  it('puts a vital on the pageload span when there is one', async () => {
    const setAttribute = vi.fn();
    sentry.getActiveSpan.mockReturnValue({ setAttribute });
    await load();

    registered.get('LCP')!(metric('LCP', 1234.5));

    // Lowercased and namespaced: this is the attribute key charted in Sentry,
    // so a change here silently orphans the existing history.
    expect(setAttribute).toHaveBeenCalledWith('webvital.lcp', 1234.5);
    expect(setAttribute).toHaveBeenCalledWith('webvital.lcp.rating', 'good');
    expect(sentry.addBreadcrumb).not.toHaveBeenCalled();
  });

  it('falls back to a breadcrumb when the span has already finished', async () => {
    // The documented case: INP can fire late, after the pageload span closed.
    // Not chartable, but the value survives instead of being dropped.
    sentry.getActiveSpan.mockReturnValue(undefined);
    await load();

    registered.get('INP')!(metric('INP', 42));

    expect(sentry.addBreadcrumb).toHaveBeenCalledTimes(1);
    const crumb = sentry.addBreadcrumb.mock.calls[0]![0] as {
      category: string;
      message: string;
      data: Record<string, unknown>;
    };
    expect(crumb.category).toBe('web-vital');
    expect(crumb.message).toBe('INP=42.00 (good)');
    // The four Metric fields this module reads. If web-vitals renames one, the
    // value lands as undefined and this is what says so.
    expect(crumb.data).toMatchObject({
      name: 'INP',
      value: 42,
      rating: 'good',
      delta: 42,
    });
    expect(crumb.data.id).toBeTruthy();
  });
});

describe('initObservability: the paths that must do nothing', () => {
  it('stays silent when Do Not Track is set', async () => {
    await load({ dnt: true });
    expect(sentry.init).not.toHaveBeenCalled();
    expect(registered.size, 'vitals were collected despite DNT').toBe(0);
  });

  it('stays silent without a DSN', async () => {
    // Dev builds and forks without a Sentry account.
    await load({ dsn: '' });
    expect(sentry.init).not.toHaveBeenCalled();
    expect(registered.size).toBe(0);
  });

  it('never asks Sentry to attach the client IP', async () => {
    await load();
    expect(sentry.init).toHaveBeenCalledTimes(1);
    const options = sentry.init.mock.calls[0]![0] as Record<string, unknown>;
    // Stated in the header as "material for EU/GDPR posture", which makes it a
    // property rather than a preference.
    expect(options.sendDefaultPii).toBe(false);
    expect(options.replaysSessionSampleRate).toBe(0);
  });
});
