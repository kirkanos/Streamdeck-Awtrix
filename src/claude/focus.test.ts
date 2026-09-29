import { describe, expect, it } from "vitest";
import { focusScript, isTerminalApp } from "./focus";

describe("focusScript", () => {
  it("targets the process and app of the selected terminal", () => {
    const script = focusScript("vscode", "Streamdeck-Awtrix");
    expect(script).toContain('tell process "Code"');
    expect(script).toContain('tell application "Visual Studio Code" to activate');
    expect(script).toContain('set projectName to "Streamdeck-Awtrix"');
    expect(script).toContain('perform action "AXRaise"');
  });

  it("escapes quotes and backslashes in the project name", () => {
    expect(focusScript("iterm", 'my "proj" \\ x')).toContain('set projectName to "my \\"proj\\" \\\\ x"');
  });

  it("knows the supported terminals", () => {
    expect(isTerminalApp("ghostty")).toBe(true);
    expect(isTerminalApp("warp")).toBe(true);
    expect(isTerminalApp("kitty")).toBe(false);
    expect(isTerminalApp(undefined)).toBe(false);
  });
});
