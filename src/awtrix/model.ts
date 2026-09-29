/** Brightness arithmetic and the night mode rule; the API shapes live in api.ts. */
import type { DisplayState, PanelSettings } from "./api";

export const MAX_BRIGHTNESS = 255;

/** Brightness change per dial tick. */
export const BRIGHTNESS_STEP = 8;

/** Brightness the panel returns to after night mode when nothing was remembered. */
export const DEFAULT_BRIGHTNESS = 120;

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
 * Whether the panel is in night mode, read from the panel itself: display
 * power off, or dimmed to the night brightness with auto brightness off (the
 * same state the night-mode Berry app sets). `remembered` is the state stored
 * on the key, used while the panel has not answered yet.
 */
export function isNightActive(
  mode: NightMode,
  nightBrightness: number,
  display: DisplayState | undefined,
  settings: PanelSettings,
  remembered = false,
): boolean {
  if (mode === "power") {
    return display ? !display.power : remembered;
  }
  if (settings.brightness === undefined) {
    return remembered;
  }
  return settings.autoBrightness !== true && settings.brightness <= clampBrightness(nightBrightness);
}
