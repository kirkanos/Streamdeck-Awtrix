import {
  action,
  type DialDownEvent,
  type DialRotateEvent,
  type DidReceiveSettingsEvent,
  SingletonAction,
  type TouchTapEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import { BRIGHTNESS_STEP, stepBrightness } from "../awtrix/model";
import { awtrix } from "../awtrix/service";
import { PLUGIN_ID } from "../config";
import { brightnessCanvas, dialMessage } from "../render/dial";
import { updates } from "../throttle";

export type BrightnessSettings = {
  /** Brightness change per tick (default 8). */
  step?: number | string;
};

/** Rotations are coalesced: the panel gets the latest value at most this often. */
const SEND_DELAY_MS = 150;

/** A dial for the panel brightness; push or tap toggles auto brightness. */
@action({ UUID: `${PLUGIN_ID}.brightness` })
export class BrightnessDialAction extends SingletonAction<BrightnessSettings> {
  readonly #settings = new Map<string, BrightnessSettings>();
  /** Value shown while turning, before the panel confirmed it. */
  #target: number | undefined;
  #sendTimer: ReturnType<typeof setTimeout> | undefined;

  override onWillAppear(ev: WillAppearEvent<BrightnessSettings>): Promise<void> {
    this.#settings.set(ev.action.id, ev.payload.settings);
    return this.#render(ev.action.id);
  }

  override onWillDisappear(ev: WillDisappearEvent<BrightnessSettings>): void {
    this.#settings.delete(ev.action.id);
    updates.forget(ev.action.id);
  }

  override onDidReceiveSettings(ev: DidReceiveSettingsEvent<BrightnessSettings>): Promise<void> {
    this.#settings.set(ev.action.id, ev.payload.settings);
    return this.#render(ev.action.id);
  }

  override async onDialRotate(ev: DialRotateEvent<BrightnessSettings>): Promise<void> {
    if (!awtrix.isConnected || !awtrix.stats) {
      return;
    }
    const step = Number(ev.payload.settings.step) || BRIGHTNESS_STEP;
    const current = this.#target ?? awtrix.panel.brightness ?? awtrix.stats.brightness;
    this.#target = stepBrightness(current, ev.payload.ticks, step);
    await this.refresh();
    this.#scheduleSend();
  }

  override onDialDown(ev: DialDownEvent<BrightnessSettings>): Promise<void> {
    return this.#toggleAuto(ev.action);
  }

  override onTouchTap(ev: TouchTapEvent<BrightnessSettings>): Promise<void> {
    return this.#toggleAuto(ev.action);
  }

  async refresh(): Promise<void> {
    for (const id of this.#settings.keys()) {
      await this.#render(id);
    }
  }

  async #toggleAuto(dial: { showAlert(): Promise<void> }): Promise<void> {
    if (!awtrix.isConnected || !(await awtrix.setAutoBrightness(!awtrix.panel.autoBrightness))) {
      await dial.showAlert();
    }
  }

  #scheduleSend(): void {
    if (this.#sendTimer) {
      return;
    }
    this.#sendTimer = setTimeout(async () => {
      this.#sendTimer = undefined;
      const target = this.#target;
      if (target === undefined) {
        return;
      }
      const ok = await awtrix.setBrightness(target);
      // A newer target arrived meanwhile: keep it and send again.
      if (this.#target === target || !ok) {
        this.#target = undefined;
        await this.refresh();
      } else {
        this.#scheduleSend();
      }
    }, SEND_DELAY_MS);
  }

  async #render(actionId: string): Promise<void> {
    const dial = this.actions.find((a) => a.id === actionId);
    if (!dial?.isDial() || !this.#settings.has(actionId)) {
      return;
    }

    let canvas: string;
    if (awtrix.state === "unconfigured") {
      canvas = dialMessage("Set up", "panel host in the dial settings");
    } else if (!awtrix.isConnected || !awtrix.stats) {
      canvas = dialMessage("Offline", awtrix.state === "error" ? "check host" : "connecting…");
    } else {
      canvas = brightnessCanvas({
        value: this.#target ?? awtrix.panel.brightness ?? awtrix.stats.brightness,
        auto: awtrix.panel.autoBrightness ?? false,
      });
    }
    updates.update(dial.id, canvas, (value) => dial.setFeedback({ canvas: value }));
  }
}
