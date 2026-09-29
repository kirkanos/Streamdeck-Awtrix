import { EventEmitter } from "node:events";

export type ClaudeState = "done" | "input";

export const CLAUDE_STATES: readonly ClaudeState[] = ["done", "input"];

export type ClaudeEntry = { project: string; state: ClaudeState; at: number };

/**
 * The last reported Claude Code state per project. Emits "change" whenever
 * an entry is set or cleared.
 */
export class ClaudeStateStore extends EventEmitter<{ change: [] }> {
  readonly #entries = new Map<string, ClaudeEntry>();
  readonly #now: () => number;

  constructor(now: () => number = Date.now) {
    super();
    this.#now = now;
  }

  set(project: string, state: ClaudeState): void {
    // Re-insert so that the Map order is the report order.
    this.#entries.delete(project);
    this.#entries.set(project, { project, state, at: this.#now() });
    this.emit("change");
  }

  get(project: string): ClaudeEntry | undefined {
    return this.#entries.get(project);
  }

  /** All pending states, newest first. */
  entries(): ClaudeEntry[] {
    return [...this.#entries.values()].reverse();
  }

  /** The most recently reported state. */
  latest(): ClaudeEntry | undefined {
    return this.entries()[0];
  }

  /** Clears one project (or everything) and tells whether something was cleared. */
  clear(project?: string): boolean {
    if (project === undefined) {
      const had = this.#entries.size > 0;
      this.#entries.clear();
      if (had) {
        this.emit("change");
      }
      return had;
    }
    const had = this.#entries.delete(project);
    if (had) {
      this.emit("change");
    }
    return had;
  }
}

export const claudeState = new ClaudeStateStore();
