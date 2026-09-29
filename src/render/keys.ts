import type { NightMode } from "../awtrix/model";
import type { ClaudeState } from "../claude/store";
import { ICON, icon } from "./icons";
import { background, mix, svg, text, toDataUrl, truncate, wrapText } from "./svg";
import { THEME } from "./theme";

/** Key images are drawn at 144×144 and scaled by Stream Deck. */
const S = 144;

const neutral = () => background("bg", THEME.surface, THEME.base, S, S);
const tinted = (color: string, amount = 0.72) => background("bg", mix(color, THEME.base, amount), THEME.base, S, S);

/** Neutral key with two lines of text, e.g. "Set up / panel host" or "Offline". */
export function messageKey(title: string, subtitle: string): string {
  return toDataUrl(
    svg(
      S,
      S,
      neutral() +
        `<rect x="3" y="3" width="${S - 6}" height="${S - 6}" rx="14" fill="none" stroke="${THEME.muted}" stroke-width="2"/>` +
        text(title, { x: S / 2, y: 68, size: 22, weight: 800 }) +
        text(subtitle, { x: S / 2, y: 92, size: 15, weight: 600, fill: THEME.subtle }),
    ),
  );
}

export type NightModeKey = {
  active: boolean;
  mode: NightMode;
  /** Current panel brightness. */
  brightness: number;
  nightBrightness: number;
};

/** Moon on a dark key while night mode is on, sun on a lighter key while it is off. */
export function nightModeKey(k: NightModeKey): string {
  const bg = k.active ? background("bg", mix(THEME.accent, THEME.base, 0.8), THEME.empty, S, S) : neutral();
  const glyph = k.active
    ? icon(ICON.moon, 42, 18, 60, { stroke: THEME.accent, fill: THEME.accent, width: 1.5 })
    : icon(ICON.sun, 42, 18, 60, { stroke: THEME.warn });
  const caption = k.active
    ? k.mode === "power"
      ? "on · panel off"
      : `on · dimmed to ${k.nightBrightness}`
    : `off · brightness ${k.brightness}`;
  return toDataUrl(
    svg(
      S,
      S,
      bg +
        glyph +
        text("Night", { x: S / 2, y: 108, size: 22, weight: 800 }) +
        text(caption, { x: S / 2, y: 128, size: 12, weight: 600, opacity: 0.75 }),
    ),
  );
}

export type NotifyKey = {
  text: string;
  /** True when the notification plays a sound. */
  sound?: boolean;
};

/** Bell with the notification text below it. */
export function notifyKey(k: NotifyKey): string {
  const lines = wrapText(k.text, 13, 2);
  const names = lines.map((line, i) => text(line, { x: S / 2, y: 98 + i * 19, size: 16, weight: 700 })).join("");
  // A small eighth note next to the bell when a sound is set.
  const note = k.sound
    ? `<g opacity="0.85"><path d="M108 24v18M108 24c4 1 6 4 6 8" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"/>` +
      `<ellipse cx="104" cy="42" rx="5" ry="4" fill="#FFFFFF"/></g>`
    : "";
  return toDataUrl(
    svg(S, S, tinted(THEME.info) + icon(ICON.bell, 46, 14, 52) + note + names),
  );
}

export type AppSwitchMode = "next" | "previous" | "app";

export type AppSwitchKey = {
  mode: AppSwitchMode;
  /** Target app for mode "app". */
  appName?: string;
  /** App currently shown on the panel. */
  currentApp?: string;
};

/** Chevron (next / previous) or app name, with the app currently shown as caption. */
export function appSwitchKey(k: AppSwitchKey): string {
  let glyph: string;
  let lines: string[];
  if (k.mode === "app") {
    glyph = icon(ICON.grid, 48, 14, 48);
    lines = wrapText(k.appName ?? "", 12, 2);
  } else {
    glyph = icon(k.mode === "next" ? ICON.chevronRight : ICON.chevronLeft, 44, 10, 56, { width: 2 });
    lines = [k.mode === "next" ? "Next app" : "Prev app"];
  }
  const size = lines.length > 1 ? 17 : 20;
  const label = lines.map((line, i) => text(line, { x: S / 2, y: (lines.length > 1 ? 96 : 104) + i * (size + 2), size, weight: 800 })).join("");
  const caption = k.currentApp ? text(`now: ${truncate(k.currentApp, 12)}`, { x: S / 2, y: 130, size: 12, weight: 600, opacity: 0.75 }) : "";
  return toDataUrl(svg(S, S, neutral() + glyph + label + caption));
}

export type ClaudeStatusKey = {
  /** Project name drawn on the key; omitted when the user shows their own title. */
  name?: string;
  state: ClaudeState | "idle";
  /** Number of projects with a pending state (summary key). */
  pending?: number;
};

const CLAUDE_COLOR: Record<ClaudeState | "idle", string> = {
  done: THEME.ok,
  input: THEME.warn,
  idle: THEME.idle,
};

const CLAUDE_LABEL: Record<ClaudeState | "idle", string> = {
  done: "DONE",
  input: "NEEDS INPUT",
  idle: "idle",
};

/** Green "done", amber "needs input" or gray idle key with the project name. */
export function claudeStatusKey(k: ClaudeStatusKey): string {
  const color = CLAUDE_COLOR[k.state];
  const idle = k.state === "idle";
  const bg = idle ? neutral() : tinted(color, 0.62);
  const bar = idle ? "" : `<rect x="0" y="0" width="${S}" height="5" fill="${color}"/>`;
  const glyph = icon(ICON.asterisk, 52, 14, 40, { stroke: idle ? THEME.subtle : "#FFFFFF", width: 2.25 });

  const lines = k.name ? wrapText(k.name, 12, 2) : [];
  const names = lines.map((line, i) => text(line, { x: S / 2, y: 80 + i * 19, size: 17 })).join("");

  const label = text(CLAUDE_LABEL[k.state], {
    x: S / 2,
    y: 128,
    size: 15,
    weight: 800,
    fill: idle ? THEME.subtle : "#FFFFFF",
  });

  const badge =
    k.pending && k.pending > 1
      ? `<circle cx="120" cy="24" r="13" fill="#FFFFFF"/>` +
        text(String(k.pending), { x: 120, y: 29, size: 15, weight: 800, fill: THEME.base })
      : "";

  return toDataUrl(svg(S, S, bg + bar + glyph + names + label + badge));
}
