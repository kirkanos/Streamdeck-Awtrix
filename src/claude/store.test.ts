import { describe, expect, it } from "vitest";
import { ClaudeStateStore } from "./store";

function store() {
  let now = 1000;
  const s = new ClaudeStateStore(() => now++);
  const changes: number[] = [];
  s.on("change", () => changes.push(now));
  return { s, changes };
}

describe("ClaudeStateStore", () => {
  it("keeps one state per project, newest first", () => {
    const { s } = store();
    s.set("alpha", "done");
    s.set("beta", "input");
    s.set("gamma", "done");
    expect(s.entries().map((e) => e.project)).toEqual(["gamma", "beta", "alpha"]);
    expect(s.latest()?.project).toBe("gamma");
  });

  it("moves a project to the front when it reports again", () => {
    const { s } = store();
    s.set("alpha", "done");
    s.set("beta", "input");
    s.set("alpha", "input");
    expect(s.entries().map((e) => [e.project, e.state])).toEqual([
      ["alpha", "input"],
      ["beta", "input"],
    ]);
    expect(s.get("alpha")).toMatchObject({ state: "input", at: 1002 });
  });

  it("clears one project or all", () => {
    const { s, changes } = store();
    s.set("alpha", "done");
    s.set("beta", "done");
    expect(s.clear("alpha")).toBe(true);
    expect(s.clear("alpha")).toBe(false);
    expect(s.entries().map((e) => e.project)).toEqual(["beta"]);
    expect(s.clear()).toBe(true);
    expect(s.latest()).toBeUndefined();
    expect(changes).toHaveLength(4);
  });
});
