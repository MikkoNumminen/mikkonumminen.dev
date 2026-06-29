import type { Translations } from '../../i18n';
import { escapeHtml as escape } from '../utils/escapeHtml';
import { runSkillsCommand } from './skills';
import type { CommandContext, CommandSpec } from './types';
import { localizeProjects, type LocalizedProject } from '../../data/projects';
import { resetChatSession } from './chat';

const EMAIL = 'numminen.mikko.petteri@gmail.com';
const GITHUB = 'https://github.com/MikkoNumminen';
const LINKEDIN = 'https://www.linkedin.com/in/mikko-numminen-269795205/';
const CV_PATH = '/mikko-numminen-cv.pdf';
const REGISTRY_PDF_PATH = '/skills-registry.pdf';
const CALIBRATION_PDF_PATH = '/skills-suite-calibration.pdf';
const STUDY_PDF_PATH = '/skills-optim-study.pdf';
const REPLICATES_PDF_PATH = '/skills-optim-study-replicates.pdf';
const RESULTS_PDF_PATH = '/skills-results.pdf';
const FINNISH_STUDY_PDF_PATH = '/rag-finnish-experiment.pdf';

/**
 * Print one project's "file" — the scripted alternative to asking the RAG about
 * it. Sourced from the localized project data (`t.projectsData`), so it reads in
 * the active locale. Field labels (tech/live/code) are shell-style and stay in
 * English like the `links` command's labels.
 */
function printProjectCard(p: LocalizedProject, ctx: CommandContext): void {
  ctx.print(p.name, 'accent');
  if (p.tagline) ctx.print(p.tagline, 'dim');
  if (p.description) {
    ctx.print('');
    ctx.print(p.description);
  }
  if (p.highlights && p.highlights.length > 0) {
    ctx.print('');
    for (const h of p.highlights) ctx.print(`- ${h}`, 'dim');
  }
  ctx.print('');
  ctx.print(`tech: ${p.tech.join(', ')}`, 'dim');
  if (p.liveUrl) {
    ctx.printHTML(
      `<span class="line">live: <a href="${escape(p.liveUrl)}" target="_blank" rel="noopener noreferrer">${escape(p.liveUrl)}</a></span>`,
    );
  }
  if (p.githubUrl) {
    ctx.printHTML(
      `<span class="line">code: <a href="${escape(p.githubUrl)}" target="_blank" rel="noopener noreferrer">${escape(p.githubUrl)}</a></span>`,
    );
  }
}

/** Short scripted CV summary; the full résumé is the `download --cv` PDF. */
function printCv(ctx: CommandContext, tt: Translations['terminal']): void {
  ctx.print(tt.cmdWhoamiName, 'accent');
  ctx.print(tt.cmdWhoamiTitle, 'dim');
  ctx.print('');
  ctx.print(tt.cmdWhoamiIntro);
  ctx.print('');
  ctx.print(tt.cmdCvDownloadHint, 'dim');
}

/**
 * Build the terminal command set for a given locale.
 *
 * Command names (`help`, `whoami`, etc.) and their flag syntax (`--email`,
 * `--cv`) are intentionally NOT translated — they are part of the CLI
 * surface and stay in English across all locales. Only the descriptions,
 * output text, and error messages are localized.
 *
 * `callbacks.onAfterClear` is called by the `clear` handler after wiping the
 * output and resetting the chat session — Terminal.astro uses it to hide and
 * reset the context donut.
 */
