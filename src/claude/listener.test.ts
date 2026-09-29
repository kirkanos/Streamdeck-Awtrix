import { describe, expect, it } from "vitest";
import { isValidPort, parseStatusRequest } from "./listener";

describe("parseStatusRequest", () => {
  it("accepts the hook's JSON", () => {
    expect(parseStatusRequest("POST", '{"state":"done","project":"Streamdeck-Awtrix"}')).toEqual({
      ok: true,
      state: "done",
      project: "Streamdeck-Awtrix",
    });
    expect(parseStatusRequest("POST", '{"state":"input","project":" api ","extra":1}')).toEqual({
      ok: true,
      state: "input",
      project: "api",
    });
  });

  it("only accepts POST", () => {
    expect(parseStatusRequest("PUT", "{}")).toMatchObject({ ok: false, status: 405 });
    expect(parseStatusRequest(undefined, "{}")).toMatchObject({ ok: false, status: 405 });
  });

  it("rejects bad JSON and non-objects", () => {
    expect(parseStatusRequest("POST", "state=done")).toMatchObject({ ok: false, status: 400, error: "Body is not valid JSON" });
    expect(parseStatusRequest("POST", "[1]")).toMatchObject({ ok: false, status: 400 });
    expect(parseStatusRequest("POST", "null")).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects unknown states and missing projects", () => {
    expect(parseStatusRequest("POST", '{"state":"idle","project":"x"}')).toMatchObject({ ok: false, status: 400 });
    expect(parseStatusRequest("POST", '{"state":"done"}')).toMatchObject({ ok: false, status: 400 });
    expect(parseStatusRequest("POST", '{"state":"done","project":""}')).toMatchObject({ ok: false, status: 400 });
    expect(parseStatusRequest("POST", '{"state":"done","project":42}')).toMatchObject({ ok: false, status: 400 });
  });

  it("truncates very long project names", () => {
    const result = parseStatusRequest("POST", JSON.stringify({ state: "done", project: "x".repeat(500) }));
    expect(result.ok && result.project.length).toBe(120);
  });
});

describe("isValidPort", () => {
  it("accepts unprivileged ports only", () => {
    expect(isValidPort(42931)).toBe(true);
    expect(isValidPort(1024)).toBe(true);
    expect(isValidPort(80)).toBe(false);
    expect(isValidPort(70000)).toBe(false);
    expect(isValidPort("42931")).toBe(false);
    expect(isValidPort(1.5)).toBe(false);
  });
});
