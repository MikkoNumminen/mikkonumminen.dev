/**
 * Shared terminal types: the output line kinds, the command spec, and the
 * context object every command handler receives.
 */
export type LineKind = 'plain' | 'prompt' | 'err' | 'dim' | 'accent' | 'html';

export interface TerminalLine {
  kind: LineKind;
  text: string;
}

export type CommandHandler = (
  args: string[],
  ctx: CommandContext,
  rawArgs?: string,
) => void | Promise<void>;

export interface CommandContext {
  print: (text: string, kind?: LineKind) => void;
  printHTML: (html: string) => void;
  clear: () => void;
  navigate: (path: string) => void;
}

export interface CommandSpec {
  name: string;
  description: string;
  usage?: string;
  hidden?: boolean;
  /**
   * Values this command's first argument can take, for tab completion.
   *
   * Only `download` supplies these today. It is the command whose arguments are
   * a closed set a visitor is expected to type by name, which is exactly what
   * completion is for: the ids are short but not memorable, and until now Tab
   * did nothing after the command name.
   */
  completions?: readonly string[];
  handler: CommandHandler;
}
