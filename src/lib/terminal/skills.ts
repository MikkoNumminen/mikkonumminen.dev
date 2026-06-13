import type { Translations } from '../../i18n';
import { escapeHtml as escape } from '../utils/escapeHtml';
import type { CommandContext } from './types';

/**
 * Consumer of the `skill-registry` skill's JSON output.
 *
 * The skill lives in `.claude/skills/skill-registry/` and is run locally by
 * the author. It scans every sibling repo in the workspace and writes
 * a dated markdown report plus a JSON sibling. To surface the registry in
 * the contact-page terminal, the author copies the JSON output to
 * `public/data/skills-registry.json` and the `skills` command fetches it at
 * runtime. Until the file exists, the command renders a graceful empty
 * state — the page does not 404, and nothing in CI breaks if the file is
 * absent.
 */

export interface SkillReceipt {
  /** File path or URL the token-savings estimate is traceable to. */
  path: string;
  /** Where the estimate was sourced from. */
  source: string;
  tokens_per_use: number | null;
  uses_per_year: number | null;
  annual_total: number | null;
}

export interface RegistrySkill {
  name: string;
  description: string;
  /** True when the SKILL.md is a redirect stub for another skill (e.g. `new-weapon` → `equipment`). */
  redirect: boolean;
  receipt: SkillReceipt | null;
  /** ISO date of the last audit, if recorded in frontmatter. */
  last_audited?: string;
}

export interface RegistryRepo {
  name: string;
  github_url?: string;
  skills: RegistrySkill[];
}

/**
 * A tracked built-in (e.g. Claude Code's `/review`) surfaced as a reference
 * point alongside the custom skills. The terminal does not render these (the
 * registry PDF does), but they ARE a top-level field of the served artifact, so
 * they're declared here to keep this interface a faithful description of the
 * JSON. Only the core measurement fields are guaranteed; the A/B-calibration
 * and alt-model detail evolves with the renderer, hence the open index.
 */
export interface RegistryBuiltInReference {
  name: string;
  label: string;
  description: string;
  invocations_in_window: number;
  total_tokens_in_window: number;
  tokens_per_use_avg: number;
  annual_total: number;
  uses_per_year: number;
  last_invoked: string;
  measurement_window_days: number;
  /** Optional calibration / alt-model fields layered on by the overlay pipeline. */
  [key: string]: unknown;
}

export interface SkillRegistry {
  /** ISO 8601 timestamp of when the registry was generated. */
  generated_at: string;
  repos: RegistryRepo[];
  totals: {
    skills: number;
    redirects: number;
    with_receipts: number;
    annual_tokens_saved: number;
  };
  /** Tracked built-ins (e.g. `/review`). Present once the overlay runs; consumed by the PDF renderer, not the terminal. */
  built_in_references?: RegistryBuiltInReference[];
}

const REGISTRY_PATH = '/data/skills-registry.json';

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/**
 * Runtime shape-guard for the fetched registry JSON.
 *
 * The file is an author-controlled build artifact, but it is fetched at
 * runtime and was previously trusted via a blind `as SkillRegistry` cast — a
 * truncated or malformed file would surface as an opaque render crash rather
 * than the intended graceful empty state. This validates the skeleton the
 * renderer actually walks (`repos[].skills[]` with the required scalar fields)
 * and returns `null` on any structural mismatch.
 *
 * It is deliberately tolerant of the receipt's *inner* shape: the enrichment
 * pipeline layers many optional fields (calibration buckets, alt-model
 * measurements, prior estimates) onto each receipt, so validating beyond
 * "null or object" would reject perfectly good enriched data.
 */
export function parseRegistry(raw: unknown): SkillRegistry | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.generated_at !== 'string') return null;
  if (!isRecord(raw.totals)) return null;
  if (!Array.isArray(raw.repos)) return null;
  // built_in_references is optional; if present it must be an array of objects
  // that each carry a string `name` (the rest of the shape is renderer-owned and
  // deliberately open — the build-time schema validation covers it in depth).
  if (raw.built_in_references !== undefined) {
    if (!Array.isArray(raw.built_in_references)) return null;
    for (const ref of raw.built_in_references) {
      if (!isRecord(ref) || typeof ref.name !== 'string') return null;
    }
  }

  for (const repo of raw.repos) {
    if (!isRecord(repo)) return null;
    if (typeof repo.name !== 'string') return null;
    if (!Array.isArray(repo.skills)) return null;
    for (const skill of repo.skills) {
      if (!isRecord(skill)) return null;
      if (typeof skill.name !== 'string') return null;
      if (typeof skill.description !== 'string') return null;
      if (typeof skill.redirect !== 'boolean') return null;
      if (skill.receipt !== null && !isRecord(skill.receipt)) return null;
    }
  }

  return raw as unknown as SkillRegistry;
}

