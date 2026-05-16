# NaerTool

Plugin-based command launcher for Windows. Type less, do more.

Inspired by PowerToys Run and espanso. Built with Electron + Vue 3 + TypeScript.

## Features

- **Global shortcut** (`Alt+Space`) — summon the search bar from anywhere
- **Plugin system** — extend with `require()`-based plugins, built-in or user-supplied
- **Prefix subcommand mode** — type `=` for calculator, `>` to run commands, `hi` for greetings
- **Auto-activate** — detects foreground app and auto-enters matching plugin's subcommand
- **Home screen** — shows available plugins and global commands on empty input; filterable by typing
- **Keyboard navigation** — `Ctrl+J`/`↓` next, `Ctrl+K`/`↑` prev, `Alt+1-9` direct pick, `Esc` back/close
- **System tray** — tray icon with show/hide, theme toggle, quit
- **Theme** — light/dark with acrylic backdrop effect; toggle via tray menu
- **Toast** — plugins call `ctx.toast(message)`; rendered as screen-bottom floating message

## Built-in Plugins

| Plugin | Prefix | Description |
|--------|--------|-------------|
| Calculator | `=` | Evaluate math expressions safely |
| RunCommand | `>` | Execute system commands with timeout |
| Hello | `hi` | Demo plugin: greet/say goodbye |
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
src/main/     Electron main process — window, tray, plugin host, search engine, auto-activate
src/preload/  contextBridge — typed IPC API exposed to renderer
src/renderer/ Vue 3 SPA — search UI, keyboard nav, theme, unified enterSubcommand
src/shared/   Types and constants usable by both main + renderer
```

## Plugin API

Plugins implement `IPlugin` (see `src/shared/plugin-api.ts`):

- `prefix` — registered prefix (e.g. `=`, `>`, `hi`), triggers subcommand mode
- `buildCommands()` — returns commands to match against sub-input; called on every keystroke
- `getFallbackCommands()` — returns commands for main-mode matching (no prefix needed)
- `shouldAutoActivate(appInfo)` — return `true` to auto-enter subcommand when matching app is focused
- `ctx.toast(message)` — call from `execute()` to show a screen-bottom toast; silent otherwise

## License

MIT
