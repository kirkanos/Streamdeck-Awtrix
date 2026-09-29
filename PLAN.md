# Streamdeck-Awtrix

Stream Deck plugin `com.kirkanos.awtrix`. Status: M1 to M3 implemented (see README.md), M4 open.

## Goal

Control the AWTRIX NG panel from the deck and show the Claude Code status per project, extending the hooks in `../awtrix-ng-scripts/claude-notify`.

## Keys & dials

- **Night mode** key: toggles the panel (power or minimum brightness, matching the night-mode app in awtrix-ng-scripts), state read from the panel.
- **Brightness** dial: turn sets brightness 0 to 255, push toggles auto brightness, touch strip shows the current value.
- **App switch** key: next or previous app, or jump to a named app.
- **Notify** key: sends a short text with icon and sound from the key settings.
- **Claude status** key: one key per project or one summary key. Green "done", amber "needs input", gray idle, with the project name. Press brings the terminal window of that project to the front and clears the state.

## Data source & API

- AWTRIX HTTP API: `GET /api/stats` (brightness, app, uptime), `POST /api/settings` (`BRI`, `ABRI`, `ATRANS`), `POST /api/power`, `POST /api/switch` and `/api/nextapp` `/api/previousapp`, `POST /api/notify`.
- Poll `/api/stats` every 10 s; the panel has no push channel over HTTP. MQTT (Mosquitto in the Grafana stack) is an option for live updates later.
- Claude status: the plugin runs a small HTTP listener on `127.0.0.1:<port>`. `awtrix-notify.sh` gets one extra `curl -m 1` to that listener with the same JSON it already builds (`state`, `project`). Failures are ignored, as today.

## Settings

- Panel host, listener port (default 42931), notify text, icon ID, sound, app name for the switch key.
- Terminal app for the focus action.

## Open questions

- Which terminal to focus (iTerm2, Terminal.app, VS Code) and how to find the window for a project: AppleScript by window title, or match the cwd via the terminal's own API.
- Whether night mode should call `/api/power` (panel off) or only lower brightness (matches the existing night-mode app).

## Milestones

- M1: Night mode and Notify keys, stats polling. Done.
- M2: Brightness dial, App switch. Done.
- M3: Claude status listener, focus action. Done; the hook change (one `curl` line, see README.md) is still to be made in awtrix-ng-scripts.
- M4: CI workflows, release `v1.0.0`.

## Scaffold

Copy the tooling from [Kuma Glance](https://github.com/kirkanos/kuma-glance) (`../Streamdeck-Uptime-Kuma`), not from Termine:

- `@elgato/streamdeck` ^3, `@elgato/cli`, TypeScript, rollup via `scripts/build.mjs` and `createRollupConfig()` from its `rollup.config.mjs`; `tsconfig` extends `@tsconfig/node20`, `moduleResolution: Bundler`, `customConditions: ["node"]`.
- Manifest: SDKVersion 3, Nodejs 24, `Software.MinimumVersion` 7.1, version `0.0.0.0` (the build fills it in).
- Layout: `plugin/` (manifest, `ui/`, `layouts/`, icons), `src/plugin.ts`, `src/actions/`, `src/<service>/`, `src/render/` (reuse `svg.ts` and `theme.ts`).
- Dev variant `<uuid>-dev` via `--dev`, `npm run link:dev`, `npm run watch:dev`.
- Settings pages: static HTML with vendored sdpi-components 4.0.1 in `plugin/ui/`.
- CI: `.github/workflows/ci.yml` (typecheck, vitest, pack, artifact) and `release.yml` (tag `v*`, `PLUGIN_VERSION`, `gh release create`).
- Tests: vitest for model and render code, like `render.test.ts` in Kuma Glance.
- Secrets live in the action settings, never in global settings. Passwords are exchanged for a token once and not stored.
- No license for now.
