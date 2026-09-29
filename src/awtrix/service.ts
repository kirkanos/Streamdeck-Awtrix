import { EventEmitter } from "node:events";
import {
  ACTIVE_APP_METHOD,
  activeAppBody,
  type Auth,
  authHeaders,
  baseUrl,
  type DeviceInfo,
  type DisplayState,
  ENDPOINT,
  neighbourApp,
  type PanelSettings,
  parseActiveApp,
  parseApps,
  parseDevice,
  parseDisplay,
  parseSettings,
  powerBody,
  settingsBody,
} from "./api";
import { clampBrightness, normalizeHost } from "./model";

export type ConnectionState = "unconfigured" | "connecting" | "connected" | "error";

export type Connection = Auth & { host?: string };

export const POLL_INTERVAL_MS = 10_000;
const TIMEOUT_MS = 5_000;

export type TestResult = { ok: true; name?: string; version?: string } | { ok: false; error: string };

/**
 * Talks to one AWTRIX NG panel over its REST API (/api/v1) and keeps its
 * latest state. The panel has no push channel, so /settings, /display and
 * /apps/active are polled.
 *
 * Events:
 *   "stats"  new settings / display / active app arrived (or a poll failed)
 *   "apps"   the app list (/apps) was loaded
 *   "state"  the connection state changed
 */
export class AwtrixService extends EventEmitter<{ stats: []; apps: []; state: [] }> {
  #host = "";
  #auth: Auth = {};
  #state: ConnectionState = "unconfigured";
  #error: string | undefined;
  #settings: PanelSettings = {};
  #display: DisplayState | undefined;
  #activeApp: string | undefined;
  #device: DeviceInfo = {};
  #apps: string[] = [];
  #timer: ReturnType<typeof setInterval> | undefined;
  #polling: Promise<void> | undefined;

  get host(): string {
    return this.#host;
  }

  get state(): ConnectionState {
    return this.#state;
  }

  get error(): string | undefined {
    return this.#error;
  }

  get isConnected(): boolean {
    return this.#state === "connected";
  }

  /** Latest /settings (brightness, auto brightness), kept while offline. */
  get panel(): PanelSettings {
    return this.#settings;
  }

  /** Latest /display (power). */
  get display(): DisplayState | undefined {
    return this.#display;
  }

  /** Name of the app currently shown, if the panel reports it. */
  get activeApp(): string | undefined {
    return this.#activeApp;
  }

  /** /device info from the first successful poll. */
  get device(): DeviceInfo {
    return this.#device;
  }

  /** App names in list order, empty until loaded. */
  apps(): string[] {
    return this.#apps;
  }

  /** Applies new connection settings; restarts polling only when they changed. */
  configure(connection: Connection): void {
    const host = normalizeHost(connection.host);
    const auth: Auth = { username: connection.username?.trim() || undefined, password: connection.password || undefined };
    const same = host === this.#host && auth.username === this.#auth.username && auth.password === this.#auth.password;
    if (same && (this.#timer || !host)) {
      return;
    }
    this.#stop();
    this.#host = host;
    this.#auth = auth;
    this.#settings = {};
    this.#display = undefined;
    this.#activeApp = undefined;
    this.#device = {};
    this.#apps = [];
    this.emit("apps");

    if (!host) {
      this.#setState("unconfigured");
      return;
    }
    this.#setState("connecting");
    this.#timer = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
    void this.poll();
  }

  /** Polls now (at most one poll runs at a time) and tells whether the panel answered. */
  async poll(): Promise<boolean> {
    if (!this.#host) {
      return false;
    }
    this.#polling ??= this.#poll().finally(() => (this.#polling = undefined));
    await this.#polling;
    return this.isConnected;
  }

  async #poll(): Promise<void> {
    const host = this.#host;
    try {
      const [rawSettings, rawDisplay, rawActive] = await Promise.all([
        this.#get(ENDPOINT.settings),
        this.#get(ENDPOINT.display),
        this.#get(ENDPOINT.activeApp).catch(() => undefined),
      ]);
      if (host !== this.#host) {
        return;
      }
      const settings = parseSettings(rawSettings);
      if (settings.brightness === undefined) {
        throw new Error(`Unexpected answer from ${ENDPOINT.settings}`);
      }
      const first = !this.isConnected;
      this.#settings = settings;
      this.#display = parseDisplay(rawDisplay) ?? this.#display;
      this.#activeApp = parseActiveApp(rawActive) ?? this.#activeApp;
      this.#setState("connected");
      this.emit("stats");
      if (first) {
        void this.loadApps();
        void this.#loadDevice();
      }
    } catch (err) {
      if (host === this.#host) {
        this.#setState("error", describeError(err));
        this.emit("stats");
      }
    }
  }

