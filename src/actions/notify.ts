import { action, type KeyDownEvent } from "@elgato/streamdeck";
import { type NotifySettings, notifyPayload } from "../awtrix/model";
import { awtrix } from "../awtrix/service";
import { PLUGIN_ID } from "../config";
import { messageKey, notifyKey } from "../render/keys";
import { KeyImageAction } from "./base";

/** Sends a notification (text, icon, color, sound) to the panel. */
@action({ UUID: `${PLUGIN_ID}.notify` })
export class NotifyAction extends KeyImageAction<NotifySettings> {
  protected image(settings: NotifySettings, hasTitle: boolean): string | undefined {
    const payload = notifyPayload(settings);
    if (!payload) {
      return messageKey("Notify", "set a text");
    }
    return notifyKey({ text: hasTitle ? "" : String(payload.text), sound: "sound" in payload || "rtttl" in payload });
  }

  override async onKeyDown(ev: KeyDownEvent<NotifySettings>): Promise<void> {
    const payload = notifyPayload(ev.payload.settings);
    const ok = payload ? await awtrix.notify(payload) : false;
    await (ok ? ev.action.showOk() : ev.action.showAlert());
  }
}
