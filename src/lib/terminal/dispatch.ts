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

  // rawArgs is the input after the command token, preserving the original
  // spacing and quoting that tokenize()'s `\s+` split would otherwise collapse.
  // The `ask` path uses it (via stripQuotes) so a quoted, multi-word question
  // reaches the model intact; it is also forwarded to command handlers below
  // for any future command that needs the raw string rather than split tokens.
  // The capture group spans from after the first whitespace separator to
  // end-of-input; the leading whitespace + command token + separator is dropped.
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

  // Argument completion, for commands that publish a closed set of values.
  // Before this, Tab did nothing once you had typed a command name, which was
  // most obvious on `download`: its ids are short but not memorable, and the
  // whole point of the id form is that you type them.
  const cmd = commands.find((c) => c.name === (tokens[0] ?? '').toLowerCase());
  if (!cmd?.completions?.length) return value;

  // FIRST ARGUMENT ONLY, and mid-token. `download` takes one document, so
  // completing a second walks the visitor into the "you named two" error:
  // `download cv bli` + Tab produced `download cv blindtest`, a line that cannot
  // succeed. Tab should not help build a command that is already wrong.
  //
  // A trailing space is always a refusal here. After the command name alone
  // ("download ") the first-token branch above has already returned, so reaching
  // this line with a trailing space means the cursor sits past a first argument
  // and is starting a second.
  if (endsWithSpace || tokens.length !== 2) return value;

  const partial = tokens[1] ?? '';
  // Complete against the id, but keep whatever dashes were typed: someone
  // writing `--bli` gets `--blindtest`, not a silent respelling of their input.
  const dashes = /^-+/.exec(partial)?.[0] ?? '';
  const stem = partial.slice(dashes.length).toLowerCase();
  const matches = cmd.completions.filter((id) => id.startsWith(stem));
  if (matches.length === 0) return value;

  // A unique match always completes, and always earns a trailing space, even
  // when the id was already typed in full: the space is the confirmation that
  // it resolved. A shared prefix only completes if it actually adds characters,
  // and gets no space, because the cursor is where more typing is needed. Both
  // behaviours are what a real shell does.
  // Rewriting the trailing non-space run leaves any leading or internal spacing
  // the visitor typed exactly as it was.
  if (matches.length === 1) return value.replace(/\S*$/, dashes + matches[0] + ' ');
  const shared = dashes + commonPrefix(matches);
  if (shared.length <= partial.length) return value;
  return value.replace(/\S*$/, shared);
}

/** Longest string every candidate starts with. */
function commonPrefix(values: readonly string[]): string {
  const [head, ...rest] = values;
  if (!head) return '';
  let end = head.length;
  for (const value of rest) {
    let i = 0;
    while (i < end && i < value.length && head[i] === value[i]) i += 1;
    end = i;
  }
  return head.slice(0, end);
}
