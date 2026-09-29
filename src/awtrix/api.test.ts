import { describe, expect, it } from "vitest";
import {
  activeAppBody,
  authHeaders,
  baseUrl,
  ENDPOINT,
  neighbourApp,
  notificationBody,
  parseActiveApp,
  parseApps,
  parseDevice,
  parseDisplay,
  parseSettings,
  powerBody,
  settingsBody,
} from "./api";

describe("endpoints and auth", () => {
  it("uses the /api/v1 base", () => {
    expect(baseUrl("awtrix.local")).toBe("http://awtrix.local/api/v1");
    expect(`${baseUrl("10.0.0.5")}${ENDPOINT.display}`).toBe("http://10.0.0.5/api/v1/display");
    expect(ENDPOINT.notifications).toBe("/notifications");
    expect(ENDPOINT.activeApp).toBe("/apps/active");
  });

  it("sends basic auth only when a user is set", () => {
    expect(authHeaders(undefined)).toEqual({});
    expect(authHeaders({ username: " ", password: "x" })).toEqual({});
    expect(authHeaders({ username: "admin", password: "secret" })).toEqual({ Authorization: "Basic YWRtaW46c2VjcmV0" });
    expect(authHeaders({ username: "admin" })).toEqual({ Authorization: "Basic YWRtaW46" });
  });
});

describe("request bodies", () => {
  it("builds the display and settings patches", () => {
    expect(powerBody(false)).toEqual({ power: false });
    expect(settingsBody({ brightness: 300, autoBrightness: false })).toEqual({ brightness: 255, autoBrightness: false });
    expect(settingsBody({ autoBrightness: true })).toEqual({ autoBrightness: true });
    expect(settingsBody({ soundEnabled: false })).toEqual({ soundEnabled: false });
    expect(activeAppBody("Time")).toEqual({ name: "Time" });
  });

  it("needs a text for a notification", () => {
    expect(notificationBody({})).toBeUndefined();
    expect(notificationBody({ text: "  " })).toBeUndefined();
  });

  it("builds the /notifications body like awtrix-notify.sh", () => {
    expect(notificationBody({ text: " Hello ", icon: "71832", color: "#ffaa00", sound: "beep", duration: "5" })).toEqual({
      text: "Hello",
      stack: false,
      wakeup: true,
      icon: "71832",
      textColor: "#FFAA00",
      sound: "beep",
      duration: 5,
    });
  });

  it("sends RTTTL strings as soundRtttl and drops invalid values", () => {
    expect(notificationBody({ text: "Hi", sound: "ok:d=8,o=6,b=180:c,e,g", color: "red", duration: "0" })).toEqual({
      text: "Hi",
      stack: false,
      wakeup: true,
      soundRtttl: "ok:d=8,o=6,b=180:c,e,g",
    });
  });
});

describe("answers", () => {
  it("parses /display and /settings", () => {
    expect(parseDisplay({ power: false, brightness: 1 })).toEqual({ power: false });
    expect(parseDisplay({ matrixPower: true })).toBeUndefined();
    expect(parseDisplay("x")).toBeUndefined();
    expect(parseSettings({ brightness: 300, autoBrightness: 0, soundEnabled: true, textColor: 0xffffff })).toEqual({
      brightness: 255,
      autoBrightness: false,
      soundEnabled: true,
    });
    expect(parseSettings(null)).toEqual({ brightness: undefined, autoBrightness: undefined, soundEnabled: undefined });
  });

  it("parses /device with a few key spellings", () => {
    expect(parseDevice({ name: "Desk", version: "1.2.3", uptime: 10 })).toEqual({ name: "Desk", version: "1.2.3", uptime: 10 });
    expect(parseDevice({ hostname: "awtrixng-ab12", firmware: "1.0" })).toMatchObject({ name: "awtrixng-ab12", version: "1.0" });
    expect(parseDevice(undefined)).toEqual({ name: undefined, version: undefined, uptime: undefined });
  });

  it("parses the app list in its possible shapes", () => {
    expect(parseApps(["Time", "Date"])).toEqual(["Time", "Date"]);
    expect(parseApps([{ name: "Time" }, { name: "Date", enabled: true }, {}])).toEqual(["Time", "Date"]);
    expect(parseApps({ apps: [{ name: "Time" }] })).toEqual(["Time"]);
    expect(parseApps({ Time: {}, Date: {} })).toEqual(["Time", "Date"]);
    expect(parseApps(undefined)).toEqual([]);
  });

  it("parses the active app", () => {
    expect(parseActiveApp("Time")).toBe("Time");
    expect(parseActiveApp({ name: "Date" })).toBe("Date");
    expect(parseActiveApp({})).toBeUndefined();
  });
});

describe("neighbourApp", () => {
  const apps = ["Time", "Date", "Temperature"];

  it("cycles forward and backward", () => {
    expect(neighbourApp(apps, "Time", 1)).toBe("Date");
    expect(neighbourApp(apps, "Temperature", 1)).toBe("Time");
    expect(neighbourApp(apps, "Time", -1)).toBe("Temperature");
  });

  it("starts at the first app when the current one is unknown", () => {
    expect(neighbourApp(apps, undefined, 1)).toBe("Time");
    expect(neighbourApp(apps, "Weather", -1)).toBe("Time");
    expect(neighbourApp([], "Time", 1)).toBeUndefined();
  });
});
