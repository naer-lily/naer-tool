# AGENTS.md

## Architecture Philosophy

Futari is a **transient launcher** — the window appears, the user performs one task, the window disappears. There is no persistent "main screen" that the user idles on. This shapes every design decision.

### Core Model: Execute-and-Close

Every command execution follows a single rule: **after the task completes, close the window**. The user's next invocation starts fresh with a clean home screen.

The only exception is when the user **aborts** a task mid-flight — then they return to home mode to retry or do something else.

### Completion vs Cancellation

Distinction flows through `searchEngine.execute()` → `ExecuteResult.shouldClose`:

```
searchEngine tracks whether ctx.openWebView() was called and what it resolved to:

  hadWebView = false     → no WebView at all     → task completed → shouldClose=true
  hadWebView = true,
    result = defined     → WebView closed w/ data → task completed → shouldClose=true
  hadWebView = true,
    result = undefined   → WebView closed w/o data → user cancelled → shouldClose=false
```

- `futariWeb.close(data)` with data → "task done" → window closes
- `futariWeb.close()` with no args (or Escape / Backspace-empty) → "user aborted" → back to home

This is the **single source of truth** for deciding what happens after execution. The renderer's `selectResult()` checks `shouldClose` and either calls `closeWindow()` or transitions to home.

### Authority Boundary

```
Main process:              Renderer (Vue):
  owns truth                owns display
  ───────────              ──────────────
  plugin execution          state machine (thin UI layer)
  WebView lifecycle         search bar + result list
  config persistence        theme rendering
  shortcut registration     keyboard nav
```

The renderer state machine (`useViewState`) is a **display-only** state tracker. It reflects what the main process tells it to show. It never makes decisions about command outcomes — those come from `searchEngine.execute()` via the IPC EXECUTE response.

### Window Lifecycle

```
         shortcut / tray
              │
    ┌─────────▼─────────┐
    │   home screen      │  ← always starts here on show
    │   (prefix entries  │
    │    + fallbacks)    │
    └────┬───────┬──────┘
         │       │
    prefix    select fallback
    match     or prefix entry
         │       │
    ┌────▼───────▼────┐
    │  subcommand     │  ← plugin-specific commands
    └────┬────────────┘
         │
    select command
         │
    ┌────▼────────────┐
    │  execute()      │
    │  ┌──────────┐   │
    │  │ non-WebView│──┼──→ shouldClose=true → closeWindow()
    │  └──────────┘   │
    │  ┌──────────┐   │
    │  │ WebView   │   │
    │  │  complete │───┼──→ shouldClose=true → closeWindow()
    │  │  cancel   │───┼──→ shouldClose=false → home
    │  └──────────┘   │
    └─────────────────┘
```

When the window closes via `closeWindow()`, it goes off-screen (see Off-Screen Hide Pattern). The state machine is **not reset on close** — it's reset the next time `showWindow()` sends `focus-input`, which triggers `handleFocusInput()` → dispatch focus-input → wake-up on the home screen.

### `executingCommand` is NOT a state

The `executingCommand` flag is a transient race guard, not a UI state. It prevents `focus-input` IPC (triggered by `showWindow()`) from disrupting the `subcommand` state while `selectResult()` is awaiting execution. Once the command resolves, `executingCommand` clears immediately.

### Key Design Rules

1. **State machine transitions are guarded** — never assume a transition is valid; `dispatch()` returns `false` on invalid transitions.
2. **IPC listeners run independently** — while `selectResult()` blocks on `await execute()`, other IPC listeners (`onShowWebView`, `onHideWebView`) fire independently and update state.
3. **Window close = off-screen hide, never `win.hide()`** — see Off-Screen Hide Pattern below.
4. **Config changes that require restart** (e.g. shortcut) are saved immediately but not applied until next launch.

## Tech Stack
- Electron 33+ / Vue 3 (Composition API) / TypeScript
- Build: `electron-vite` (Vite-based)
- Logging: `electron-log` v5 (main + renderer → `~/.futari/logs/main.log` + console)
- No UI component library — hand-written CSS only
- Styles: CSS custom properties for light/dark themes; acrylic effect via `backdrop-filter`

