import { EventEmitter } from "node:events";
import http from "node:http";
import { CLAUDE_STATES, type ClaudeState, type ClaudeStateStore } from "./store";

export const DEFAULT_PORT = 42931;
export const MAX_BODY_BYTES = 4096;
const MAX_PROJECT_CHARS = 120;

export type ListenerState = "stopped" | "listening" | "error";

export type ParsedRequest = { ok: true; state: ClaudeState; project: string } | { ok: false; status: number; error: string };

export function isValidPort(port: unknown): port is number {
  return typeof port === "number" && Number.isInteger(port) && port >= 1024 && port <= 65535;
}

/**
 * Validates a status report from the Claude Code hook:
 * POST with JSON {"state":"done"|"input","project":"name"}.
 */
export function parseStatusRequest(method: string | undefined, body: string): ParsedRequest {
  if (method !== "POST") {
    return { ok: false, status: 405, error: "Use POST" };
  }
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return { ok: false, status: 400, error: "Body is not valid JSON" };
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return { ok: false, status: 400, error: "Body must be a JSON object" };
  }
  const { state, project } = json as Record<string, unknown>;
  if (typeof state !== "string" || !CLAUDE_STATES.includes(state as ClaudeState)) {
    return { ok: false, status: 400, error: `"state" must be one of ${CLAUDE_STATES.join(", ")}` };
  }
  if (typeof project !== "string" || project.trim() === "") {
    return { ok: false, status: 400, error: '"project" must be a non-empty string' };
  }
  return { ok: true, state: state as ClaudeState, project: project.trim().slice(0, MAX_PROJECT_CHARS) };
}

/**
 * Local HTTP endpoint (127.0.0.1 only) the Claude Code hook posts to.
 * Emits "state" when it starts, stops or fails (e.g. port in use).
 */
export class ClaudeListener extends EventEmitter<{ state: [] }> {
  readonly #store: ClaudeStateStore;
  #server: http.Server | undefined;
  #port = DEFAULT_PORT;
  #state: ListenerState = "stopped";
  #error: string | undefined;

  constructor(store: ClaudeStateStore) {
    super();
    this.#store = store;
  }

  get port(): number {
    return this.#port;
  }

  get state(): ListenerState {
    return this.#state;
  }

  get error(): string | undefined {
    return this.#error;
  }

  /** (Re)starts the listener; nothing happens when it already listens on `port`. */
  start(port: number = DEFAULT_PORT): void {
    if (this.#server && this.#port === port && this.#state === "listening") {
      return;
    }
    this.stop();
    this.#port = port;

    const server = http.createServer((req, res) => this.#handle(req, res));
    server.on("error", (err: NodeJS.ErrnoException) => {
      this.#setState("error", err.code === "EADDRINUSE" ? `Port ${port} is already in use` : err.message);
    });
    server.listen(port, "127.0.0.1", () => this.#setState("listening"));
    this.#server = server;
  }

  stop(): void {
    this.#server?.close();
    this.#server = undefined;
    this.#setState("stopped");
  }

  #handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (req.method === "GET") {
      // Handy for checking the listener: curl http://127.0.0.1:42931/
      reply(res, 200, { ok: true, entries: this.#store.entries() });
      return;
    }

    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reply(res, 413, { error: "Body too large" });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (res.headersSent) {
        return;
      }
      const parsed = parseStatusRequest(req.method, Buffer.concat(chunks).toString("utf8"));
      if (!parsed.ok) {
        reply(res, parsed.status, { error: parsed.error });
        return;
      }
      this.#store.set(parsed.project, parsed.state);
      reply(res, 200, { ok: true });
    });
    req.on("error", () => {
      if (!res.headersSent) {
        reply(res, 400, { error: "Request failed" });
      }
    });
  }

  #setState(state: ListenerState, error?: string): void {
    if (state === this.#state && error === this.#error) {
      return;
    }
    this.#state = state;
    this.#error = error;
    this.emit("state");
  }
}

function reply(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}
