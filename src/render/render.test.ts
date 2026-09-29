import { describe, expect, it } from "vitest";
import { brightnessCanvas, dialMessage } from "./dial";
import { appSwitchKey, claudeStatusKey, messageKey, nightModeKey, notifyKey } from "./keys";
import { escapeXml, wrapText } from "./svg";
import { THEME } from "./theme";

const decode = (dataUrl: string) => {
  expect(dataUrl).toMatch(/^data:image\/svg\+xml;base64,/);
  return Buffer.from(dataUrl.split(",")[1], "base64").toString("utf8");
};

describe("wrapText", () => {
  it("keeps short names on one line", () => {
    expect(wrapText("Streamdeck", 12, 2)).toEqual(["Streamdeck"]);
  });

  it("breaks after separators and ends overflowing text with an ellipsis", () => {
    expect(wrapText("Streamdeck-Awtrix", 12, 2)).toEqual(["Streamdeck-", "Awtrix"]);
    expect(wrapText("awtrix-ng-scripts-and-more-words", 12, 2)).toEqual(["awtrix-ng-", "scripts-and…"]);
  });
});

describe("key images", () => {
  it("are 144×144 SVGs", () => {
    const svg = decode(messageKey("Set up", "panel host"));
    expect(svg).toContain('width="144" height="144"');
    expect(svg).toContain("Set up");
  });

  it("show the moon while night mode is on and the sun while it is off", () => {
    const on = decode(nightModeKey({ active: true, mode: "power", brightness: 0, nightBrightness: 0 }));
    expect(on).toContain(`fill="${THEME.accent}"`);
    expect(on).toContain("on · panel off");
    const dimmed = decode(nightModeKey({ active: true, mode: "brightness", brightness: 5, nightBrightness: 5 }));
    expect(dimmed).toContain("on · dimmed to 5");
    const off = decode(nightModeKey({ active: false, mode: "power", brightness: 120, nightBrightness: 0 }));
    expect(off).toContain(`stroke="${THEME.warn}"`);
    expect(off).toContain("off · brightness 120");
  });

  it("escape the notification text", () => {
    expect(escapeXml(`<a & "b">`)).toBe("&lt;a &amp; &quot;b&quot;&gt;");
    const svg = decode(notifyKey({ text: "R&D <prod>", sound: true }));
    expect(svg).toContain("R&amp;D");
    expect(svg).not.toContain("<prod>");
  });

  it("show the switch mode and the current app", () => {
    expect(decode(appSwitchKey({ mode: "next", currentApp: "Time" }))).toContain("now: Time");
    expect(decode(appSwitchKey({ mode: "previous" }))).toContain("Prev app");
    const named = decode(appSwitchKey({ mode: "app", appName: "Temperature", currentApp: "Date" }));
    expect(named).toContain("Temperature");
    expect(named).toContain("now: Date");
  });

  it("color the Claude status by state", () => {
    const done = decode(claudeStatusKey({ name: "api", state: "done" }));
    expect(done).toContain("DONE");
    expect(done).toContain(`fill="${THEME.ok}"`);
    const input = decode(claudeStatusKey({ name: "api", state: "input" }));
    expect(input).toContain("NEEDS INPUT");
    expect(input).toContain(`fill="${THEME.warn}"`);
    const idle = decode(claudeStatusKey({ name: "All projects", state: "idle", pending: 0 }));
    expect(idle).toContain("idle");
    expect(idle).not.toContain(`fill="${THEME.ok}"`);
    expect(idle).toContain("All projects");
  });

  it("show a badge when several projects are pending", () => {
    expect(decode(claudeStatusKey({ name: "api", state: "done", pending: 3 }))).toContain(">3</text>");
    expect(decode(claudeStatusKey({ name: "api", state: "done", pending: 1 }))).not.toContain("<circle");
  });

  it("leave the name out when the key has its own title", () => {
    expect(decode(claudeStatusKey({ state: "done" }))).not.toContain("api");
  });
});

describe("dial canvas", () => {
  it("is 200×100 and shows the value, percent and AUTO badge", () => {
    const svg = decode(brightnessCanvas({ value: 128, auto: true }));
    expect(svg).toContain('width="200" height="100"');
    expect(svg).toContain(">128<");
    expect(svg).toContain("50%");
    expect(svg).toContain("AUTO");
    expect(decode(brightnessCanvas({ value: 0, auto: false }))).not.toContain("AUTO");
  });

  it("renders messages", () => {
    expect(decode(dialMessage("Offline", "check host"))).toContain("check host");
  });
});