## Directory Architecture
```
src/main/        Electron main process — NO DOM access
  index.ts          Entry: app lifecycle, builtin plugin registration, shortcut, config bootstrap
  window-manager.ts Search window (create/show/hide/toggle/auto-activate), off-screen hide pattern
  search-engine.ts  Search dispatch (prefix/subcommand/fallback/home) + execute with shouldClose tracking
  plugin-host.ts    Plugin lifecycle (load/unload/reload/loadFromPath)
  prefix-registry.ts Prefix → pluginId mapping
  ipc-handlers.ts   IPC handler registration (SEARCH/EXECUTE/FORM_SUBMIT/WebView/LOG/CONFIG)
  toast.ts          Screen-bottom toast via data-URL BrowserWindow
  tray.ts           System tray icon + context menu
  web-view-manager.ts WebContentsView lifecycle (open/close/resize/input-forward), preload building
  form-dialog.ts    Form dialog (frameless BrowserWindow, custom title bar, CSS drag region)
  config.ts         ~/.futari/config.json manager (load/save/getRaw/patch)
  logger.ts         Main process logger (electron-log → ~/.futari/logs/main.log)
  plugins/
    builtins/       Built-in plugins (hello, calculator, run, reload, plugin-creator, settings)
src/preload/     contextBridge — exposes typed futariAPI to renderer (includes log forwarding)
src/renderer/    Vue 3 SPA — NO Node.js access
  src/
    App.vue           Root component (search container, webview placeholder, toast)
    components/       SearchInput, ResultList
    composables/      useViewState (state machine), useSearch (IPC bridge), useKeyboardNav, useTheme
    utils/logger.ts   Renderer logger (console + IPC forward to main log file)
src/shared/      Types and constants usable by both main + renderer
resources/       web-view-preload.js, settings.html (builtin preload + settings WebView page)
types/           futari-plugin-types local npm package (plugin TypeScript typings)
docs/            plugin-development.md (plugin author tutorial)
```
- `src/main/` owns: plugin loading, tray, global shortcuts, window management, file system, WebView lifecycle
- `src/renderer/` owns: search UI, keyboard navigation, theme rendering, state machine
- Communication: `ipcRenderer` ↔ `ipcMain` via channels defined in `src/shared/ipc-channels.ts`

## Import Conventions
- `@shared/*` → `src/shared/*` (available in all modules)
- `@main/*` → `src/main/*` (main process only)
- `@/*` → `src/renderer/src/*` (renderer only)
- NEVER use relative imports (`./` or `../`); always use path aliases

## Renderer State Machine (Critical)

Located in `src/renderer/src/composables/useViewState.ts`. Singleton pattern — one instance shared across all composables/components.

### States (discriminated union on `id`)
```
home              — main search mode, shows prefix entries + fallback results
subcommand        — plugin sub-mode after typing prefix, shows plugin commands
  fields: pluginId, icon
webview-loading   — WebView opened, content loading, shows spinner
  fields: height, icon
webview-active    — WebView content rendered and displayed
  fields: height, icon
```

### Events (ViewEvent discriminated union)
```
enter-subcommand  — pluginId, icon?        → home/subcommand → subcommand
exit-subcommand   —                        → subcommand → home
open-webview      — height, icon           → any → webview-loading
webview-ready     —                        → webview-loading → webview-active
close-webview     —                        → webview-loading/webview-active → home
focus-input       —                        → subcommand → home (guarded: skipped if executingCommand)
auto-activate     — pluginId, icon?        → home → subcommand
```

### Guards
- `exit-subcommand`: only from `subcommand`
- `webview-ready`: only from `webview-loading`
- `close-webview`: only from `webview-loading` or `webview-active`
- `focus-input`: returns `false` (no-op) when in `webview-loading` or `webview-active`; also skipped entirely if `executingCommand` flag is true
- `auto-activate`: returns `false` when in `webview-loading` or `webview-active`

### Key computed properties
- `activePluginIcon`: returns icon from `subcommand`, `webview-loading`, or `webview-active` states
- `webviewActive`: true for `webview-loading` or `webview-active`
- `activePluginId`: pluginId from `subcommand` state only

### `executingCommand` — async race guard
Set to `true` in `selectResult()` before `await execute()`, cleared after. When `true`, `handleFocusInput()` returns immediately without dispatching — prevents the `focus-input` IPC (sent by `showWindow()`) from transitioning `subcommand → home` while a command (esp. WebView open) is in-flight.

