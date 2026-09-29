import { describe, expect, it } from "vitest";
import {
  brightnessPercent,
  formatUptime,
  isNightActive,
  normalizeHost,
  notifyPayload,
  parseApps,
  parseSettings,
  parseStats,
  stepBrightness,
} from "./model";

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

describe("panel answers", () => {
  it("parses /api/stats", () => {
    const stats = parseStats({ bri: 120, app: "Time", uptime: 3600, version: "0.98", matrix: true, lux: 12, ram: 1 });
    expect(stats).toEqual({ brightness: 120, app: "Time", uptime: 3600, version: "0.98", matrix: true, lux: 12 });
  });

  it("rejects answers without a brightness", () => {
    expect(parseStats({ app: "Time" })).toBeUndefined();
    expect(parseStats("nope")).toBeUndefined();
    expect(parseStats(null)).toBeUndefined();
  });

  it("parses /api/settings and /api/loop", () => {
    expect(parseSettings({ BRI: 300, ABRI: false })).toEqual({ brightness: 255, autoBrightness: false });
    expect(parseSettings({})).toEqual({ brightness: undefined, autoBrightness: undefined });
    expect(parseApps({ Date: 1, Time: 0, Temperature: 2 })).toEqual(["Time", "Date", "Temperature"]);
    expect(parseApps(undefined)).toEqual([]);
  });

  it("formats the uptime", () => {
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
    expect(normalizeHost("https://awtrix.local:8080/api/stats")).toBe("awtrix.local:8080");
    expect(normalizeHost(undefined)).toBe("");
  });
});

describe("isNightActive", () => {
  const stats = { brightness: 120, matrix: true };

  it("reads the power state in power mode", () => {
    expect(isNightActive("power", 0, stats, {})).toBe(false);
    expect(isNightActive("power", 0, { ...stats, matrix: false }, {})).toBe(true);
  });

  it("falls back to the remembered state without a power state", () => {
    expect(isNightActive("power", 0, { brightness: 120 }, {}, true)).toBe(true);
    expect(isNightActive("power", 0, undefined, {}, true)).toBe(true);
    expect(isNightActive("power", 0, undefined, {})).toBe(false);
  });

  it("is active when dimmed to the night brightness with auto brightness off", () => {
    expect(isNightActive("brightness", 10, stats, { brightness: 10, autoBrightness: false })).toBe(true);
    expect(isNightActive("brightness", 10, stats, { brightness: 5, autoBrightness: false })).toBe(true);
    expect(isNightActive("brightness", 10, stats, { brightness: 11, autoBrightness: false })).toBe(false);
    expect(isNightActive("brightness", 10, stats, { brightness: 10, autoBrightness: true })).toBe(false);
    expect(isNightActive("brightness", 0, { brightness: 0 }, {})).toBe(true);
  });
});

describe("notifyPayload", () => {
  it("needs a text", () => {
    expect(notifyPayload({})).toBeUndefined();
    expect(notifyPayload({ text: "  " })).toBeUndefined();
  });

  it("builds the /api/notify body", () => {
    expect(notifyPayload({ text: " Hello ", icon: "1234", color: "#ffaa00", sound: "beep", duration: "5" })).toEqual({
      text: "Hello",
      icon: "1234",
      color: "#FFAA00",
      sound: "beep",
      duration: 5,
    });
  });

  it("sends RTTTL strings as rtttl and drops invalid values", () => {
    expect(notifyPayload({ text: "Hi", sound: "ok:d=8,o=6,b=180:c,e,g", color: "red", duration: "0" })).toEqual({
      text: "Hi",
      rtttl: "ok:d=8,o=6,b=180:c,e,g",
    });
  });
});
