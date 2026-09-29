import {
  type DidReceiveSettingsEvent,
  type KeyAction,
  SingletonAction,
  type TitleParametersDidChangeEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import { awtrix } from "../awtrix/service";
import { messageKey } from "../render/keys";
import { showImage, updates } from "../throttle";

/** Settings object type accepted by SingletonAction (JsonObject from @elgato/utils). */
export type Settings = SingletonAction extends SingletonAction<infer T> ? T : never;

/** Image for keys that need the panel while it is not available. */
export function unavailableImage(): string | undefined {
  if (awtrix.state === "unconfigured") {
    return messageKey("Set up", "panel host");
  }
  if (!awtrix.isConnected || !awtrix.stats) {
    return messageKey("Offline", awtrix.state === "error" ? "check host" : "connecting…");
  }
  return undefined;
}

/**
 * Common part of the key actions: remembers the settings of every visible
 * key and redraws it from `image()` on every change.
 */
export abstract class KeyImageAction<T extends Settings> extends SingletonAction<T> {
  protected readonly settingsById = new Map<string, T>();
  /** Keys with a user-defined title: the name is not drawn into the image then. */
  protected readonly hasTitle = new Map<string, boolean>();

  override onWillAppear(ev: WillAppearEvent<T>): Promise<void> {
    this.settingsById.set(ev.action.id, ev.payload.settings);
    return this.render(ev.action.id);
  }

  override onWillDisappear(ev: WillDisappearEvent<T>): void {
    this.settingsById.delete(ev.action.id);
    this.hasTitle.delete(ev.action.id);
    updates.forget(ev.action.id);
  }

  override onDidReceiveSettings(ev: DidReceiveSettingsEvent<T>): Promise<void> {
    this.settingsById.set(ev.action.id, ev.payload.settings);
    return this.render(ev.action.id);
  }

  override onTitleParametersDidChange(ev: TitleParametersDidChangeEvent<T>): Promise<void> {
    this.hasTitle.set(ev.action.id, ev.payload.title.trim() !== "");
    return this.render(ev.action.id);
  }

  /** Re-renders all visible keys of this action. */
  async refresh(): Promise<void> {
    for (const id of this.settingsById.keys()) {
      await this.render(id);
    }
  }

  protected async render(actionId: string): Promise<void> {
    const key = this.actions.find((a) => a.id === actionId) as KeyAction<T> | undefined;
    const settings = this.settingsById.get(actionId);
    if (!key || !settings) {
      return;
    }
    showImage(key, this.image(settings, this.hasTitle.get(actionId) ?? false));
  }

  /** Stores changed settings (e.g. after a key press) and redraws the key. */
  protected async save(key: KeyAction<T>, settings: T): Promise<void> {
    this.settingsById.set(key.id, settings);
    await key.setSettings(settings);
    await this.render(key.id);
  }

  /** The key image (SVG data URL), or undefined for the default image. */
  protected abstract image(settings: T, hasTitle: boolean): string | undefined;
}