  async loadApps(): Promise<string[]> {
    try {
      this.#apps = parseApps(await this.#get(ENDPOINT.apps));
    } catch {
      this.#apps = [];
    }
    this.emit("apps");
    return this.#apps;
  }

  async #loadDevice(): Promise<void> {
    try {
      this.#device = parseDevice(await this.#get(ENDPOINT.device));
      this.emit("stats");
    } catch {
      // Older firmware without /device: the status block just shows less.
    }
  }

  /** Checks a connection without changing the configured one (GET /device, or /display on 404). */
  static async test(connection: Connection): Promise<TestResult> {
    const service = new AwtrixService();
    service.#host = normalizeHost(connection.host);
    service.#auth = { username: connection.username?.trim() || undefined, password: connection.password || undefined };
    if (!service.#host) {
      return { ok: false, error: "Please enter the panel host" };
    }
    try {
      try {
        const device = parseDevice(await service.#get(ENDPOINT.device));
        return { ok: true, name: device.name, version: device.version };
      } catch (err) {
        if (!(err instanceof HttpError && err.status === 404)) {
          throw err;
        }
        if (!parseDisplay(await service.#get(ENDPOINT.display))) {
          return { ok: false, error: `Unexpected answer from ${ENDPOINT.display}` };
        }
        return { ok: true };
      }
    } catch (err) {
      return { ok: false, error: describeError(err) };
    }
  }

  /** Sets a fixed brightness (turns auto brightness off, as the panel overrides the value otherwise). */
  setBrightness(value: number): Promise<boolean> {
    return this.setSettings({ brightness: clampBrightness(value), autoBrightness: false });
  }

  setAutoBrightness(on: boolean): Promise<boolean> {
    return this.setSettings({ autoBrightness: on });
  }

  /** PATCH /settings; the cached settings are updated on success. */
  async setSettings(settings: PanelSettings): Promise<boolean> {
    const ok = await this.#send("PATCH", ENDPOINT.settings, settingsBody(settings));
    if (ok) {
      // Only the keys that were sent change; the cached rest stays.
      const sent = parseSettings(settingsBody(settings));
      for (const key of Object.keys(sent) as (keyof PanelSettings)[]) {
        if (sent[key] !== undefined) {
          Object.assign(this.#settings, { [key]: sent[key] });
        }
      }
      this.emit("stats");
    }
    return ok;
  }

  async setPower(on: boolean): Promise<boolean> {
    const ok = await this.#send("PATCH", ENDPOINT.display, powerBody(on));
    if (ok) {
      this.#display = { power: on };
      this.emit("stats");
    }
    return ok;
  }

  async switchApp(name: string): Promise<boolean> {
    const ok = await this.#send(ACTIVE_APP_METHOD, ENDPOINT.activeApp, activeAppBody(name));
    if (ok) {
      this.#activeApp = name;
      this.emit("stats");
    }
    return ok;
  }

  /** Switches to the app after / before the shown one in the app list. */
  async stepApp(direction: 1 | -1): Promise<boolean> {
    const apps = this.#apps.length > 0 ? this.#apps : await this.loadApps();
    const next = neighbourApp(apps, this.#activeApp, direction);
    return next === undefined ? false : this.switchApp(next);
  }

  notify(body: Record<string, string | number | boolean>): Promise<boolean> {
    return this.#send("POST", ENDPOINT.notifications, body);
  }

  #stop(): void {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = undefined;
    }
  }

  async #get(path: string): Promise<unknown> {
    const response = await fetch(`${baseUrl(this.#host)}${path}`, {
      headers: authHeaders(this.#auth),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new HttpError(response.status, path);
    }
    return response.json();
  }

  /** Sends JSON; false when the panel is not configured or the request failed. */
  async #send(method: string, path: string, body: Record<string, unknown>): Promise<boolean> {
    if (!this.#host) {
      return false;
    }
    try {
      const response = await fetch(`${baseUrl(this.#host)}${path}`, {
        method,
        headers: { "Content-Type": "application/json", ...authHeaders(this.#auth) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  #setState(state: ConnectionState, error?: string): void {
    if (state === this.#state && error === this.#error) {
      return;
    }
    this.#state = state;
    this.#error = error;
    this.emit("state");
  }
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    path: string,
  ) {
    super(status === 401 ? "Login required: check username and password" : `HTTP ${status} from ${path}`);
    this.name = "HttpError";
  }
}

/** Short reason for a failed request ("Timeout", "ECONNREFUSED", ...). */
export function describeError(err: unknown): string {
  if (!(err instanceof Error)) {
    return String(err);
  }
  if (err.name === "TimeoutError" || err.name === "AbortError") {
    return "Timeout";
  }
  const cause = err.cause as { code?: string; message?: string } | undefined;
  return cause?.code ?? cause?.message ?? err.message;
}

export const awtrix = new AwtrixService();
