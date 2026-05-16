# AGENTS.md

## Tech Stack
- Electron 30+ / Vue 3 (Composition API) / TypeScript
- Build: `electron-vite` (Vite-based)
- No UI component library — hand-written CSS only
- Styles: CSS custom properties for light/dark themes; acrylic effect via `backdrop-filter`

## Directory Architecture
```
src/main/        Electron main process — NO DOM access
src/preload/     contextBridge — exposes typed API to renderer
src/renderer/    Vue 3 SPA — NO Node.js access
src/shared/      Types and constants usable by both main + renderer
```
- `src/main/` owns: plugin loading, tray, global shortcuts, window management, file system
- `src/renderer/` owns: search UI, keyboard navigation, theme rendering
- Communication: `ipcRenderer` ↔ `ipcMain` via channels defined in `src/shared/ipc-channels.ts`

## Plugin System — Critical Rules

### Loading
- Built-in plugins live in `src/main/plugins/`, imported at startup
- User plugins loaded via `require()` from arbitrary paths listed in config
- **NO automatic hot-reload** — a fallback command "Reload Plugins" manually re-`require()`s from disk

### Interface (defined in `src/shared/plugin-api.ts`)
- `IPlugin.prefix` — registers in PrefixRegistry; user types `prefix ` to enter subcommand mode
- `IPlugin.buildCommands()` — called ONCE when entering subcommand mode, returns all `ICommand[]`
- `ICommand.match(input: string): CommandMatch | null` — called on EVERY keystroke; returns null if no match
- `ICommand.execute(ctx)` — called only when user selects the command
- `IFallbackCommand` — for main-mode matching (no prefix needed)
- `IPlugin.shouldAutoActivate?(appInfo)` — check foreground window on launcher show to auto-enter subcommand

### Reload
- `delete require.cache[pluginPath]` → re-`require()` → `onDeactivate()` old → `onActivate()` new
- PrefixRegistry is rebuilt on reload

## Search Flow
```
Renderer input → IPC("search", text)
  → Main checks PrefixRegistry
    → prefix exact match ("hi") OR "prefix space subInput" → dispatch to plugin.buildCommands() + plugin's own fallbackCommands → each cmd.match(subInput)
    → no prefix, empty → return all prefix-entry results + all fallbackCommands (home screen)
    → no prefix, non-empty → filter prefix entries by text + gather fallbackCommands by matches(input)
  → Return SearchResponse { mode, pluginId?, results } (max 9, sorted by priority)
  → Renderer displays results
```
- Home screen prefix entries carry `prefixEntry` field; selecting one calls unified `enterSubcommand(pluginId, icon)`.
- `enterSubcommand()` is the single entry point — used by prefix match, home entry selection, and auto-activate.

## Toast API
- `CommandContext.toast(message: string)` — injected function, no return value from `execute()`.
- Plugins call `ctx.toast(...)` to show screen-bottom floating message; silent otherwise.

## Auto-Activate
- On window show, `activeWin.sync()` captures foreground window BEFORE `show()`/`focus()`.
- Each plugin's `shouldAutoActivate?(appInfo): boolean` checked; first match triggers `enterSubcommand()` on renderer.
- Only one message sent: either `auto-activate` or `focus-input`, never both.

## Keyboard Navigation
- `Ctrl+J` / `↓` → next item
- `Ctrl+K` / `↑` → previous item
- `Alt+1` ~ `Alt+9` → direct selection
- `Enter` → execute selected
- `Esc` → close window OR return from subcommand to main mode
- Backspace-to-empty while in subcommand mode → return to main mode

## Window Behavior
- Search window: frameless, transparent, always-on-top, centered at top of screen (~680px wide)
- Global shortcut: `Alt+Space` (configurable)
- Plugin-created windows use Electron `BrowserWindow` via `WindowManager`

## Dev Commands
- `npm run dev` — starts electron-vite dev server (renderer hot-reload)
- `npm run build` — production build
- `npm run lint` — ESLint + types check

## Phase-Based Development
- Work stops after each phase for manual testing — do NOT proceed to next phase unprompted
- See TODO list for phase breakdown
- After changes: run `npm run lint` (when available), verify TypeScript compiles
