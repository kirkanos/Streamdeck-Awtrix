import { action, type KeyDownEvent } from "@elgato/streamdeck";
import { DEFAULT_TERMINAL, focusTerminal, isTerminalApp, type TerminalApp } from "../claude/focus";
import { type ClaudeEntry, claudeState } from "../claude/store";
import { PLUGIN_ID } from "../config";
import { claudeStatusKey } from "../render/keys";
import { KeyImageAction } from "./base";

export type ClaudeStatusSettings = {
  /** Project (folder name) to show; empty for all projects. */
  project?: string;
  terminal?: TerminalApp;
};

const project = (s: ClaudeStatusSettings): string | undefined => s.project?.trim() || undefined;

/** Entry shown on a key: the project's own state, or the newest one for a summary key. */
function entryFor(settings: ClaudeStatusSettings): ClaudeEntry | undefined {
  const name = project(settings);
  return name ? claudeState.get(name) : claudeState.latest();
}

/**
 * Green "done" / amber "needs input" per project, reported by the Claude Code
 * hook through the local listener. Pressing focuses the terminal window and
 * clears the state.
 */
@action({ UUID: `${PLUGIN_ID}.claude-status` })
export class ClaudeStatusAction extends KeyImageAction<ClaudeStatusSettings> {
  protected image(settings: ClaudeStatusSettings, hasTitle: boolean): string | undefined {
    const name = project(settings);
    const entry = entryFor(settings);
    return claudeStatusKey({
      name: hasTitle ? undefined : (entry?.project ?? name ?? "All projects"),
      state: entry?.state ?? "idle",
      pending: name ? undefined : claudeState.entries().length,
    });
  }

  override async onKeyDown(ev: KeyDownEvent<ClaudeStatusSettings>): Promise<void> {
    const settings = ev.payload.settings;
    const target = entryFor(settings)?.project ?? project(settings);
    if (!target) {
      return;
    }
    const terminal = isTerminalApp(settings.terminal) ? settings.terminal : DEFAULT_TERMINAL;
    const result = await focusTerminal(terminal, target);
    if (!result.ok) {
      await ev.action.showAlert();
    }
    claudeState.clear(target);
  }
}
