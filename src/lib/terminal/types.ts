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
  handler: CommandHandler;
}
