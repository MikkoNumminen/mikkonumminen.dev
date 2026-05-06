import type { CommandContext, CommandSpec } from './types';
import { echoPromptLine } from './dom';
import type { getTranslations } from '../../i18n';

export function tokenize(input: string): string[] {
  return input.trim().split(/\s+/).filter(Boolean);
}

export async function handleCommand(
  input: string,
  ctx: CommandContext,
  output: HTMLElement,
  commandMap: Map<string, CommandSpec>,
  t: ReturnType<typeof getTranslations>,
): Promise<void> {
  echoPromptLine(output, input);

  const tokens = tokenize(input);
  if (tokens.length === 0) return;

  const name = tokens[0];
  if (!name) return;
  const args = tokens.slice(1);

  // rawArgs is the substring after the command name, preserving repeated
  // whitespace BETWEEN arguments. Used by `echo` so `echo a   b` keeps the
  // gap. The capture group spans from after the first whitespace separator
  // to end-of-input; anything before (leading whitespace + command token +
  // separator) is discarded.
  const rawArgsMatch = /^\s*\S+(?:\s+([\s\S]*))?$/.exec(input);
  const rawArgs = rawArgsMatch?.[1] ?? '';

  const cmd = commandMap.get(name);
  if (!cmd) {
    ctx.print(`${t.terminal.commandNotFound} ${name}`, 'err');
    ctx.print(t.terminal.typeHelpHint, 'dim');
    return;
  }
  try {
    await cmd.handler(args, ctx, rawArgs);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.print(`${t.terminal.errorPrefix} ${message}`, 'err');
  }
}

export function tabComplete(value: string, commands: CommandSpec[]): string {
  const tokens = tokenize(value);
  const endsWithSpace = /\s$/.test(value);
  // Treat "cmd " (trailing space, empty last token) as still in first-token
  // mode so tab-completing "help " doesn't silently no-op.
  const inFirstToken =
    tokens.length <= 1 ||
    (tokens.length === 2 && endsWithSpace && tokens[1] === '');
  if (inFirstToken) {
    const partial = (tokens[0] ?? '').toLowerCase();
    const candidates = commands
      .filter((c) => !c.hidden && c.name.startsWith(partial))
      .map((c) => c.name);
    const first = candidates[0];
    if (candidates.length === 1 && first) return first + ' ';
    return value;
  }
  return value;
}