## WebView Lifecycle (Critical)

### Icon delivery path
Plugin icon travels via **IPC payload**, NOT by capturing from renderer state:
```
searchEngine.execute() → injects resolveIcon(plugin.icon) into WebViewConfig.pluginIcon
  → webViewManager.open(config)
    → dom-ready handler: send('show-web-view', { height, icon: config.pluginIcon })
      → renderer handleShowWebView(payload) → uses payload.icon directly
```
**NEVER** capture icon from `state.value.id === 'subcommand'` in `handleShowWebView` — this is the fragile pattern that caused the icon-loss bug.

### Timing contract
```
Main:                           Renderer:
execute("hi", "web-test", "") →
  searchEngine.execute()        selectResult() — executingCommand=true
    command.execute(ctx) →      [blocked at await execute()]
      ctx.openWebView(config) →
        webViewManager.open() →
          WCV created, isActive=true
          loadURL starts
          returns Promise          ← show-web-view NOT sent yet
        [await Promise...]         ← IPC handler awaits execute()

... loadURL completes ...
dom-ready fires →
  setExpandedHeight(height)
  send('show-web-view', {h,icon})→ handleShowWebView: icon=payload.icon ✓
  send('web-view-ready')        → handleWebViewReady: focus input

... user clicks Save (with data) ...
WebView: futariWeb.close(data) →
  IPC close-web-view →
    webViewManager.close(data)
    resolve Promise(data)         ← hadWebView=true, webViewResult=defined → shouldClose=true

command.execute() resumes         selectResult() resumes
execute() returns shouldClose=true  shouldClose=true → closeWindow() ✓

... OR user presses Escape / Cancel ...
handleEscape() → closeWebView():
  dispatch(close-webview) → home
  doSearch()
  IPC close-web-view →
    webViewManager.close()        ← webViewResult=undefined → shouldClose=false

                                  selectResult() resumes
                                  state='home', shouldClose=false → re-doSearch
```

### `ctx.openWebView()` is now a Promise
- Returns `Promise<unknown>` — resolves when `closeWebView()` is called
- Resolution value: data from `futariWeb.close(data)` or last `futariWeb.send(data)`
- Plugin can `await` it for post-close logic, opening another WebView, etc.
- The IPC EXECUTE handler **must await** `searchEngine.execute()` — the renderer's `selectResult` blocks, but state machine IPC listeners run independently

### WebView rendering constraint
`WebContentsView` added via `contentView.addChildView()` sits **ON TOP** of the Vue renderer (z-order constraint). Vue elements cannot overlay on top of WCV content. The search bar header is styled separately from the container to remain visible above the WCV.

## WebView Config
```typescript
interface WebViewConfig {
  html?: string            // inline HTML → data: URI
  htmlPath?: string        // file path → file:/// URL (enables <script src>)
  url?: string             // arbitrary URL
  preload?: string         // plugin preload file path (require('./lib') works)
  height?: number          // content area height (default 450)
  injectBaseStyles?: boolean // inject scrollbar+box-sizing+font reset (default false)
  pluginIcon?: string      // SET BY FRAMEWORK — do not set in plugin code
}
```

## Plugin System — Critical Rules

### Icon Format
- `icon` supports both **emoji/text** (e.g. `🔧`) and **inline SVG** (e.g. `<svg viewBox="0 0 24 24" fill="currentColor"><path .../></svg>`)
- SVGs are rendered via `v-html`; recommended size 18×18px, use `fill="currentColor"` for theme compatibility

