import { action, type KeyDownEvent } from "@elgato/streamdeck";
import { notificationBody, type NotifySettings } from "../awtrix/api";
import { awtrix } from "../awtrix/service";
import { PLUGIN_ID } from "../config";
import { messageKey, notifyKey } from "../render/keys";
import { KeyImageAction } from "./base";

/** Sends a notification (text, icon, color, sound) to the panel. */
@action({ UUID: `${PLUGIN_ID}.notify` })
export class NotifyAction extends KeyImageAction<NotifySettings> {
  protected image(settings: NotifySettings, hasTitle: boolean): string | undefined {
    const payload = notificationBody(settings);
    if (!payload) {
      return messageKey("Notify", "set a text");
    }
    return notifyKey({ text: hasTitle ? "" : String(payload.text), sound: "sound" in payload || "soundRtttl" in payload });
  }

  override async onKeyDown(ev: KeyDownEvent<NotifySettings>): Promise<void> {
    const payload = notificationBody(ev.payload.settings);
    const ok = payload ? await awtrix.notify(payload) : false;
    await (ok ? ev.action.showOk() : ev.action.showAlert());
  }
}
