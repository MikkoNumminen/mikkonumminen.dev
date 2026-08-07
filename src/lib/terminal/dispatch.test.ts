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
      reset: async () => {},
      setContextCallback: () => {},
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

  it('leaves an argument alone when it matches no document', () => {
    expect(tabComplete('download arg', commands)).toBe('download arg');
  });

  it('does not complete arguments for commands that publish none', () => {
    // `links` takes flags but declares no `completions`, so Tab must not invent
    // any. Only `download` opts in.
    expect(tabComplete('links --gi', commands)).toBe('links --gi');
  });
});

describe('tabComplete on download arguments', () => {
  it('completes a unique document id and appends a space', () => {
    expect(tabComplete('download blind', commands)).toBe('download blindtest ');
  });

  it('completes to the shared prefix when several documents match', () => {
    // `replicates` and `results` both start with "re". A real shell fills in the
    // common part and waits, rather than picking one or doing nothing.
    expect(tabComplete('download r', commands)).toBe('download re');
  });

  it('leaves the cursor unspaced on a shared prefix', () => {
    // The absent trailing space is the signal that more typing is needed.
    expect(tabComplete('download re', commands)).not.toMatch(/ $/);
  });

  it('keeps the dashes the visitor typed', () => {
    // Completing `--bli` to a bare `blindtest` would silently respell their
    // input; both spellings work, so neither should be rewritten under them.
    expect(tabComplete('download --bli', commands)).toBe('download --blindtest ');
  });

  it('completes case-insensitively', () => {
    expect(tabComplete('download BLIND', commands)).toBe('download blindtest ');
  });

  it('does nothing on a bare `download ` with nothing typed yet', () => {
    // Not the argument path at all: `tokenize` trims, so this is still one
    // token and the first-token branch re-completes the command name to the
    // same string. Worth pinning because it is the boundary between the two
    // branches, and it is why the argument path never sees a trailing space.
    expect(tabComplete('download ', commands)).toBe('download ');
  });

  it('does not shorten what is already there', () => {
    // `blindtest` is complete; completing it again must not truncate it back to
    // a prefix or re-append a space it already has.
    expect(tabComplete('download blindtest', commands)).toBe('download blindtest ');
  });

  it('leaves an unmatched argument untouched rather than guessing', () => {
    expect(tabComplete('download zzz', commands)).toBe('download zzz');
  });

  it('does not complete a second document', () => {
    // Found in review. `download` takes ONE document, so completing a second
    // built `download cv blindtest`, a line that can only reach the "you named
    // two" error. Tab must not help assemble a command that is already wrong.
    expect(tabComplete('download cv bli', commands)).toBe('download cv bli');
    expect(tabComplete('download cv ', commands)).toBe('download cv ');
    expect(tabComplete('download blindtest po', commands)).toBe('download blindtest po');
  });

  it('still completes the first argument after leading whitespace', () => {
    // `tokenize` trims, so the position of the token being completed cannot be
    // read off the token count alone. This is the case that would break if it
    // were.
    expect(tabComplete('   download bli', commands)).toBe('   download blindtest ');
  });

  it('preserves odd internal spacing while completing', () => {
    expect(tabComplete('download   blind', commands)).toBe('download   blindtest ');
  });

  it('is idempotent under repeated presses', () => {
    const once = tabComplete('download bli', commands);
    expect(tabComplete(once, commands)).toBe(once);
  });
});