### Loading
- Built-in plugins live in `src/main/plugins/builtins/`, imported at startup via `registerBuiltin()`
- User plugins live under `~/.futari/plugins/<plugin-name>/` — each directory must contain a `package.json` with `"main"` pointing to the entry `.js`
- At startup and on reload, `pluginHost.scanAndLoadUserPlugins()` scans `~/.futari/plugins/` for subdirectories with `package.json`, `require()`s them, and registers in the plugin map
- Config file `~/.futari/config.json` stores only: `shortcut`, `theme` (no plugin paths)
- Plugin-creator (`Create Plugin`) scaffolds new user plugins directly into `~/.futari/plugins/<name>/` — no folder selection or config editing needed
- Reload command calls `scanAndLoadUserPlugins()` which unloads all user plugins (with try-catch per plugin) then rescans and reloads
- `pluginHost.loadFromPath(dir)`: resolves via `package.json.main`, `delete require.cache`, `require()`s the module, calls `onActivate`, registers in map. Conflicts: unloads existing plugin with same ID first.
- `IPlugin.prefix` — registers in PrefixRegistry; user types `prefix ` to enter subcommand mode
- `IPlugin.buildCommands()` — called ONCE when entering subcommand mode, returns all `ICommand[]`
- `ICommand.match(input: string): CommandMatch | null` — called on EVERY keystroke; returns null if no match
- `ICommand.execute(ctx)` — called only when user selects the command; can be async; can `await ctx.openWebView()`
- `IFallbackCommand` — for main-mode matching (no prefix needed)
- `IPlugin.shouldAutoActivate?(appInfo)` — check foreground window on launcher show to auto-enter subcommand
- `CommandContext.clipboard` — `writeText/readText/writeHTML/readHTML/clear` wrappers over `electron.clipboard`
- `CommandContext.shell` — `openExternal/openPath/showItemInFolder/beep` wrappers over `electron.shell`

### Reload
- `scanAndLoadUserPlugins()` unloads all user plugins (each with `try-catch`) then rescans `~/.futari/plugins/`
- `delete require.cache[pluginPath]` → re-`require()` → `onDeactivate()` old → `onActivate()` new
- PrefixRegistry is rebuilt on reload

### Plugin preload relative imports
- Plugin preload (`config.preload`) is loaded via `require()` from a temp wrapper file
- `require('./lib.js')` resolves relative to the **plugin preload's original directory** (not temp)
- Plugin preload CAN use `require('electron')` for ipcRenderer; CANNOT use `require('fs')` (not main process)

### Plugin HTML relative imports
- Use `config.htmlPath` (not `config.html`) → loaded as `file:///` URL
- `<script src="./lib.js">` resolves relative to the HTML file's directory
- `config.url` with `file:///...` also works

### Type distribution
- `types/` directory is a local npm package `futari-plugin-types`
- Plugin `package.json` references it via `"devDependencies": { "futari-plugin-types": "file:..." }`
- `npm install` → symlink → IDE auto-completion; no need to copy `.d.ts`

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

## Command Outcome (`CommandOutcome`)

Plugins control what happens after execution by returning from `ICommand.execute()`:

```typescript
type CommandOutcome = 'close' | 'home'
```

| Return value | WebView? | Behavior |
|---|---|---|
| `undefined` (no return) | No | `shouldClose = true` → close window |
| `undefined` (no return) | Yes, `close(data)` with data | `shouldClose = true` → close window |
| `undefined` (no return) | Yes, `close()` no data | `shouldClose = false` → back to home |
| `'close'` | — | Close window (overrides WebView inference) |
| `'home'` | — | Back to home screen (overrides WebView inference) |

### Decision priority in `searchEngine.execute()`
```
1. Plugin returned 'close'  → shouldClose = true
2. Plugin returned 'home'   → shouldClose = false
3. Plugin opened WebView    → infer from close(data) value (defined → true, undefined → false)
4. Otherwise (no WebView)   → shouldClose = true (default)
```

This gives plugins full control: a WebView that completed successfully can still `return 'home'` to keep the launcher open, and a non-WebView command can `return 'home'` to stay instead of closing.

## Toast API
- `CommandContext.toast(message: string)` — injected function, no return value from `execute()`.
- Plugins call `ctx.toast(...)` to show screen-bottom floating message; silent otherwise.

## Form Dialog API
- `CommandContext.showForm(config: FormConfig)` → `Promise<Record<string, unknown> | null>`
- Opens a frameless transparent form window with title, fields, and OK/Cancel buttons.
- Field types: `input`, `number`, `select`, `checkbox`, `radio`, `switch`, `textarea`, `file`
- Returns `null` on cancel/close, or a key-value object on OK.
- Plugin-creator uses this for its scaffold form.

## Auto-Activate
- On window show, `activeWin.sync()` captures foreground window BEFORE `show()`/`focus()`.
- Each plugin's `shouldAutoActivate?(appInfo): boolean` checked; first match triggers `enterSubcommand()` on renderer.
- Only one message sent: either `auto-activate` or `focus-input`, never both.

