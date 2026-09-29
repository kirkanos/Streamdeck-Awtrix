import { EventEmitter } from "node:events";
import {
  clampBrightness,
  normalizeHost,
  type PanelSettings,
  type PanelStats,
  parseApps,
  parseSettings,
  parseStats,
} from "./model";

export type ConnectionState = "unconfigured" | "connecting" | "connected" | "error";

export const POLL_INTERVAL_MS = 10_000;
const TIMEOUT_MS = 5_000;

export type TestResult = { ok: true; version?: string; app?: string } | { ok: false; error: string };

/**
 * Talks to one AWTRIX panel over its HTTP API and keeps its latest state.
 * The panel has no push channel, so /api/stats and /api/settings are polled.
 *
 * Events:
 *   "stats"  new stats or settings arrived (or a poll failed)
 *   "apps"   the app list (/api/loop) was loaded
 *   "state"  the connection state changed
 */
export class AwtrixService extends EventEmitter<{ stats: []; apps: []; state: [] }> {
  #host = "";
  #state: ConnectionState = "unconfigured";
  #error: string | undefined;
  #stats: PanelStats | undefined;
  #panel: PanelSettings = {};
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

  /** Latest /api/stats, kept from the last successful poll while offline. */
  get stats(): PanelStats | undefined {
    return this.#stats;
  }

  /** Latest /api/settings (brightness, auto brightness). */
  get panel(): PanelSettings {
    return this.#panel;
  }

  /** App names in loop order, empty until loaded. */
  apps(): string[] {
    return this.#apps;
  }

  /** Applies a new panel host; restarts polling only when it changed. */
  configure(host: string | undefined): void {
    const next = normalizeHost(host);
    if (next === this.#host && (this.#timer || !next)) {
      return;
    }
    this.#stop();
    this.#host = next;
    this.#stats = undefined;
    this.#panel = {};
    this.#apps = [];
    this.emit("apps");

    if (!next) {
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
      const [rawStats, rawSettings] = await Promise.all([this.#get("/api/stats"), this.#get("/api/settings")]);
      if (host !== this.#host) {
        return;
      }
      const stats = parseStats(rawStats);
      if (!stats) {
        throw new Error("Unexpected answer from /api/stats");
      }
      const first = !this.isConnected;
      this.#stats = stats;
      this.#panel = parseSettings(rawSettings);
      this.#setState("connected");
      this.emit("stats");
      if (first) {
        void this.loadApps();
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
      this.#apps = parseApps(await this.#get("/api/loop"));
    } catch {
      this.#apps = [];
    }
    this.emit("apps");
    return this.#apps;
  }

  /** Checks a host without changing the configured connection. */
  static async test(host: string): Promise<TestResult> {
    const service = new AwtrixService();
    service.#host = normalizeHost(host);
    if (!service.#host) {
      return { ok: false, error: "Please enter the panel host" };
    }
    try {
      const stats = parseStats(await service.#get("/api/stats"));
      if (!stats) {
        return { ok: false, error: "Unexpected answer from /api/stats" };
      }
      return { ok: true, version: stats.version, app: stats.app };
    } catch (err) {
      return { ok: false, error: describeError(err) };
    }
  }

  /** Sets a fixed brightness (turns auto brightness off, as the panel ignores BRI otherwise). */
  async setBrightness(value: number): Promise<boolean> {
    const brightness = clampBrightness(value);
    const ok = await this.#post("/api/settings", { BRI: brightness, ABRI: false });
    if (ok) {
      this.#panel = { brightness, autoBrightness: false };
      if (this.#stats) {
        this.#stats.brightness = brightness;
      }
      this.emit("stats");
    }
    return ok;
  }

  async setAutoBrightness(on: boolean): Promise<boolean> {
    const ok = await this.#post("/api/settings", { ABRI: on });
    if (ok) {
      this.#panel = { ...this.#panel, autoBrightness: on };
      this.emit("stats");
    }
    return ok;
  }

  /** Writes brightness and auto brightness together (night mode on / off). */
  async setBrightnessSettings(settings: PanelSettings): Promise<boolean> {
    const body: Record<string, number | boolean> = {};
    if (settings.brightness !== undefined) {
      body.BRI = clampBrightness(settings.brightness);
    }
    if (settings.autoBrightness !== undefined) {
      body.ABRI = settings.autoBrightness;
    }
    const ok = await this.#post("/api/settings", body);
    if (ok) {
      this.#panel = { ...this.#panel, ...settings };
      if (this.#stats && settings.brightness !== undefined) {
        this.#stats.brightness = clampBrightness(settings.brightness);
      }
      this.emit("stats");
    }
    return ok;
  }

  async setPower(on: boolean): Promise<boolean> {
    const ok = await this.#post("/api/power", { power: on });
    if (ok && this.#stats) {
      this.#stats.matrix = on;
      this.emit("stats");
    }
    return ok;
  }

  async switchApp(name: string): Promise<boolean> {
    const ok = await this.#post("/api/switch", { name });
    if (ok && this.#stats) {
      this.#stats.app = name;
      this.emit("stats");
    }
    return ok;
  }

  async nextApp(): Promise<boolean> {
    return this.#post("/api/nextapp");
  }

  async previousApp(): Promise<boolean> {
    return this.#post("/api/previousapp");
  }

  async notify(payload: Record<string, string | number>): Promise<boolean> {
    return this.#post("/api/notify", payload);
  }

  #stop(): void {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = undefined;
    }
  }

  async #get(path: string): Promise<unknown> {
    const response = await fetch(`http://${this.#host}${path}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${path}`);
    }
    return response.json();
  }

  /** POSTs JSON; false when the panel is not configured or the request failed. */
  async #post(path: string, body?: Record<string, unknown>): Promise<boolean> {
    if (!this.#host) {
      return false;
    }
    try {
      const response = await fetch(`http://${this.#host}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
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
