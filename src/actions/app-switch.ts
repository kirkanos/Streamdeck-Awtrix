import { action, type KeyDownEvent } from "@elgato/streamdeck";
import { awtrix } from "../awtrix/service";
import { PLUGIN_ID } from "../config";
import { type AppSwitchMode, appSwitchKey, messageKey } from "../render/keys";
import { KeyImageAction, unavailableImage } from "./base";

export type AppSwitchSettings = {
  mode?: AppSwitchMode;
  appName?: string;
};

const mode = (s: AppSwitchSettings): AppSwitchMode => (s.mode === "previous" || s.mode === "app" ? s.mode : "next");

/** Shows the next / previous app on the panel, or jumps to a named app. */
@action({ UUID: `${PLUGIN_ID}.app-switch` })
export class AppSwitchAction extends KeyImageAction<AppSwitchSettings> {
  protected image(settings: AppSwitchSettings, hasTitle: boolean): string | undefined {
    const appName = settings.appName?.trim();
    if (mode(settings) === "app" && !appName) {
      return messageKey("Select", "an app");
    }
    return unavailableImage() ?? appSwitchKey({ mode: mode(settings), appName, currentApp: hasTitle ? undefined : awtrix.stats?.app });
  }

  override async onKeyDown(ev: KeyDownEvent<AppSwitchSettings>): Promise<void> {
    const settings = ev.payload.settings;
    const appName = settings.appName?.trim();
    let ok: boolean;
    switch (mode(settings)) {
      case "app":
        ok = appName ? await awtrix.switchApp(appName) : false;
        break;
      case "previous":
        ok = await awtrix.previousApp();
        break;
      default:
        ok = await awtrix.nextApp();
    }
    if (!ok) {
      await ev.action.showAlert();
    }
  }
}
