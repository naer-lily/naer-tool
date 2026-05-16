# NaerTool

Plugin-based command launcher for Windows. Type less, do more.

Inspired by PowerToys Run and espanso. Built with Electron + Vue 3 + TypeScript.

## Features

- **Global shortcut** (`Alt+Space`) — summon the search bar from anywhere
- **Plugin system** — extend with `require()`-based plugins, built-in or user-supplied
- **Prefix subcommand mode** — type `hi ` then interact with the Hello plugin's commands
- **Keyboard navigation** — `Ctrl+J`/`↓` next, `Ctrl+K`/`↑` prev, `Alt+1-9` direct pick, `Esc` back/close
- **Theme** — light/dark with acrylic backdrop effect

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
src/main/     Electron main process — window, tray, plugin host, search engine
src/preload/  contextBridge — typed IPC API exposed to renderer
src/renderer/ Vue 3 SPA — search UI, keyboard nav, theme
src/shared/   Types and constants usable by both main + renderer
```

## Plugin System

Plugins implement `IPlugin` (see `src/shared/plugin-api.ts`):

- `prefix` — registered prefix (e.g. `hi`), triggers subcommand mode on exact match
- `buildCommands()` — returns commands to match against sub-input
- `fallbackCommand` (optional) — matches in main mode without prefix

## License

MIT
