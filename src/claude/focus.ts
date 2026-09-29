import { execFile } from "node:child_process";

export type TerminalApp = "iterm" | "terminal" | "vscode" | "ghostty" | "warp";

export const DEFAULT_TERMINAL: TerminalApp = "iterm";

/** Application name (for `activate`) and System Events process name per terminal. */
export const TERMINALS: Record<TerminalApp, { label: string; app: string; process: string }> = {
  iterm: { label: "iTerm2", app: "iTerm", process: "iTerm2" },
  terminal: { label: "Terminal", app: "Terminal", process: "Terminal" },
  vscode: { label: "Visual Studio Code", app: "Visual Studio Code", process: "Code" },
  ghostty: { label: "Ghostty", app: "Ghostty", process: "Ghostty" },
  warp: { label: "Warp", app: "Warp", process: "Warp" },
};

export function isTerminalApp(value: unknown): value is TerminalApp {
  return typeof value === "string" && value in TERMINALS;
}

function appleScriptString(text: string): string {
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * AppleScript that raises the first window of the terminal whose title
 * contains the project name (terminals put the working directory or the
 * folder name into the title) and activates the app. Prints "found",
 * "none" (app running, no matching window) or "missing" (app not running).
 */
export function focusScript(terminal: TerminalApp, project: string): string {
  const { app, process } = TERMINALS[terminal];
  return [
    `set projectName to ${appleScriptString(project)}`,
    `set result to "none"`,
    `tell application "System Events"`,
    `  if not (exists process ${appleScriptString(process)}) then return "missing"`,
    `  tell process ${appleScriptString(process)}`,
    `    set matching to (every window whose name contains projectName)`,
    `    if (count of matching) > 0 then`,
    `      set frontmost to true`,
    `      perform action "AXRaise" of item 1 of matching`,
    `      set result to "found"`,
    `    end if`,
    `  end tell`,
    `end tell`,
    `tell application ${appleScriptString(app)} to activate`,
    `return result`,
  ].join("\n");
}

export type FocusResult = { ok: true; found: boolean } | { ok: false; error: string };

/** Brings the terminal window of `project` to the front (macOS only). */
export function focusTerminal(terminal: TerminalApp, project: string): Promise<FocusResult> {
  if (process.platform !== "darwin") {
    return Promise.resolve({ ok: false, error: "Focusing a terminal window is only supported on macOS" });
  }
  return new Promise((resolve) => {
    execFile("osascript", ["-e", focusScript(terminal, project)], { timeout: 5_000 }, (err, stdout, stderr) => {
      if (err) {
        resolve({ ok: false, error: stderr.trim() || err.message });
        return;
      }
      const result = stdout.trim();
      if (result === "missing") {
        resolve({ ok: false, error: `${TERMINALS[terminal].label} is not running` });
        return;
      }
      resolve({ ok: true, found: result === "found" });
    });
  });
}
