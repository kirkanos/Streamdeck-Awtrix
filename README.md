# AWTRIX Remote

Control an AWTRIX NG LED panel from your Elgato Stream Deck and see the status of your Claude Code sessions on a key.

## Features

* **Night Mode** key: switches the panel off, or dims it to a night brightness with auto brightness off (the same state the [night-mode Berry app](https://github.com/kirkanos/awtrix-ng-scripts/tree/main/night-mode) sets). Pressing again restores the previous brightness and auto brightness. The key reads the state from the panel and shows a moon while night mode is on, a sun while it is off.
* **Brightness** dial (Stream Deck + / + XL): turn to set the brightness from 0 to 255 in steps of 8 (configurable), push or tap to toggle auto brightness. The touch strip shows the value, a bar and an AUTO badge.
* **App Switch** key: shows the next or previous app on the panel (cycling through the panel's app list), or jumps to a named app picked from that list. The key shows the app currently on the panel.
* **Notify** key: sends a notification with text, icon, color, sound (RTTTL or melody file) and duration, the same way the claude-notify hook does.
* **Claude Status** key: 🟩 "done" when Claude Code finished a task, 🟨 "needs input" when it waits for you, ⬛ idle, with the project name. One key per project, or one summary key showing the most recent state of any project with a badge for the number of pending projects. Pressing the key brings the terminal window of that project to the front (iTerm2, Terminal, Visual Studio Code, Ghostty or Warp) and clears the state.
* The panel is polled over the AWTRIX NG REST API (`/api/v1`) every 10 seconds (`/settings`, `/display`, `/apps/active`); the Claude status arrives on a local HTTP listener fed by the Claude Code hooks.

## Installation

Download the [latest release](https://github.com/kirkanos/Streamdeck-Awtrix/releases/latest) and open `com.kirkanos.awtrix.streamDeckPlugin`. Requires Stream Deck 7.1 or newer.

Then add a key, open its settings, enter the panel's IP address or host name (plus username and password if the device has a login) and press "Test" or "Save". The connection is shared by all keys and dials.

## Settings

Shared (global):

| Setting | Meaning | Default |
| --- | --- | --- |
| Host | IP address or host name of the panel, without `http://` | – |
| Username / password | Device login, only when one is configured on the panel (sent as HTTP basic auth) | – |
| Listener port | Port of the local Claude status listener on `127.0.0.1` (Claude Status key) | `42931` |

Per key / dial:

| Action | Settings |
| --- | --- |
| Night Mode | Mode (switch the panel off, or dim to a night brightness), night brightness 0 to 255 |
| Brightness | Step per dial tick (1, 4, 8, 16) |
| App Switch | On press (next app, previous app, switch to an app), app name |
| Notify | Text, icon (LaMetric icon ID or file name on the panel), text color, sound (sent as `soundRtttl` when it contains `:`, otherwise as a melody file `sound`), duration in seconds |
| Claude Status | Project (folder name, empty for all projects), terminal app to focus |

If you set your own title on a key, the project name / notification text is left out of the image.

## Prerequisites

* An AWTRIX NG panel reachable over HTTP from this computer (REST API under `http://<host>/api/v1`).
* For the Claude Status key: the [claude-notify](https://github.com/kirkanos/awtrix-ng-scripts/tree/main/claude-notify) hooks from awtrix-ng-scripts, with one extra line in `awtrix-notify.sh` that also reports the state to the plugin. Add it right before the final `exit 0` (it fails silently when the plugin is not running, like the panel notification):

  ```sh
  curl -sS -m 1 -X POST "http://127.0.0.1:${AWTRIX_DECK_PORT:-42931}/" -H "Content-Type: application/json" -d "{\"state\":\"${1}\",\"project\":\"${PROJECT}\"}" >/dev/null 2>&1 || true
  ```

  The listener accepts `POST` with the JSON `{"state":"done"|"input","project":"<folder name>"}`; `GET /` returns the pending states, e.g. `curl http://127.0.0.1:42931/`. Set `AWTRIX_DECK_PORT` in `~/.claude/hooks/.env` if you changed the listener port.
* Focusing the terminal uses AppleScript (macOS only). The first press makes macOS ask for permission to let Stream Deck control "System Events" and the terminal app (System Settings → Privacy & Security → Automation). The window is found by its title, so the terminal's window title must contain the project folder name (the default for Terminal, iTerm2 with the working directory in the title, and VS Code).

## Development

AWTRIX Remote is a Node.js plugin built with the official [Stream Deck SDK](https://docs.elgato.com/streamdeck/sdk/introduction/getting-started/) (`@elgato/streamdeck`, TypeScript, rollup). The settings pages use [sdpi-components](https://sdpi-components.dev).

| Path | Content |
| --- | --- |
| `src/actions/` | One class per Stream Deck action |
| `src/awtrix/` | REST client for the panel (`api.ts` holds all endpoint paths, bodies and answer parsing), polling and the brightness / night mode logic |
| `src/claude/` | Claude status store, the local HTTP listener and the terminal focus script |
| `src/render/` | SVG images for keys and touch strips |
| `plugin/` | Static plugin files: manifest, icons, settings pages (`ui/`), dial layout |
| `assets/` | Plugin icon source (rendered to PNG by the build) |
| `scripts/` | Build |

```sh
npm install
npm test               # unit tests
npm run typecheck

# Development: a parallel-installable copy "AWTRIX Remote (dev)"
npm run link:dev       # build + link into Stream Deck (once)
npm run watch:dev      # rebuild and restart the plugin on every change

npm run validate       # build + streamdeck validate
npm run pack           # Release/com.kirkanos.awtrix.streamDeckPlugin
```

Linking and restarting need the Stream Deck developer mode (`npx streamdeck dev`, then restart the Stream Deck app once). Plugin logs are written to `dist/<plugin id>.sdPlugin/logs/`.

GitHub Actions builds and tests every push (`.github/workflows/ci.yml`) and publishes a release with the packed plugin for tags like `v1.0.0` (`.github/workflows/release.yml`).

## Troubleshooting

* **Keys show "Offline" / "check host":** press "Test" in the key settings. The plugin needs `GET /api/v1/settings` and `GET /api/v1/display` to answer; a `401` means the device login is enabled and username / password are missing or wrong.
* **App Switch does nothing:** switching the shown app is implemented as `PUT /api/v1/apps/active` with `{"name": "<app>"}`, and next / previous cycle through `GET /api/v1/apps` from the app reported by `GET /api/v1/apps/active`. This part of the AWTRIX NG API is not documented in awtrix-ng-scripts, so the method, path or body may need a correction: all of them live in `src/awtrix/api.ts` (`ENDPOINT`, `ACTIVE_APP_METHOD`, `activeAppBody`, `parseApps`, `parseActiveApp`).
* **Notifications show without color:** the color is sent as `textColor` (a `#RRGGBB` string), like `awtrix-notify.sh` does. If your firmware expects an integer or a `color` key, change `notificationBody` in `src/awtrix/api.ts`.
* Anything else: [open an issue](https://github.com/kirkanos/Streamdeck-Awtrix/issues).
