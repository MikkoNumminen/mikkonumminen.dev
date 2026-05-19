import type { Translations } from '../../i18n';
import { escapeHtml as escape } from '../utils/escapeHtml';
import { runSkillsCommand } from './skills';
import type { CommandSpec } from './types';

const EMAIL = 'numminen.mikko.petteri@gmail.com';
const GITHUB = 'https://github.com/MikkoNumminen';
const LINKEDIN = 'https://www.linkedin.com/in/mikko-numminen-269795205/';
const CV_PATH = '/mikko-numminen-cv.pdf';
const SKILLS_PDF_PATH = '/skills-registry.pdf';

/**
 * Build the terminal command set for a given locale.
 *
 * Command names (`help`, `whoami`, etc.) and their flag syntax (`--email`,
 * `--cv`) are intentionally NOT translated — they are part of the CLI
 * surface and stay in English across all locales. Only the descriptions,
 * output text, and error messages are localized.
 */
export function buildCommands(t: Translations): CommandSpec[] {
  const tt = t.terminal;

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
          `<span class="line">${escape(tt.cmdWhoamiAlso)} <a href="https://spacepotatis.vercel.app" target="_blank" rel="noopener noreferrer">spacepotatis.vercel.app</a> (${escape(tt.cmdWhoamiGame)}), <a href="https://github.com/MikkoNumminen/AudiobookMaker" target="_blank" rel="noopener noreferrer">audiobookmaker</a> (${escape(tt.cmdWhoamiDesktop)}), <a href="https://vuohiliitto.com" target="_blank" rel="noopener noreferrer">vuohiliitto.com</a> (${escape(tt.cmdWhoamiCommunity)})</span>`,
        );
        ctx.printHTML(
          `<span class="line">${escape(tt.cmdWhoamiYear)} 7 projects shipped solo · ~3.13M tokens saved · 2 PRs upstream to <a href="https://github.com/resemble-ai/chatterbox" target="_blank" rel="noopener noreferrer">resemble-ai/chatterbox</a></span>`,
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
        const wantsCv = args.includes('--cv');
        const wantsSkills = args.includes('--skills');
        if (!wantsCv && !wantsSkills) {
          ctx.print(tt.cmdDownloadIntro, 'dim');
          const opts: Array<[string, string]> = [
            ['--cv', tt.cmdDownloadOptionCv],
            ['--skills', tt.cmdDownloadOptionSkills],
          ];
          // Two-space indent + flag + four-space gap before description, so
          // the description column lines up regardless of which flag is
          // longest. `padEnd` handles the variable flag length.
          const INDENT = 2;
          const GAP = 4;
          const colWidth = INDENT + Math.max(...opts.map(([f]) => f.length)) + GAP;
          opts.forEach(([flag, desc]) => {
            const padded = ' '.repeat(INDENT) + flag.padEnd(colWidth - INDENT, ' ');
            ctx.printHTML(
              `<span class="line"><span style="color:var(--color-term-green)">${escape(padded)}</span><span style="color:var(--color-term-dim)">${escape(desc)}</span></span>`,
            );
          });
          ctx.print('');
          ctx.print(tt.cmdDownloadTryHint, 'dim');
          return;
        }
        if (wantsCv && wantsSkills) {
          ctx.print(tt.cmdDownloadAmbiguous, 'err');
          ctx.print(tt.cmdDownloadTryHint, 'dim');
          return;
        }
        const target = wantsCv
          ? {
              url: CV_PATH,
              filename: 'mikko-numminen-cv.pdf',
              notAvailableMsg: tt.cmdDownloadNotAvailable,
            }
          : {
              url: SKILLS_PDF_PATH,
              filename: 'skills-registry.pdf',
              notAvailableMsg: tt.cmdDownloadSkillsNotAvailable,
            };

        ctx.print(tt.cmdDownloadPreparing, 'dim');

        // Verify the file actually exists before triggering the browser download —
        // otherwise the user gets a confusing OS-level "file not found" toast
        // instead of useful feedback inside the terminal.
        let available = false;
        try {
          const res = await fetch(target.url, { method: 'HEAD', cache: 'no-store' });
          available = res.ok;
        } catch {
          available = false;
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
      name: 'clear',
      description: tt.cmdClearDesc,
      handler: (_, ctx) => {
        ctx.clear();
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