export function buildCommands(
  t: Translations,
  callbacks?: { onAfterClear?: () => void | Promise<void> },
): CommandSpec[] {
  const tt = t.terminal;
  const localized = localizeProjects(t);

  const cmds: CommandSpec[] = [
    {
      name: 'help',
      description: tt.cmdHelpDesc,
      handler: (_, ctx) => {
        const visible = cmds.filter((c) => !c.hidden);
        const width = Math.max(...visible.map((c) => c.name.length));
        ctx.print(tt.cmdHelpAvailable, 'dim');
        visible.forEach((c) => {
          const padded = c.name.padEnd(width + 4, ' ');
          ctx.printHTML(
            `<span class="line"><span style="color:var(--color-term-green)">${escape(padded)}</span><span style="color:var(--color-term-dim)">${escape(c.description)}</span></span>`,
          );
        });
        ctx.print('');
        ctx.print(tt.cmdHelpTip, 'dim');
      },
    },
    {
      name: 'whoami',
      description: tt.cmdWhoamiDesc,
      handler: (_, ctx) => {
        ctx.print(tt.cmdWhoamiName, 'accent');
        ctx.print(tt.cmdWhoamiTitle, 'dim');
        ctx.print('');
        ctx.print(tt.cmdWhoamiIntro);
        const largestStats = tt.cmdWhoamiLargestStats
          .replace('{tests}', '1828')
          .replace('{coverage}', '91.9%');
        ctx.printHTML(
          `<span class="line">${escape(tt.cmdWhoamiLargest)} <a href="https://hr-manager-pearl.vercel.app" target="_blank" rel="noopener noreferrer">hr-manager-pearl.vercel.app</a> — ${escape(largestStats)}</span>`,
        );
        ctx.printHTML(
          `<span class="line">${escape(tt.cmdWhoamiAlso)} <a href="https://spacepotatis.vercel.app" target="_blank" rel="noopener noreferrer">spacepotatis.vercel.app</a> (${escape(tt.cmdWhoamiGame)}), <a href="https://github.com/MikkoNumminen/AudiobookMaker" target="_blank" rel="noopener noreferrer">audiobookmaker</a> (${escape(tt.cmdWhoamiDesktop)}), <a href="https://vuohiliitto.com" target="_blank" rel="noopener noreferrer">vuohiliitto.com</a> (${escape(tt.cmdWhoamiCommunity)})</span>`,
        );
        const yearStats = tt.cmdWhoamiYearStats
          .replace('{projects}', '9')
          .replace('{tokens}', '3.13M')
          .replace('{prs}', '2');
        ctx.printHTML(
          `<span class="line">${escape(tt.cmdWhoamiYear)} ${escape(yearStats)} <a href="https://github.com/resemble-ai/chatterbox" target="_blank" rel="noopener noreferrer">resemble-ai/chatterbox</a></span>`,
        );
        ctx.print('');
        ctx.print(tt.cmdWhoamiCurrently, 'dim');
      },
    },
    {
      name: 'contact',
      description: tt.cmdContactDesc,
      usage: 'contact [--email]',
      handler: (args, ctx) => {
        if (args.length === 0 || args.includes('--email')) {
          ctx.printHTML(
            `<span class="line">${escape(tt.cmdContactEmailLabel)} <a href="mailto:${EMAIL}">${EMAIL}</a><button class="copy" data-copy="${EMAIL}" type="button">${escape(tt.copyButton)}</button></span>`,
          );
          return;
        }
        ctx.print(`${tt.cmdContactUnknownFlag} ${args.join(' ')}`, 'err');
        ctx.print(tt.cmdContactUsage, 'dim');
      },
    },
    {
      name: 'links',
      description: tt.cmdLinksDesc,
      usage: 'links [--github|--linkedin|--all]',
      handler: (args, ctx) => {
        const all = args.length === 0 || args.includes('--all');
        if (all || args.includes('--github')) {
          ctx.printHTML(
            `<span class="line">github:   <a href="${GITHUB}" target="_blank" rel="noopener noreferrer">${GITHUB}</a></span>`,
          );
        }
        if (all || args.includes('--linkedin')) {
          ctx.printHTML(
            `<span class="line">linkedin: <a href="${LINKEDIN}" target="_blank" rel="noopener noreferrer">${LINKEDIN}</a></span>`,
          );
        }
        if (!all && !args.includes('--github') && !args.includes('--linkedin')) {
          ctx.print(`${tt.cmdLinksUnknownFlag} ${args.join(' ')}`, 'err');
          ctx.print(tt.cmdLinksUsage, 'dim');
        }
      },
    },
    {
      name: 'download',
      description: tt.cmdDownloadDesc,
      usage: tt.cmdDownloadUsage,
      handler: async (args, ctx) => {
        // Flag → downloadable target. `tier` drives the two-level menu: bare
        // `download` lists the 'primary' rows (just the cv) plus a synthetic
        // `--research` row; `download --research` then lists the 'research' rows
        // (the catalog, the study/replicates/results methodology trail, and the
        // calibration snapshot), so the default view never floods. Every
        // entry in THIS array is a real download — `--research` is deliberately
        // NOT here, because it lists rather than downloads (a flag with no url
        // would 404 through the download branch); it's appended as a menu row
        // below. Adding a target is a one-line append; selection, listing, and
        // ambiguity handling below all drive off this array.
        const targets: {
          flag: string;
          tier: 'primary' | 'research';
          label: string;
          url: string;
          filename: string;
          notAvailableMsg: string;
        }[] = [
          {
            flag: '--cv',
            tier: 'primary',
            label: tt.cmdDownloadOptionCv,
            url: CV_PATH,
            filename: 'mikko-numminen-cv.pdf',
            notAvailableMsg: tt.cmdDownloadNotAvailable,
          },
          {
            flag: '--catalog',
            tier: 'research',
            label: tt.cmdDownloadOptionCatalog,
            url: REGISTRY_PDF_PATH,
            filename: 'skills-registry.pdf',
            notAvailableMsg: tt.cmdDownloadCatalogNotAvailable,
          },
          {
            flag: '--study',
            tier: 'research',
            label: tt.cmdDownloadOptionStudy,
            url: STUDY_PDF_PATH,
            filename: 'skills-optim-study.pdf',
            notAvailableMsg: tt.cmdDownloadStudyNotAvailable,
          },
          {
            flag: '--replicates',
            tier: 'research',
            label: tt.cmdDownloadOptionReplicates,
            url: REPLICATES_PDF_PATH,
            filename: 'skills-optim-study-replicates.pdf',
            notAvailableMsg: tt.cmdDownloadReplicatesNotAvailable,
          },
          {
            flag: '--results',
            tier: 'research',
            label: tt.cmdDownloadOptionResults,
            url: RESULTS_PDF_PATH,
            filename: 'skills-results.pdf',
            notAvailableMsg: tt.cmdDownloadResultsNotAvailable,
          },
          {
            flag: '--calibration',
            tier: 'research',
            label: tt.cmdDownloadOptionSkills,
            url: CALIBRATION_PDF_PATH,
            filename: 'skills-suite-calibration.pdf',
            notAvailableMsg: tt.cmdDownloadSkillsNotAvailable,
          },
          {
            flag: '--finnish',
            tier: 'research',
            label: tt.cmdDownloadOptionFinnish,
            url: FINNISH_STUDY_PDF_PATH,
            filename: 'rag-finnish-experiment.pdf',
            notAvailableMsg: tt.cmdDownloadFinnishNotAvailable,
          },
        ];

        // Render an aligned flag/description list. The description column lines
        // up to the longest flag in *this* list, so each tier aligns on its own
        // — the bare menu's short flags don't inherit the research flags' width.
        // Typed to the minimal {flag,label} shape so the synthetic `--research`
        // row (which has no url) can be passed alongside real targets.
        const printOptions = (rows: { flag: string; label: string }[]) => {
          const INDENT = 2;
          const GAP = 4;
          const colWidth = INDENT + Math.max(...rows.map((row) => row.flag.length)) + GAP;
          rows.forEach(({ flag, label }) => {
            const padded = ' '.repeat(INDENT) + flag.padEnd(colWidth - INDENT, ' ');
            ctx.printHTML(
              `<span class="line"><span style="color:var(--color-term-green)">${escape(padded)}</span><span style="color:var(--color-term-dim)">${escape(label)}</span></span>`,
            );
          });
        };

        const selected = targets.filter((tgt) => args.includes(tgt.flag));
        if (selected.length === 0) {
          if (args.includes('--research')) {
            ctx.print(tt.cmdDownloadResearchIntro, 'dim');
            printOptions(targets.filter((tgt) => tgt.tier === 'research'));
            ctx.print('');
            ctx.print(tt.cmdDownloadResearchHint, 'dim');
            return;
          }
          // A leftover `--` token that's neither a known target flag nor
          // `--research` is a typo, not a request for the menu — error on it
          // the way contact/links/skills do, instead of silently showing the
          // default list. Bare `download` (no `--` tokens) still falls through
          // to the menu below.
          const known = new Set(targets.map((tgt) => tgt.flag));
          const unknown = args.filter((a) => a.startsWith('--') && !known.has(a));
          if (unknown.length > 0) {
            ctx.print(`${tt.cmdLinksUnknownFlag} ${unknown.join(' ')}`, 'err');
            ctx.print(tt.cmdDownloadTryHint, 'dim');
            return;
          }
          // `--research` rides in the green flag column as a first-class row so
          // a skimmer discovers it by the same scan that reads cv/skills — but
          // it's a listing trigger, handled by the branch above, not a target.
          ctx.print(tt.cmdDownloadIntro, 'dim');
          printOptions([
            ...targets.filter((tgt) => tgt.tier === 'primary'),
            { flag: '--research', label: tt.cmdDownloadOptionResearch },
          ]);
          return;
        }
        if (selected.length > 1) {
          ctx.print(tt.cmdDownloadAmbiguous, 'err');
          ctx.print(tt.cmdDownloadTryHint, 'dim');
          return;
        }
        const target = selected[0];
        if (!target) return; // unreachable: length is exactly 1 here

        ctx.print(tt.cmdDownloadPreparing, 'dim');

        // Verify the file actually exists before triggering the browser download —
        // otherwise the user gets a confusing OS-level "file not found" toast
        // instead of useful feedback inside the terminal.
        let available = false;
        try {
          const res = await fetch(target.url, {
            method: 'HEAD',
            cache: 'no-store',
            signal: AbortSignal.timeout(10_000),
          });
          available = res.ok;
        } catch {
          // fetch failed (network / timeout / abort) — leave `available`
          // false from its initializer and fall through to the error path.
        }

        if (!available) {
          ctx.print(target.notAvailableMsg, 'err');
          ctx.printHTML(
            `<span class="line line--dim">${escape(tt.cmdDownloadMeantime)} <a href="mailto:${EMAIL}">${EMAIL}</a></span>`,
          );
          return;
        }

        const a = document.createElement('a');
        a.href = target.url;
        a.download = target.filename;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        ctx.print(tt.cmdDownloadStarted, 'accent');
      },
    },
    {
      name: 'skills',
      description: tt.cmdSkillsDesc,
      usage: tt.cmdSkillsUsage,
      handler: async (args, ctx) => {
        await runSkillsCommand(args, ctx, t);
      },
    },
    {
      name: 'ls',
      description: tt.cmdLsDesc,
      usage: 'ls [projects]',
      handler: (args, ctx) => {
        const target = (args[0] ?? '').replace(/\/+$/, '');
        if (!target) {
          // Top-level virtual listing — a dir of projects plus the cv "file".
          ctx.printHTML(
            `<span class="line"><span style="color:var(--color-term-cyan)">projects/</span>  cv</span>`,
          );
          return;
        }
        if (target === 'projects') {
          ctx.print(localized.map((p) => p.id).join('  '));
          return;
        }
        ctx.print(`ls: cannot access '${args[0] ?? ''}': ${tt.cmdLsNoSuch}`, 'err');
      },
    },
    {
      name: 'cat',
      description: tt.cmdCatDesc,
      usage: 'cat <path>',
      handler: (args, ctx) => {
        const raw = args[0];
        if (!raw) {
          ctx.print(tt.cmdCatUsage, 'dim');
          return;
        }
        const path = raw.replace(/\.md$/, '');
        if (path === 'cv') {
          printCv(ctx, tt);
          return;
        }
        const id = /^projects\/(.+)$/.exec(path)?.[1];
        if (id) {
          const project = localized.find((p) => p.id === id);
          if (project) {
            printProjectCard(project, ctx);
            return;
          }
        }
        ctx.print(`cat: ${raw}: ${tt.cmdCatNoSuch}`, 'err');
      },
    },
    {
      name: 'cv',
      description: tt.cmdCvDesc,
      handler: (_, ctx) => {
        printCv(ctx, tt);
      },
    },
    {
      name: 'clear',
      description: tt.cmdClearDesc,
      handler: async (_, ctx) => {
        ctx.clear();
        await resetChatSession();
        if (callbacks?.onAfterClear) await callbacks.onAfterClear();
      },
    },
    {
      name: 'man',
      description: tt.cmdManDesc,
      usage: tt.cmdManUsage,
      hidden: true,
      handler: (args, ctx) => {
        const target = args[0];
        if (!target) {
          ctx.print(`${tt.cmdManUsageLabel.toLowerCase()}: ${tt.cmdManUsage}`, 'dim');
          return;
        }
        const cmd = cmds.find((c) => c.name === target);
        if (!cmd) {
          ctx.print(`${tt.cmdManNoEntry} ${target}`, 'err');
          return;
        }
        ctx.print(tt.cmdManNameLabel, 'accent');
        ctx.print(`    ${cmd.name} — ${cmd.description}`);
        if (cmd.usage) {
          ctx.print('');
          ctx.print(tt.cmdManUsageLabel, 'accent');
          ctx.print(`    ${cmd.usage}`);
        }
      },
    },
    {
      // Easter egg — hidden from `help`. `sudo hire mikko` is the intended path;
      // anything else gets a playful denial in keeping with the shell tone.
      name: 'sudo',
      description: tt.cmdSudoDesc,
      hidden: true,
      handler: (args, ctx) => {
        if (args.join(' ').toLowerCase() === 'hire mikko') {
          ctx.print(tt.cmdSudoHire, 'accent');
          return;
        }
        ctx.print(tt.cmdSudoDenied, 'err');
      },
    },
    {
      // Easter egg — hidden. A cheeky refusal; there is nothing here to delete.
      name: 'rm',
      description: tt.cmdRmDesc,
      hidden: true,
      handler: (_, ctx) => {
        ctx.print(tt.cmdRmRefusal, 'err');
      },
    },
  ];

  return cmds;
}
