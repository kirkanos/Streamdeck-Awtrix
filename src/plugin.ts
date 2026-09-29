import streamDeck from "@elgato/streamdeck";
import { AppSwitchAction } from "./actions/app-switch";
import { BrightnessDialAction } from "./actions/brightness-dial";
import { ClaudeStatusAction } from "./actions/claude-status";
import { NightModeAction } from "./actions/night-mode";
import { NotifyAction } from "./actions/notify";
import { normalizeHost } from "./awtrix/model";
import { awtrix, AwtrixService } from "./awtrix/service";
import { ClaudeListener, DEFAULT_PORT, isValidPort } from "./claude/listener";
import { claudeState } from "./claude/store";

type JsonValue = Parameters<typeof streamDeck.ui.sendToPropertyInspector>[0];

/** Global settings: the panel and the local listener for the Claude Code hook. */
export type GlobalSettings = { host?: string; listenerPort?: number };

streamDeck.logger.setLevel("info");

const nightMode = new NightModeAction();
const notify = new NotifyAction();
const appSwitch = new AppSwitchAction();
const brightness = new BrightnessDialAction();
const claudeStatus = new ClaudeStatusAction();

streamDeck.actions.registerAction(nightMode);
streamDeck.actions.registerAction(notify);
streamDeck.actions.registerAction(appSwitch);
streamDeck.actions.registerAction(brightness);
streamDeck.actions.registerAction(claudeStatus);

const listener = new ClaudeListener(claudeState);
let globalSettings: GlobalSettings = {};

// Keep every visible key and dial in sync with the panel and the Claude states.

function refreshPanelKeys(): void {
  void nightMode.refresh();
  void notify.refresh();
  void appSwitch.refresh();
  void brightness.refresh();
}

awtrix.on("stats", refreshPanelKeys);

awtrix.on("state", () => {
  streamDeck.logger.info(`panel ${awtrix.host}: ${awtrix.state}${awtrix.error ? ` (${awtrix.error})` : ""}`);
  refreshPanelKeys();
  sendToPropertyInspector(statusMessage());
});

// Property inspectors with a hot-reloading app list pick this up.
awtrix.on("apps", () => sendToPropertyInspector({ event: "getApps", items: appItems() }));

claudeState.on("change", () => void claudeStatus.refresh());

listener.on("state", () => {
  streamDeck.logger.info(`listener 127.0.0.1:${listener.port}: ${listener.state}${listener.error ? ` (${listener.error})` : ""}`);
  sendToPropertyInspector(statusMessage());
});

// Messages from the property inspectors (ui/*.html).

type UiMessage =
  | { event: "getApps" | "getStatus" }
  | { event: "setHost"; host: string }
  | { event: "testHost"; host: string }
  | { event: "setListenerPort"; listenerPort: number | string };

streamDeck.ui.onSendToPlugin<UiMessage>(async (ev) => {
  const message = ev.payload;
  switch (message.event) {
    case "getApps":
      sendToPropertyInspector({ event: "getApps", items: appItems() });
      break;
    case "getStatus":
      sendToPropertyInspector(statusMessage());
      break;
    case "testHost": {
      const result = await AwtrixService.test(message.host);
      sendToPropertyInspector({ event: "testHost", ...result });
      break;
    }
    case "setHost": {
      const host = normalizeHost(message.host);
      await saveSettings({ ...globalSettings, host: host || undefined });
      const ok = await awtrix.poll();
      sendToPropertyInspector({ event: "setHost", ok, error: ok ? undefined : awtrix.error });
      break;
    }
    case "setListenerPort": {
      const port = Number(message.listenerPort);
      if (!isValidPort(port)) {
        sendToPropertyInspector({ event: "setListenerPort", ok: false, error: "The port must be a number between 1024 and 65535" });
        break;
      }
      await saveSettings({ ...globalSettings, listenerPort: port });
      sendToPropertyInspector({ event: "setListenerPort", ok: listener.state !== "error", error: listener.error });
      break;
    }
  }
});

function appItems(): JsonValue {
  return awtrix.apps().map((name) => ({ label: name, value: name }));
}

function statusMessage(): JsonValue {
  return {
    event: "status",
    state: awtrix.state,
    host: awtrix.host,
    error: awtrix.error ?? "",
    app: awtrix.stats?.app ?? "",
    version: awtrix.stats?.version ?? "",
    listenerState: listener.state,
    listenerPort: listener.port,
    listenerError: listener.error ?? "",
    pending: claudeState.entries().length,
  };
}

function sendToPropertyInspector(payload: JsonValue): void {
  if (streamDeck.ui.action) {
    streamDeck.ui.sendToPropertyInspector(payload).catch(() => undefined);
  }
}

function applySettings(settings: GlobalSettings): void {
  globalSettings = settings;
  awtrix.configure(settings.host);
  listener.start(isValidPort(settings.listenerPort) ? settings.listenerPort : DEFAULT_PORT);
}

async function saveSettings(settings: GlobalSettings): Promise<void> {
  await streamDeck.settings.setGlobalSettings(settings);
  applySettings(settings);
  sendToPropertyInspector(statusMessage());
}

streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>((ev) => applySettings(ev.settings));

await streamDeck.connect();
applySettings(await streamDeck.settings.getGlobalSettings<GlobalSettings>());
