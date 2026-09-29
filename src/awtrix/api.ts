/**
 * The AWTRIX NG REST API (http://<host>/api/v1): endpoint paths, request
 * bodies and answer parsing in one place, so that a wrong guess about the
 * firmware is a one-line fix.
 *
 * Known from awtrix-ng-scripts: GET/PATCH /display ({"power": bool}),
 * GET/PATCH /settings (camelCase keys: brightness, autoBrightness,
 * soundEnabled, ...), POST /notifications (icon, text, textColor, soundRtttl,
 * sound, stack, wakeup, repeat), GET /device, GET /apps, /apps/active.
 * Assumed: PUT /apps/active {"name": "..."} switches the shown app.
 */

import { clampBrightness } from "./model";

export const API_PATH = "/api/v1";

export const ENDPOINT = {
  device: "/device",
  display: "/display",
  settings: "/settings",
  notifications: "/notifications",
  apps: "/apps",
  activeApp: "/apps/active",
} as const;

export const ACTIVE_APP_METHOD = "PUT";

export function baseUrl(host: string): string {
  return `http://${host}${API_PATH}`;
}

export type Auth = { username?: string; password?: string };

/** Authorization header for the device login, or none when no user is set. */
export function authHeaders(auth: Auth | undefined): Record<string, string> {
  const username = auth?.username?.trim();
  if (!username) {
    return {};
  }
  return { Authorization: `Basic ${Buffer.from(`${username}:${auth?.password ?? ""}`, "utf8").toString("base64")}` };
}

// Request bodies

export function powerBody(on: boolean): { power: boolean } {
  return { power: on };
}

export type PanelSettings = {
  brightness?: number;
  autoBrightness?: boolean;
  soundEnabled?: boolean;
};

export function settingsBody(settings: PanelSettings): Record<string, number | boolean> {
  const body: Record<string, number | boolean> = {};
  if (settings.brightness !== undefined) {
    body.brightness = clampBrightness(settings.brightness);
  }
  if (settings.autoBrightness !== undefined) {
    body.autoBrightness = settings.autoBrightness;
  }
  if (settings.soundEnabled !== undefined) {
    body.soundEnabled = settings.soundEnabled;
  }
  return body;
}

export function activeAppBody(name: string): { name: string } {
  return { name };
}

export type NotifySettings = {
  text?: string;
  icon?: string;
  color?: string;
  /** RTTTL string ("name:d=4,o=5,b=100:c,e,g") or the name of a melody file on the panel. */
  sound?: string;
  duration?: number | string;
};

const COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Body for POST /notifications, or undefined when there is no text. Same
 * shape as awtrix-notify.sh sends: textColor, stack false, wakeup true.
 */
export function notificationBody(settings: NotifySettings): Record<string, string | number | boolean> | undefined {
  const text = settings.text?.trim();
  if (!text) {
    return undefined;
  }
  const body: Record<string, string | number | boolean> = { text, stack: false, wakeup: true };

  const icon = settings.icon?.trim();
  if (icon) {
    body.icon = icon;
  }
  const color = settings.color?.trim();
  if (color && COLOR.test(color)) {
    body.textColor = color.toUpperCase();
  }
  const sound = settings.sound?.trim();
  if (sound) {
    body[sound.includes(":") ? "soundRtttl" : "sound"] = sound;
  }
  const duration = Number(settings.duration);
  if (Number.isFinite(duration) && duration > 0) {
    body.duration = Math.round(duration);
  }
  return body;
}

// Answers

const num = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
const str = (value: unknown): string | undefined => (typeof value === "string" && value !== "" ? value : undefined);
const bool = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") {
    return value;
  }
  return value === 1 || value === 0 ? value === 1 : undefined;
};
const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

export type DisplayState = { power: boolean };

/** GET /display: undefined when the answer has no power state. */
export function parseDisplay(raw: unknown): DisplayState | undefined {
  const power = bool(record(raw)?.power);
  return power === undefined ? undefined : { power };
}

/** GET /settings: only the keys the plugin uses. */
export function parseSettings(raw: unknown): PanelSettings {
  const r = record(raw) ?? {};
  const brightness = num(r.brightness);
  return {
    brightness: brightness === undefined ? undefined : clampBrightness(brightness),
    autoBrightness: bool(r.autoBrightness),
    soundEnabled: bool(r.soundEnabled),
  };
}

export type DeviceInfo = { name?: string; version?: string; uptime?: number };

/** GET /device: name / version / uptime, whatever the firmware reports. */
export function parseDevice(raw: unknown): DeviceInfo {
  const r = record(raw) ?? {};
  return {
    name: str(r.name) ?? str(r.hostname) ?? str(r.deviceName),
    version: str(r.version) ?? str(r.firmware) ?? str(r.firmwareVersion),
    uptime: num(r.uptime) ?? num(r.uptimeSeconds),
  };
}

/**
 * GET /apps: app names in list order. Accepts a list of names, a list of
 * objects with a "name", an object keyed by name, or {"apps": [...]}.
 */
export function parseApps(raw: unknown): string[] {
  const r = record(raw);
  if (r && Array.isArray(r.apps)) {
    return parseApps(r.apps);
  }
  if (Array.isArray(raw)) {
    return raw.map((item) => str(item) ?? str(record(item)?.name) ?? str(record(item)?.id)).filter((n): n is string => n !== undefined);
  }
  return r ? Object.keys(r).filter((name) => name !== "") : [];
}

/** GET /apps/active: the shown app's name, as a string or {"name": ...}. */
export function parseActiveApp(raw: unknown): string | undefined {
  return str(raw) ?? str(record(raw)?.name) ?? str(record(raw)?.app);
}

/** Name of the app after / before `current` in the list, wrapping around. */
export function neighbourApp(apps: string[], current: string | undefined, direction: 1 | -1): string | undefined {
  if (apps.length === 0) {
    return undefined;
  }
  const index = current === undefined ? -1 : apps.indexOf(current);
  if (index < 0) {
    return apps[0];
  }
  return apps[(index + direction + apps.length) % apps.length];
}
