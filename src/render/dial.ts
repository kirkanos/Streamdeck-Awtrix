import { brightnessPercent, MAX_BRIGHTNESS } from "../awtrix/model";
import { ICON, icon } from "./icons";
import { background, mix, svg, text, toDataUrl } from "./svg";
import { THEME } from "./theme";

/** Touch strip segment of one dial (Stream Deck + / + XL). */
const W = 200;
const H = 100;

export type BrightnessCanvas = {
  value: number;
  auto: boolean;
};

/** Brightness value with a bar; an AUTO badge while auto brightness is on. */
export function brightnessCanvas(d: BrightnessCanvas): string {
  const bg = background("bg", mix(THEME.warn, THEME.base, 0.82), THEME.base, W, H);
  const title = icon(ICON.sun, 10, 8, 22, { stroke: THEME.warn, width: 2 }) + text("Brightness", { x: 38, y: 25, size: 17, anchor: "start" });
  const value = text(String(Math.round(d.value)), {
    x: 12,
    y: 68,
    size: 32,
    weight: 800,
    anchor: "start",
    suffix: `${brightnessPercent(d.value)}%`,
    suffixSize: 15,
  });
  const badge = d.auto
    ? `<rect x="138" y="46" width="50" height="24" rx="7" fill="${THEME.accent}"/>` +
      text("AUTO", { x: 163, y: 63, size: 13, weight: 800 })
    : "";
  const barWidth = Math.round(((W - 24) * Math.max(0, Math.min(MAX_BRIGHTNESS, d.value))) / MAX_BRIGHTNESS);
  const bar =
    `<rect x="12" y="82" width="${W - 24}" height="8" rx="4" fill="${THEME.muted}"/>` +
    (barWidth > 0 ? `<rect x="12" y="82" width="${barWidth}" height="8" rx="4" fill="${THEME.warn}"/>` : "");
  return toDataUrl(svg(W, H, bg + title + value + badge + bar));
}

export function dialMessage(title: string, subtitle: string): string {
  return toDataUrl(
    svg(
      W,
      H,
      background("bg", THEME.surface, THEME.base, W, H) +
        text(title, { x: 12, y: 44, size: 20, weight: 800, anchor: "start" }) +
        text(subtitle, { x: 12, y: 70, size: 14, weight: 600, fill: THEME.subtle, anchor: "start" }),
    ),
  );
}