## Keyboard Navigation
- `Ctrl+J` / `↓` → next item
- `Ctrl+K` / `↑` → previous item
- `Alt+1` ~ `Alt+9` → direct selection
- `Enter` → execute selected
- `Esc` → close window OR return from subcommand to main mode OR close WebView
- Backspace-to-empty while in subcommand mode → return to main mode
- Backspace-to-empty while WebView active → close WebView

## Window Behavior

### Search window — frameless, transparent, always-on-top
- Frameless (`frame: false`), transparent (`transparent: true`), always-on-top (`alwaysOnTop: true, 'screen-saver'`)
- Centered at top of screen: `centerAtTop()` positions at screen center X, 12% from top Y
- Default size: 680×400; WebView mode expands to 680×(64+height)
- Container (Vue): 648px wide, x=16 margin each side
- `BOTTOM_SHADOW_SPACE=16`: WCV reduced by 16px so container box-shadow renders in the gap
- Global shortcut: `Alt+Space` (configurable in `~/.futari/config.json`)

### Off-screen hide pattern (CRITICAL — DO NOT CHANGE)
**Why**: The main window is `alwaysOnTop: true, 'screen-saver'` + `transparent: true` = `WS_EX_LAYERED`. Even with `setOpacity(0)` + `setIgnoreMouseEvents(true)`, its HWND remains in the DWM Z-order. DWM composites through this layered window for every mouse hit-test on sibling windows in the same process (Form dialog, DevTools), causing cursor flicker and drag jitter.

**Solution**: NEVER call `win.hide()` (causes Windows show/hide animation flash). Instead:
```
hideWindow(): setOpacity(0) → setIgnoreMouseEvents(true, {forward:true}) → setPosition(-9999, -9999)
showWindow(): centerAtTop() → setOpacity(0) → setIgnoreMouseEvents(false) → show() → focus() → setImmediate(() => setOpacity(1))
```
- Window is always "shown" (never hidden), just moved off-screen when not needed
- DWM ignores windows whose rectangles don't overlap the visible desktop — no composition interference
- `setOpacity` handles the fade-in/out; no native animation flash

### Form dialog — frameless, opaque, custom title bar
- `frame: false, transparent: false, backgroundColor: '#202020'`
- Custom title bar with CSS `-webkit-app-region: drag` / `-webkit-app-region: no-drag`
- Field types: `input`, `number`, `select`, `checkbox`, `radio`, `switch`, `textarea`, `file`
- Height formula: `130 + fieldCount * 48` (includes 36px title bar)
- `nodeIntegration: true, contextIsolation: false` — form JS directly uses `require('electron')`

## Logging
- **Main process** (`src/main/logger.ts`): `electron-log` v5 → file (`~/.futari/logs/main.log`) + console
- **Renderer** (`src/renderer/src/utils/logger.ts`): `console.log` + IPC forward to main log file, both with `[FUTARI]` prefix + millisecond timestamp
- Levels: `error`, `warn`, `info`, `debug`, `trace` (trace = debug-level, all enabled)
- Key trace points: dispatch state transitions, selectResult lifecycle, handleShowWebView icon, openWebView/config, dom-ready timing, IPC EXECUTE flow
- Keep trace logs permanent — they document the async execution flow and are essential for debugging timing bugs

## Dev Commands
- `npm run dev` — starts electron-vite dev server (renderer hot-reload)
- `npm run build` — production build
- `npm run lint` — vue-tsc type-check (main + web configs)
- Log file: `tail -f ~/.futari/logs/main.log`
- `npm run package` — build + electron-builder portable exe → `dist/Futari-*-portable.exe`

## Build Config (`package.json` → `"build"`)
- `icon`: `resources/icon.png` — electron-builder 会自动生成各平台格式 (Windows .ico 等)
- After changing `package.json` (version, build config), run `npm run lint` to verify

## Version & Release Rules
- **Only bump version when explicitly asked by the user**
- When bumping: update `package.json` version, `git commit`, `git tag vX.Y.Z`, `git push --tags`
- CI (`.github/workflows/release.yml`) triggers on `v*` tag push → builds portable exe → creates GitHub Release
- Requires `setup-python@v5` with `python-version: '3.11'` for `node-gyp` native module rebuild
