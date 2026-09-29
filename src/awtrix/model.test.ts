import { describe, expect, it } from "vitest";
import { brightnessPercent, formatUptime, isNightActive, normalizeHost, stepBrightness } from "./model";

describe("stepBrightness", () => {
  it("changes by 8 per tick", () => {
    expect(stepBrightness(100, 1)).toBe(108);
    expect(stepBrightness(100, -1)).toBe(92);
    expect(stepBrightness(100, 3)).toBe(124);
  });

  it("clamps to 0..255", () => {
    expect(stepBrightness(250, 1)).toBe(255);
    expect(stepBrightness(255, 1)).toBe(255);
    expect(stepBrightness(4, -1)).toBe(0);
    expect(stepBrightness(0, -5)).toBe(0);
  });

  it("supports another step", () => {
    expect(stepBrightness(100, 2, 1)).toBe(102);
    expect(stepBrightness(100, -1, 16)).toBe(84);
  });

  it("converts to percent", () => {
    expect(brightnessPercent(0)).toBe(0);
    expect(brightnessPercent(255)).toBe(100);
    expect(brightnessPercent(128)).toBe(50);
  });
});

describe("formatUptime", () => {
  it("formats days, hours and minutes", () => {
    expect(formatUptime(90_000)).toBe("1d 1h");
    expect(formatUptime(3_900)).toBe("1h 05m");
    expect(formatUptime(120)).toBe("2m");
    expect(formatUptime(undefined)).toBeUndefined();
  });
});

describe("normalizeHost", () => {
  it("keeps only the host", () => {
    expect(normalizeHost("192.168.1.42")).toBe("192.168.1.42");
    expect(normalizeHost(" http://awtrix.local/ ")).toBe("awtrix.local");
    expect(normalizeHost("https://awtrix.local:8080/api/v1/settings")).toBe("awtrix.local:8080");
    expect(normalizeHost(undefined)).toBe("");
  });
});

describe("isNightActive", () => {
  const on = { power: true };
  const off = { power: false };

  it("reads the display power in power mode", () => {
    expect(isNightActive("power", 0, on, {})).toBe(false);
    expect(isNightActive("power", 0, off, {})).toBe(true);
  });

  it("falls back to the remembered state before the panel answered", () => {
    expect(isNightActive("power", 0, undefined, {}, true)).toBe(true);
    expect(isNightActive("power", 0, undefined, {})).toBe(false);
    expect(isNightActive("brightness", 0, on, {}, true)).toBe(true);
  });

  it("is active when dimmed to the night brightness with auto brightness off", () => {
    expect(isNightActive("brightness", 10, on, { brightness: 10, autoBrightness: false })).toBe(true);
    expect(isNightActive("brightness", 10, on, { brightness: 5, autoBrightness: false })).toBe(true);
    expect(isNightActive("brightness", 10, on, { brightness: 11, autoBrightness: false })).toBe(false);
    expect(isNightActive("brightness", 10, on, { brightness: 10, autoBrightness: true })).toBe(false);
    expect(isNightActive("brightness", 0, on, { brightness: 0 })).toBe(true);
  });
});