// Cache the fetch promise for a minute so repeated `skills` invocations in
// one session don't re-hit the network. Long enough to be useful, short
// enough that replacing the file on disk shows up within a reload.
const CACHE_TTL_MS = 60_000;
// `loadedAt` is stamped at RESOLUTION, not at fetch start — stamping it before
// the fetch resolves would shorten the effective TTL by the fetch's own
// latency. It stays null while the fetch is in flight so the TTL check below
// only kicks in once a load has actually completed.
let registryCache: {
  promise: Promise<SkillRegistry | null>;
  loadedAt: number | null;
} | null = null;

async function fetchRegistry(): Promise<SkillRegistry | null> {
  // Share the in-flight or fresh-enough cached promise. Caching the promise
  // synchronously (before it resolves) means concurrent callers all await the
  // same fetch instead of each firing their own. An in-flight entry has
  // loadedAt === null and is always reused; a resolved entry is reused only
  // while inside the TTL.
  if (
    registryCache &&
    (registryCache.loadedAt === null ||
      Date.now() - registryCache.loadedAt < CACHE_TTL_MS)
  ) {
    return registryCache.promise;
  }

  const promise = (async () => {
    try {
      const res = await fetch(REGISTRY_PATH, {
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return null;
      const parsed = parseRegistry(await res.json());
      if (!parsed && import.meta.env.DEV) {
        console.warn(
          '[skills] registry JSON failed shape validation — rendering empty state',
        );
      }
      return parsed;
    } catch {
      return null;
    }
  })();

  // Store the in-flight promise synchronously so concurrent calls share it.
  registryCache = { promise, loadedAt: null };

  void promise.then((result) => {
    // Stamp the cache time at resolution so the TTL counts from when the data
    // actually landed. Only keep a successful load — caching a null (404 /
    // network error / timeout) would short-circuit every retry for the full
    // TTL, so a transient failure would wedge the `skills` command. Clearing
    // back to null on failure leaves a retry possible. Guard the identity check
    // so a newer fetch that replaced this entry isn't clobbered.
    if (registryCache?.promise !== promise) return;
    registryCache = result !== null ? { promise, loadedAt: Date.now() } : null;
  });

  return promise;
}

// Only http(s) URLs become clickable; local paths are rendered as plain
// text. This blocks `javascript:` / `data:` payloads from a malformed
// registry file from ever reaching an `href`.
function isSafeHref(url: string): boolean {
  return url.startsWith('https://') || url.startsWith('http://');
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function printTable(ctx: CommandContext, headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)),
  );
  const fmtRow = (cells: string[]): string =>
    cells
      .map((c, i) => {
        const w = widths[i] ?? 0;
        return i === 0 ? c.padEnd(w) : c.padStart(w);
      })
      .join('  ');
  ctx.print(fmtRow(headers), 'accent');
  ctx.print(fmtRow(widths.map((w) => '─'.repeat(w))), 'dim');
  for (const row of rows) ctx.print(fmtRow(row));
}

function renderSkillLine(
  s: RegistrySkill,
  ctx: CommandContext,
  tt: Translations['terminal'],
): void {
  const nameLabel = s.redirect ? `${s.name} (redirect)` : s.name;
  const tokens =
    s.receipt && s.receipt.annual_total !== null
      ? `~${formatNumber(s.receipt.annual_total)}${tt.cmdSkillsPerYear}`
      : '—';
  const padded = nameLabel.padEnd(22, ' ');
  const tokenCol = tokens.padStart(12, ' ');

  const receiptCell =
    s.receipt && isSafeHref(s.receipt.path)
      ? `<a href="${escape(s.receipt.path)}" target="_blank" rel="noopener noreferrer">${escape(tt.cmdSkillsReceiptLabel)}</a>`
      : s.receipt
        ? `<span style="color:var(--color-term-dim)">[${escape(s.receipt.source)}]</span>`
        : '';

  ctx.printHTML(
    `<span class="line">` +
      `<span style="color:var(--color-term-green)">${escape(padded)}</span>` +
      `<span style="color:var(--color-term-dim)">${escape(tokenCol)}  </span>` +
      `${receiptCell}` +
      `<span> ${escape(s.description)}</span>` +
      `</span>`,
  );
}

