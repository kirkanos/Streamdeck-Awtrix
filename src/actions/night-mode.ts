import { action, type KeyDownEvent } from "@elgato/streamdeck";
import { clampBrightness, DEFAULT_BRIGHTNESS, isNightActive, type NightMode } from "../awtrix/model";
import { awtrix } from "../awtrix/service";
import { PLUGIN_ID } from "../config";
import { nightModeKey } from "../render/keys";
import { KeyImageAction, unavailableImage } from "./base";

export type NightModeSettings = {
  mode?: NightMode;
  nightBrightness?: number | string;
  /** Remembered while night mode is on, restored when it is switched off. */
  previousBrightness?: number;
  previousAuto?: boolean;
  active?: boolean;
};

const mode = (s: NightModeSettings): NightMode => (s.mode === "brightness" ? "brightness" : "power");
const nightBrightness = (s: NightModeSettings): number => clampBrightness(Number(s.nightBrightness) || 0);

/** Toggles the panel between day and night: power off, or a low fixed brightness. */
@action({ UUID: `${PLUGIN_ID}.night-mode` })
export class NightModeAction extends KeyImageAction<NightModeSettings> {
  protected image(settings: NightModeSettings): string | undefined {
    const unavailable = unavailableImage();
    if (unavailable || !awtrix.stats) {
      return unavailable;
    }
    return nightModeKey({
      active: isNightActive(mode(settings), nightBrightness(settings), awtrix.stats, awtrix.panel, settings.active),
      mode: mode(settings),
      brightness: awtrix.panel.brightness ?? awtrix.stats.brightness,
      nightBrightness: nightBrightness(settings),
    });
  }

  override async onKeyDown(ev: KeyDownEvent<NightModeSettings>): Promise<void> {
    const stats = awtrix.stats;
    if (!awtrix.isConnected || !stats) {
      await ev.action.showAlert();
      return;
    }
    const settings = { ...ev.payload.settings };
    const active = isNightActive(mode(settings), nightBrightness(settings), stats, awtrix.panel, settings.active);

    let ok: boolean;
    if (mode(settings) === "power") {
      ok = await awtrix.setPower(active);
    } else if (active) {
      ok = await awtrix.setBrightnessSettings({
        brightness: settings.previousBrightness ?? DEFAULT_BRIGHTNESS,
        autoBrightness: settings.previousAuto ?? false,
      });
    } else {
      // Same as the night-mode Berry app: remember, then dim with auto brightness off.
      settings.previousBrightness = awtrix.panel.brightness ?? stats.brightness;
      settings.previousAuto = awtrix.panel.autoBrightness ?? false;
      ok = await awtrix.setBrightnessSettings({ brightness: nightBrightness(settings), autoBrightness: false });
    }

    if (!ok) {
      await ev.action.showAlert();
      return;
    }
    settings.active = !active;
    await this.save(ev.action, settings);
  }
}
