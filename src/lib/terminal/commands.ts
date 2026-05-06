import type { Translations, Locale } from '../../i18n';
import { localizePath } from '../../i18n';
import { escapeHtml as escape } from '../utils/escapeHtml';
import type { CommandContext, CommandSpec } from './types';

const EMAIL = 'numminen.mikko.petteri@gmail.com';
const GITHUB = 'https://github.com/MikkoNumminen';
const LINKEDIN = 'https://www.linkedin.com/in/mikko-numminen-269795205/';
const CV_PATH = '/mikko-numminen-cv.pdf';

const NAV_DELAY_MS = 350;

interface NavCommandOptions {
  name: string;
  descKey: keyof Translations['terminal'];
  openingKey: keyof Translations['terminal'];
  path: string;
}

/**
 * Build the terminal command set for a given locale.
 *
 * Command names (`help`, `whoami`, `sudo`, etc.) and their flag syntax
 * (`--email`, `--cv`) are intentionally NOT translated — they are part of
 * the CLI surface and stay in English across all locales. Only the
 * descriptions, output text, and error messages are localized.
 */
export function buildCommands(t: Translations, locale: Locale): CommandSpec[] {
  const tt = t.terminal;

  // In-flight navigation timers — `clear` cancels them so a quick
  // `projects` followed by `clear` doesn't still navigate away.
  const pendingNavTimers = new Set<ReturnType<typeof setTimeout>>();

  const scheduleNavigate = (ctx: CommandContext, path: string): void => {
    const timer = setTimeout(() => {
      pendingNavTimers.delete(timer);
      ctx.navigate(path);
    }, NAV_DELAY_MS);
    pendingNavTimers.add(timer);
  };

  const navCommand = ({
    name,
    descKey,
    openingKey,
    path,
  }: NavCommandOptions): CommandSpec => ({
    name,
    description: tt[descKey],
    handler: (_, ctx) => {
      ctx.print(tt[openingKey], 'dim');
      scheduleNavigate(ctx, localizePath(path, locale));
    },
  });

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
        ctx.printHTML(
          `<span class="line">${escape(tt.cmdWhoamiLargest)} <a href="https://hr-manager-pearl.vercel.app" target="_blank" rel="noopener noreferrer">hr-manager-pearl.vercel.app</a> — 1828+ tests, 91.9% coverage.</span>`,
        );
        ctx.printHTML(
          `<span class="line">${escape(tt.cmdWhoamiAlso)} <a href="https://vuohiliitto.com" target="_blank" rel="noopener noreferrer">vuohiliitto.com</a> (${escape(tt.cmdWhoamiCommunity)}), <a href="https://read-log-pi.vercel.app" target="_blank" rel="noopener noreferrer">read-log-pi.vercel.app</a>, <a href="https://github.com/MikkoNumminen/AudiobookMaker" target="_blank" rel="noopener noreferrer">audiobookmaker</a> (${escape(tt.cmdWhoamiDesktop)})</span>`,
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
        if (!args.includes('--cv')) {
          ctx.print(tt.cmdDownloadHint, 'dim');
          return;
        }
        ctx.print(tt.cmdDownloadPreparing, 'dim');

        // Verify the file actually exists before triggering the browser download —
        // otherwise the user gets a confusing OS-level "file not found" toast
        // instead of useful feedback inside the terminal.
        let available = false;
        try {
          const res = await fetch(CV_PATH, { method: 'HEAD', cache: 'no-store' });
          available = res.ok;
        } catch {
          available = false;
        }

        if (!available) {
          ctx.print(tt.cmdDownloadNotAvailable, 'err');
          ctx.printHTML(
            `<span class="line line--dim">${escape(tt.cmdDownloadMeantime)} <a href="mailto:${EMAIL}">${EMAIL}</a></span>`,
          );
          return;
        }

        const a = document.createElement('a');
        a.href = CV_PATH;
        a.download = 'mikko-numminen-cv.pdf';
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        ctx.print(tt.cmdDownloadStarted, 'accent');
      },
    },
    navCommand({
      name: 'projects',
      descKey: 'cmdProjectsDesc',
      openingKey: 'cmdProjectsOpening',
      path: '/projects',
    }),
    navCommand({
      name: 'home',
      descKey: 'cmdHomeDesc',
      openingKey: 'cmdHomeOpening',
      path: '/',
    }),
    navCommand({
      name: 'experience',
      descKey: 'cmdExperienceDesc',
      openingKey: 'cmdExperienceOpening',
      path: '/experience',
    }),
    {
      name: 'clear',
      description: tt.cmdClearDesc,
      handler: (_, ctx) => {
        // Cancel any in-flight navigation so `projects` then `clear`
        // doesn't still send the user to /projects.
        pendingNavTimers.forEach((timer) => clearTimeout(timer));
        pendingNavTimers.clear();
        ctx.clear();
      },
    },
    {
      name: 'echo',
      description: tt.cmdEchoDesc,
      // Use rawArgs so that repeated whitespace is preserved as typed.
      handler: (_args, ctx, rawArgs = '') => {
        ctx.print(rawArgs);
      },
    },
    {
      name: 'date',
      description: tt.cmdDateDesc,
      handler: (_, ctx) => {
        ctx.print(new Date().toString(), 'dim');
      },
    },
    {
      name: 'sudo',
      description: tt.cmdSudoDesc,
      handler: (args, ctx) => {
        if (args[0] === 'hire' && args[1] === 'mikko') {
          ctx.print(tt.cmdSudoPasswordPrompt, 'dim');
          ctx.print(tt.cmdSudoApproved, 'accent');
          ctx.print('');
          ctx.print(tt.cmdSudoExcellent);
          ctx.print(`${tt.cmdSudoReachOut} ${EMAIL}`, 'accent');
          ctx.print(tt.cmdSudoOrRun, 'dim');
          return;
        }
        ctx.print(
          `sudo: ${args.join(' ') || tt.cmdSudoNoCommand}: ${tt.cmdSudoNotFound}`,
          'err',
        );
        ctx.print(tt.cmdSudoHint, 'dim');
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
  ];

  return cmds;
}
