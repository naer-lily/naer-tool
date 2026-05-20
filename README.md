# Futari

<img src="resources/icon.png" alt="Futari" width="64" align="right">

Plugin-based command launcher for Windows. Type less, do more.

Inspired by PowerToys Run and espanso. Built with Electron + Vue 3 + TypeScript.

## Features

- **Global shortcut** (`Alt+Space`) — summon the search bar from anywhere
- **Plugin system** — extend with `require()`-based plugins, JavaScript or TypeScript (runtime-compiled via esbuild)
- **Prefix subcommand mode** — type `=` for calculator, `>` to run commands, `hi` for greetings
- **Auto-activate** — detects foreground app and auto-enters matching plugin's subcommand
- **Home screen** — shows available plugins and global commands on empty input; filterable by typing
- **Keyboard navigation** — `Ctrl+J`/`↓` next, `Ctrl+K`/`↑` prev, `Alt+1-9` direct pick, `Esc` back/close
- **WebView** — plugins can open embedded web content (inline HTML or local file) below the search bar, with real-time input forwarding, optional base style injection, Promise-based await-on-close, and `futariWeb` API (`clipboard`, `shell`, `send`, `setHeight`, `close`)
- **Form dialog** — plugins show multi-field input forms (`input`, `number`, `select`, `checkbox`, `radio`, `switch`, `textarea`, `file`)
- **Config file** — `~/.futari/config.json` persists plugin paths, shortcut, and theme
- **System tray** — tray icon with show/hide, theme toggle, quit
- **Theme** — light/dark with acrylic backdrop effect; toggle via tray menu
- **Toast** — plugins call `ctx.toast(message)`; rendered as screen-bottom floating message

## Built-in Plugins

| Plugin | Prefix | Description |
|--------|--------|-------------|
| Calculator | `=` | Evaluate math expressions safely |
| RunCommand | `>` | Execute system commands with timeout |
| Hello | `hi` | Demo plugin: greet, WebView tests, multi-file dev demo |
| Plugin Creator | — | Fallback: scaffold new user plugins (JS or TS, `package.json`) |
| Reload | — | Fallback: reload all user plugins (match `reload` / `重载`) |

## Dev

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Output in `out/`.

## Architecture

```
src/main/          Electron main process
  index.ts           Entry + app lifecycle + builtin registration
  window-manager.ts  Search window (create/show/hide/toggle/auto-activate)
  search-engine.ts   Search dispatch (prefix/subcommand/fallback/home)
  plugin-host.ts     Plugin lifecycle (load/unload/reload)
  prefix-registry.ts Prefix → pluginId mapping
  ipc-handlers.ts    SEARCH/EXECUTE/CLOSE/WebView handlers
  toast.ts           Bottom-screen floating message
  tray.ts            System tray icon + menu
  web-view-manager.ts WebContentsView lifecycle (open/close/resize)
  plugins/builtins/  Built-in plugins
src/preload/       contextBridge — typed IPC API exposed to renderer
src/renderer/      Vue 3 SPA — search UI, keyboard nav, state machine, theme
src/shared/        Types and constants (both main + renderer)
resources/         web-view-preload.js (builtin WebView preload)
types/             futari-plugin-types local npm package
docs/              plugin-development.md tutorial
```

## Plugin API

Plugins implement `IPlugin` (see `src/shared/plugin-api.ts`):

- `prefix` — registered prefix (e.g. `=`, `>`, `hi`), triggers subcommand mode
- `buildCommands()` — returns commands to match against sub-input; called on every keystroke
- `getFallbackCommands()` — returns commands for main-mode matching (no prefix needed)
- `shouldAutoActivate(appInfo)` — return `true` to auto-enter subcommand when matching app is focused
- `ctx.toast(message)` — show a screen-bottom toast
- `ctx.showForm(config)` → `Promise` — open a form dialog, returns field values or `null`
- `ctx.openWebView(config)` → `Promise` — open embedded WebView, resolves on close with optional data
- `ctx.closeWebView()` — close the active WebView
- `ctx.clipboard.writeText(text)` / `readText()` / `writeHTML()` / `readHTML()` / `clear()` — clipboard access
- `ctx.shell.openExternal(url)` / `openPath(path)` / `showItemInFolder(path)` / `beep()` — system shell

User plugins are **`.js` CommonJS modules** loaded via `require()`. Plugin paths are persisted in `~/.futari/config.json`. Use the built-in Plugin Creator to scaffold a new plugin (auto-registers in config). The Reload command re-reads config and reloads all user plugins. See `docs/plugin-development.md` for the full tutorial.

## License

MIT
