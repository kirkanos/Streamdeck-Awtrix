/** Data model of the AWTRIX panel and the pure logic behind the keys. */

export const MAX_BRIGHTNESS = 255;

/** Brightness change per dial tick. */
export const BRIGHTNESS_STEP = 8;

/** Brightness the panel returns to after night mode when nothing was remembered. */
export const DEFAULT_BRIGHTNESS = 120;

/** The parts of GET /api/stats the plugin uses. */
export type PanelStats = {
  brightness: number;
  app?: string;
  uptime?: number;
  version?: string;
  /** Matrix power state, false after POST /api/power {"power":false}. */
  matrix?: boolean;
  lux?: number;
};

/** The parts of GET /api/settings the plugin uses. */
export type PanelSettings = {
  brightness?: number;
  autoBrightness?: boolean;
};

const num = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
const str = (value: unknown): string | undefined => (typeof value === "string" && value !== "" ? value : undefined);
const bool = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") {
    return value;
  }
  return value === 1 || value === 0 ? value === 1 : undefined;
};

export function parseStats(raw: unknown): PanelStats | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const r = raw as Record<string, unknown>;
  const brightness = num(r.bri);
  if (brightness === undefined) {
    return undefined;
  }
  return {
    brightness: clampBrightness(brightness),
    app: str(r.app),
    uptime: num(r.uptime),
    version: str(r.version),
    matrix: bool(r.matrix),
    lux: num(r.lux),
  };
}

export function parseSettings(raw: unknown): PanelSettings {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const r = raw as Record<string, unknown>;
  const brightness = num(r.BRI);
  return {
    brightness: brightness === undefined ? undefined : clampBrightness(brightness),
    autoBrightness: bool(r.ABRI),
  };
}

/** App names from GET /api/loop ({"Time":0,"Date":1,...}), in loop order. */
export function parseApps(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") {
    return [];
  }
  return Object.entries(raw as Record<string, unknown>)
    .filter(([name]) => name !== "")
    .sort(([, a], [, b]) => (num(a) ?? 0) - (num(b) ?? 0))
    .map(([name]) => name);
}

export function clampBrightness(value: number): number {
  return Math.max(0, Math.min(MAX_BRIGHTNESS, Math.round(value)));
}

/** Brightness after turning the dial by `ticks` (negative = counter-clockwise). */
export function stepBrightness(current: number, ticks: number, step = BRIGHTNESS_STEP): number {
  return clampBrightness(current + ticks * step);
}

export function brightnessPercent(value: number): number {
  return Math.round((clampBrightness(value) / MAX_BRIGHTNESS) * 100);
}

/** "192.168.1.42", "http://awtrix.local/" or "awtrix.local:8080/api" all become the bare host. */
export function normalizeHost(input: string | undefined): string {
  return (input ?? "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/[/?#].*$/, "");
}

export function formatUptime(seconds: number | undefined): string | undefined {
  if (seconds === undefined || seconds < 0) {
    return undefined;
  }
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }
  return `${minutes}m`;
}

export type NightMode = "power" | "brightness";

/**
 * Whether the panel is in night mode, read from the panel itself: switched
 * off, or dimmed to the night brightness with auto brightness off (the same
 * state the night-mode Berry app sets). `remembered` is the state stored on
 * the key, used when the panel does not report its power state.
 */
export function isNightActive(
  mode: NightMode,
  nightBrightness: number,
  stats: PanelStats | undefined,
  settings: PanelSettings,
  remembered = false,
): boolean {
  if (!stats) {
    return remembered;
  }
  if (mode === "power") {
    return stats.matrix === undefined ? remembered : !stats.matrix;
  }
  const brightness = settings.brightness ?? stats.brightness;
  return settings.autoBrightness !== true && brightness <= clampBrightness(nightBrightness);
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

/** JSON body for POST /api/notify, or undefined when there is no text to show. */
export function notifyPayload(settings: NotifySettings): Record<string, string | number> | undefined {
  const text = settings.text?.trim();
  if (!text) {
    return undefined;
  }
  const payload: Record<string, string | number> = { text };

  const icon = settings.icon?.trim();
  if (icon) {
    payload.icon = icon;
  }
  const color = settings.color?.trim();
  if (color && COLOR.test(color)) {
    payload.color = color.toUpperCase();
  }
  const sound = settings.sound?.trim();
  if (sound) {
    payload[sound.includes(":") ? "rtttl" : "sound"] = sound;
  }
  const duration = Number(settings.duration);
  if (Number.isFinite(duration) && duration > 0) {
    payload.duration = Math.round(duration);
  }
  return payload;
}
