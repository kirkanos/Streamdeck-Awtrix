/** Line icons drawn into key and dial images (24×24 paths, scaled on use). */

export const ICON = {
  moon: `<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>`,
  sun:
    `<circle cx="12" cy="12" r="4"/>` +
    `<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>`,
  bell: `<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>`,
  chevronRight: `<path d="M9 5l7 7-7 7"/>`,
  chevronLeft: `<path d="M15 5l-7 7 7 7"/>`,
  grid:
    `<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>` +
    `<rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>`,
  asterisk: `<path d="M12 3v18M3 12h18M5.64 5.64l12.72 12.72M18.36 5.64L5.64 18.36"/>`,
};

export type IconOptions = {
  stroke?: string;
  fill?: string;
  width?: number;
  opacity?: number;
};

/** Draws a 24×24 icon path with its top-left corner at (x, y), scaled to `size` pixels. */
export function icon(path: string, x: number, y: number, size: number, o: IconOptions = {}): string {
  const scale = (size / 24).toFixed(3);
  return (
    `<g transform="translate(${x} ${y}) scale(${scale})" fill="${o.fill ?? "none"}" stroke="${o.stroke ?? "#FFFFFF"}" ` +
    `stroke-width="${o.width ?? 1.75}" stroke-linecap="round" stroke-linejoin="round" opacity="${o.opacity ?? 1}">${path}</g>`
  );
}
