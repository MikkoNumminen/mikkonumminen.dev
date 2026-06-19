import { describe, it, expect } from 'vitest';
import { handleCommand, tokenize, tabComplete } from './dispatch';
import { buildCommands } from './commands';
import { getTranslations } from '../../i18n';
import type { CommandContext } from './types';
import type { ChatRouter } from './chat';

// tokenize() and tabComplete() are the pure halves of the dispatcher (the
// DOM-touching handleCommand is exercised at a higher level). tabComplete is
// run against the real command set so the "hidden commands are not offered"
// and "single match completes" rules are pinned against production data.
const t = getTranslations('en');
const commands = buildCommands(t);
const commandMap = new Map(commands.map((c) => [c.name.toLowerCase(), c]));

/** A ctx that records printed lines instead of touching the real terminal DOM. */
function recordingCtx(): { ctx: CommandContext; lines: string[] } {
  const lines: string[] = [];
  const ctx: CommandContext = {
    print: (text) => lines.push(text),
    printHTML: (html) => lines.push(html),
    clear: () => {
      lines.length = 0;
    },
    navigate: () => undefined,
  };
  return { ctx, lines };
}

/** A fake chat router recording the questions routed to it. */
function fakeChat(available: boolean): { router: ChatRouter; asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    router: {
      isAvailable: () => Promise.resolve(available),
      ask: async (message) => {
        asked.push(message);
      },
    },
  };
}

async function run(input: string, chat?: ChatRouter): Promise<{ lines: string[] }> {
  const { ctx, lines } = recordingCtx();
  const output = document.createElement('div');
  await handleCommand(input, ctx, output, commandMap, t, chat);
  return { lines };
}

describe('handleCommand routing', () => {
  it('routes unrecognized input to chat when available', async () => {
    const { router, asked } = fakeChat(true);
    const { lines } = await run('what tech does hrm use', router);
    expect(asked).toEqual(['what tech does hrm use']);
    expect(lines.join('\n')).not.toContain(t.terminal.commandNotFound);
  });

  it('falls back to command-not-found when chat is unavailable', async () => {
    const { router, asked } = fakeChat(false);
    const { lines } = await run('what tech does hrm use', router);
    expect(asked).toEqual([]);
    expect(lines.join('\n')).toContain(t.terminal.commandNotFound);
  });

  it('falls back to command-not-found when no chat router is wired', async () => {
    const { lines } = await run('totally unknown thing');
    expect(lines.join('\n')).toContain(t.terminal.commandNotFound);
  });

  it('routes an explicit ask "..." to chat, stripping quotes', async () => {
    const { router, asked } = fakeChat(true);
    await run('ask "what is spacepotatis"', router);
    expect(asked).toEqual(['what is spacepotatis']);
  });

  it('routes ask without quotes', async () => {
    const { router, asked } = fakeChat(true);
    await run('ask what is readlog', router);
    expect(asked).toEqual(['what is readlog']);
  });

  it('shows usage for a bare ask and does not call chat', async () => {
    const { router, asked } = fakeChat(true);
    const { lines } = await run('ask', router);
    expect(asked).toEqual([]);
    expect(lines.join('\n')).toContain(t.terminal.chatAskUsage);
  });

  it('treats ask as unknown when chat is unavailable', async () => {
    const { router, asked } = fakeChat(false);
    const { lines } = await run('ask "hi"', router);
    expect(asked).toEqual([]);
    expect(lines.join('\n')).toContain(t.terminal.commandNotFound);
  });

  it('runs a recognized command scripted even when chat is available', async () => {
    const { router, asked } = fakeChat(true);
    const { lines } = await run('help', router);
    expect(asked).toEqual([]);
    expect(lines.join('\n')).toContain(t.terminal.cmdHelpAvailable);
  });
});

describe('tokenize', () => {
  it('splits on runs of whitespace and trims', () => {
    expect(tokenize('  help   me  ')).toEqual(['help', 'me']);
  });

  it('returns an empty array for empty or whitespace-only input', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('    ')).toEqual([]);
  });

  it('preserves argument order', () => {
    expect(tokenize('download --cv extra')).toEqual(['download', '--cv', 'extra']);
  });
});

describe('tabComplete', () => {
  it('completes a unique prefix and appends a trailing space', () => {
    // Only `help` starts with "he".
    expect(tabComplete('he', commands)).toBe('help ');
  });

  it('leaves the value unchanged when the prefix is ambiguous', () => {
    // Both `contact` and `clear` start with "c".
    expect(tabComplete('c', commands)).toBe('c');
  });

  it('leaves the value unchanged when nothing matches', () => {
    expect(tabComplete('zzz', commands)).toBe('zzz');
  });

  it('does not offer hidden commands', () => {
    // `man` is hidden and is the only command starting with "ma"; with it
    // excluded there is no candidate, so the partial is returned as-is.
    expect(tabComplete('ma', commands)).toBe('ma');
  });

  it('does not complete once past the first token', () => {
    expect(tabComplete('download arg', commands)).toBe('download arg');
  });
});
