/**
 * Bash-style command history. Keeps the last 100 entries, supports
 * up/down navigation with a "draft" buffer that restores in-progress input
 * when the user navigates back to the bottom of the stack.
 */
export class History {
  private items: string[] = [];
  private idx = -1;
  private draft = '';

  push(line: string): void {
    if (!line.trim()) return;
    if (this.items[this.items.length - 1] === line) {
      this.idx = -1;
      return;
    }
    this.items.push(line);
    if (this.items.length > 100) this.items.shift();
    this.idx = -1;
  }

  prev(currentDraft: string): string | null {
    if (this.items.length === 0) return null;
    if (this.idx === -1) {
      this.draft = currentDraft;
      this.idx = this.items.length - 1;
    } else if (this.idx > 0) {
      this.idx -= 1;
    }
    return this.items[this.idx] ?? null;
  }

  next(): string | null {
    if (this.idx === -1) return null;
    if (this.idx >= this.items.length - 1) {
      this.idx = -1;
      return this.draft;
    }
    this.idx += 1;
    return this.items[this.idx] ?? null;
  }

  reset(): void {
    this.idx = -1;
    this.draft = '';
  }
}
