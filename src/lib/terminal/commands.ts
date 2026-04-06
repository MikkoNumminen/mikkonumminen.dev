import type { CommandSpec } from './types';

const EMAIL = 'numminen.mikko.petteri@gmail.com';
const GITHUB = 'https://github.com/MikkoNumminen';
const LINKEDIN = 'https://www.linkedin.com/in/mikko-numminen-269795205/';
const CV_PATH = '/mikko-numminen-cv.pdf';

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

export const commands: CommandSpec[] = [
  {
    name: 'help',
    description: 'list available commands',
    handler: (_, ctx) => {
      const visible = commands.filter((c) => !c.hidden);
      const width = Math.max(...visible.map((c) => c.name.length));
      ctx.print('available commands:', 'dim');
      visible.forEach((c) => {
        const padded = c.name.padEnd(width + 4, ' ');
        ctx.printHTML(
          `<span class="line"><span style="color:var(--color-term-green)">${escape(padded)}</span><span style="color:var(--color-term-dim)">${escape(c.description)}</span></span>`,
        );
      });
      ctx.print('');
      ctx.print('tip: try `whoami`, `contact --email`, or `sudo hire mikko`', 'dim');
    },
  },
  {
    name: 'whoami',
    description: 'short bio',
    handler: (_, ctx) => {
      ctx.print('mikko numminen', 'accent');
      ctx.print('full-stack developer · finland', 'dim');
      ctx.print('');
      ctx.print('builds production web apps with ai-assisted workflows.');
      ctx.print('largest: hr-manager-pearl.vercel.app — 1828+ tests, 91.9% coverage.');
      ctx.print('also: vuohiliitto.com (community platform), read-log-pi.vercel.app');
      ctx.print('');
      ctx.print('currently exploring three.js, gsap, and motion craft.', 'dim');
    },
  },
  {
    name: 'contact',
    description: 'show contact info',
    usage: 'contact [--email]',
    handler: (args, ctx) => {
      if (args.length === 0 || args.includes('--email')) {
        ctx.printHTML(
          `<span class="line">email: <a href="mailto:${EMAIL}">${EMAIL}</a><button class="copy" data-copy="${EMAIL}" type="button">copy</button></span>`,
        );
        return;
      }
      ctx.print(`unknown flag: ${args.join(' ')}`, 'err');
      ctx.print('usage: contact [--email]', 'dim');
    },
  },
  {
    name: 'links',
    description: 'show online profiles',
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
      if (
        !all &&
        !args.includes('--github') &&
        !args.includes('--linkedin')
      ) {
        ctx.print(`unknown flag: ${args.join(' ')}`, 'err');
        ctx.print('usage: links [--github|--linkedin|--all]', 'dim');
      }
    },
  },
  {
    name: 'download',
    description: 'download a file',
    usage: 'download --cv',
    handler: async (args, ctx) => {
      if (!args.includes('--cv')) {
        ctx.print('usage: download --cv', 'dim');
        return;
      }
      ctx.print('preparing download...', 'dim');

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
        ctx.print('cv not available yet — still being polished.', 'err');
        ctx.printHTML(
          `<span class="line line--dim">in the meantime, reach out: <a href="mailto:${EMAIL}">${EMAIL}</a></span>`,
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
      ctx.print('cv download started.', 'accent');
    },
  },
  {
    name: 'projects',
    description: 'navigate to projects page',
    handler: (_, ctx) => {
      ctx.print('opening /projects...', 'dim');
      setTimeout(() => ctx.navigate('/projects'), 350);
    },
  },
  {
    name: 'home',
    description: 'navigate to home',
    handler: (_, ctx) => {
      ctx.print('opening /...', 'dim');
      setTimeout(() => ctx.navigate('/'), 350);
    },
  },
  {
    name: 'experience',
    description: 'navigate to experience',
    handler: (_, ctx) => {
      ctx.print('opening /experience...', 'dim');
      setTimeout(() => ctx.navigate('/experience'), 350);
    },
  },
  {
    name: 'clear',
    description: 'clear the screen',
    handler: (_, ctx) => {
      ctx.clear();
    },
  },
  {
    name: 'echo',
    description: 'print arguments',
    handler: (args, ctx) => {
      ctx.print(args.join(' '));
    },
  },
  {
    name: 'date',
    description: 'show current date',
    handler: (_, ctx) => {
      ctx.print(new Date().toString(), 'dim');
    },
  },
  {
    name: 'sudo',
    description: 'run as root (try `sudo hire mikko`)',
    handler: (args, ctx) => {
      if (args[0] === 'hire' && args[1] === 'mikko') {
        ctx.print('[sudo] password for guest: ********', 'dim');
        ctx.print('authentication... approved.', 'accent');
        ctx.print('');
        ctx.print('🎯 excellent choice.');
        ctx.print('reach out: ' + EMAIL, 'accent');
        ctx.print('or run `download --cv` to grab my résumé.', 'dim');
        return;
      }
      ctx.print(`sudo: ${args.join(' ') || '(no command)'}: command not found`, 'err');
      ctx.print('hint: try `sudo hire mikko`', 'dim');
    },
  },
  {
    name: 'man',
    description: 'show usage for a command',
    usage: 'man <command>',
    hidden: true,
    handler: (args, ctx) => {
      const target = args[0];
      if (!target) {
        ctx.print('usage: man <command>', 'dim');
        return;
      }
      const cmd = commands.find((c) => c.name === target);
      if (!cmd) {
        ctx.print(`no manual entry for ${target}`, 'err');
        return;
      }
      ctx.print(`NAME`, 'accent');
      ctx.print(`    ${cmd.name} — ${cmd.description}`);
      if (cmd.usage) {
        ctx.print('');
        ctx.print('USAGE', 'accent');
        ctx.print(`    ${cmd.usage}`);
      }
    },
  },
];

export const commandMap = new Map(commands.map((c) => [c.name, c]));
