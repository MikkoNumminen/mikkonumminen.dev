import type { CommandContext, CommandSpec } from './types';
import type { ChatRouter } from './chat';
import { echoPromptLine } from './dom';
import type { getTranslations } from '../../i18n';

export function tokenize(input: string): string[] {
  return input.trim().split(/\s+/).filter(Boolean);
}

/** Strip one layer of matching surrounding quotes from an `ask "..."` argument. */
function stripQuotes(value: string): string {
  const trimmed = value.trim();
  const first = trimmed[0];
  if (
    trimmed.length >= 2 &&
    (first === '"' || first === "'") &&
    trimmed[trimmed.length - 1] === first
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export async function handleCommand(
  input: string,
  ctx: CommandContext,
  output: HTMLElement,
  commandMap: Map<string, CommandSpec>,
  t: ReturnType<typeof getTranslations>,
  chat?: ChatRouter,
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

  // Explicit `ask "..."` routes to the model when free chat is available. When
  // it isn't, `ask` is not a registered command, so it falls through to the
  // ordinary "command not found" path below — no chat affordance leaks.
  if (name.toLowerCase() === 'ask' && chat && (await chat.isAvailable())) {
    const message = stripQuotes(rawArgs);
    if (!message) {
      ctx.print(t.terminal.chatAskUsage, 'dim');
      return;
    }
    await chat.ask(message, ctx, output, t);
    return;
  }

  // Lowercase before lookup so `HELP` and `help` resolve the same. The map is
  // keyed by lowercased names; tab-completion already lowercases its partial,
  // so this keeps the Enter and Tab paths case-insensitive in lockstep. The
  // original casing is preserved in the not-found message below.
  const cmd = commandMap.get(name.toLowerCase());
  if (!cmd) {
    // Unrecognized input becomes a free-form question when the model is up;
    // otherwise it stays the existing scripted-only "command not found". This
    // is the fake-shell routing rule (build brief): recognized -> scripted,
    // everything else -> RAG (only when reachable).
    if (chat && (await chat.isAvailable())) {
      await chat.ask(input.trim(), ctx, output, t);
      return;
    }
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
    tokens.length <= 1 || (tokens.length === 2 && endsWithSpace && tokens[1] === '');
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