function renderAggregate(
  reg: SkillRegistry,
  ctx: CommandContext,
  tt: Translations['terminal'],
): void {
  const rows = reg.repos.map((r) => {
    const total = r.skills.length;
    const redirects = r.skills.filter((s) => s.redirect).length;
    const withReceipts = r.skills.filter(
      (s) => s.receipt && s.receipt.annual_total !== null,
    ).length;
    const annual = r.skills.reduce((sum, s) => sum + (s.receipt?.annual_total ?? 0), 0);
    return [
      r.name,
      String(total),
      String(redirects),
      String(withReceipts),
      formatNumber(annual),
    ];
  });

  printTable(
    ctx,
    [
      tt.cmdSkillsColRepo,
      tt.cmdSkillsColSkills,
      tt.cmdSkillsColRedirects,
      tt.cmdSkillsColReceipts,
      tt.cmdSkillsColTokensYr,
    ],
    rows,
  );

  ctx.print('');
  ctx.print(
    tt.cmdSkillsTotal
      .replace('{skills}', String(reg.totals.skills))
      .replace('{redirects}', String(reg.totals.redirects))
      .replace('{receipts}', String(reg.totals.with_receipts))
      .replace('{tokens}', formatNumber(reg.totals.annual_tokens_saved)),
    'accent',
  );
  ctx.print('');
  ctx.print(tt.cmdSkillsAggregateTip, 'dim');
}

function renderRepo(
  repo: RegistryRepo,
  ctx: CommandContext,
  tt: Translations['terminal'],
): void {
  const headerHtml =
    repo.github_url && isSafeHref(repo.github_url)
      ? `<span class="line" style="color:var(--color-term-cyan)">${escape(repo.name)} — <a href="${escape(repo.github_url)}" target="_blank" rel="noopener noreferrer">${escape(repo.github_url)}</a></span>`
      : `<span class="line" style="color:var(--color-term-cyan)">${escape(repo.name)}</span>`;
  ctx.printHTML(headerHtml);
  ctx.print('');

  if (repo.skills.length === 0) {
    ctx.print(tt.cmdSkillsNoSkills, 'dim');
    return;
  }
  for (const s of repo.skills) {
    renderSkillLine(s, ctx, tt);
  }
}

function renderAll(
  reg: SkillRegistry,
  ctx: CommandContext,
  tt: Translations['terminal'],
): void {
  reg.repos.forEach((repo, i) => {
    if (i > 0) ctx.print('');
    renderRepo(repo, ctx, tt);
  });
}

export async function runSkillsCommand(
  args: string[],
  ctx: CommandContext,
  t: Translations,
): Promise<void> {
  const tt = t.terminal;

  let mode: 'aggregate' | 'all' | 'repo' | 'json' = 'aggregate';
  let repoName: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--all') mode = 'all';
    else if (a === '--json') mode = 'json';
    else if (a === '--repo') {
      mode = 'repo';
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        repoName = next;
        i++;
      }
    } else if (a && a.startsWith('--')) {
      ctx.print(`${tt.cmdSkillsUnknownFlag} ${a}`, 'err');
      ctx.print(tt.cmdSkillsUsage, 'dim');
      return;
    }
  }

  if (mode === 'json') {
    // Probe the file first so we don't pop a 404 tab on a missing registry.
    const res = await fetch(REGISTRY_PATH, {
      method: 'HEAD',
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!res || !res.ok) {
      ctx.print(tt.cmdSkillsNotGenerated, 'err');
      ctx.print(tt.cmdSkillsNotGeneratedHint, 'dim');
      return;
    }
    window.open(REGISTRY_PATH, '_blank', 'noopener');
    ctx.print(tt.cmdSkillsJsonOpened, 'dim');
    return;
  }

  ctx.print(tt.cmdSkillsLoading, 'dim');
  const registry = await fetchRegistry();
  if (!registry) {
    ctx.print(tt.cmdSkillsNotGenerated, 'err');
    ctx.print(tt.cmdSkillsNotGeneratedHint, 'dim');
    return;
  }

  const generated = new Date(registry.generated_at);
  const dateStr = Number.isNaN(generated.getTime())
    ? registry.generated_at
    : generated.toISOString().slice(0, 10);
  ctx.print(`${tt.cmdSkillsGeneratedLabel} ${dateStr}`, 'dim');
  ctx.print('');

  if (mode === 'aggregate') {
    renderAggregate(registry, ctx, tt);
    return;
  }
  if (mode === 'all') {
    renderAll(registry, ctx, tt);
    return;
  }
  if (mode === 'repo') {
    if (!repoName) {
      ctx.print(tt.cmdSkillsUsage, 'dim');
      return;
    }
    const target = repoName.toLowerCase();
    const repo = registry.repos.find((r) => r.name.toLowerCase() === target);
    if (!repo) {
      ctx.print(`${tt.cmdSkillsRepoNotFound} ${repoName}`, 'err');
      const known = registry.repos.map((r) => r.name).join(', ');
      ctx.print(`${tt.cmdSkillsKnownRepos} ${known}`, 'dim');
      return;
    }
    renderRepo(repo, ctx, tt);
  }
}
