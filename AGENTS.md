# AGENTS.md

## Architecture Philosophy

Futari is a **transient launcher** — the window appears, the user performs one task, the window disappears. There is no persistent "main screen" that the user idles on. This shapes every design decision.

### Signal Model (refactor May 2026)

The architecture follows a strict **Signal Model** — main process is a zero-decision infrastructure shell; renderer is the sole state machine and decision maker.

```
Main (SearchWindow — 零状态基础设施):
  OS 事件发生 → 转发 signal → Renderer
  Renderer 命令到达 → 无脑执行机械操作
  ─ 不做任何状态判断，不替 renderer 做任何决策

Renderer (useAppState — 唯一状态机):
  接收 signal → 查当前状态 → dispatch → 转换状态 + 副作用
  副作用包括: 调 futariAPI.showWindow/hideWindow/resizeWindow 命令 main
```

**为什么**: 每个信号（Alt+Space、失焦、托盘点击）的语义取决于当前状态。只有 renderer 拥有完整的 UI 上下文（home? subcommand? webview?），所以它应该做决策。Main 只是一个事件中继器 + 命令执行器。

### Signals (Main → Renderer, via `IPC.APP_EVENT`)

| Signal | 触发时机 | Renderer 响应 |
|--------|---------|-------------|
| `shortcut-pressed { autoActivate? }` | 全局快捷键 | idle→SHOW(home/subcommand); visible→HIDE |
| `tray-clicked` | 托盘点击 | idle→SHOW; visible→HIDE |
| `second-instance` | 第二个实例启动 | idle→SHOW; visible→无视 |
| `window-blurred` | 主窗口失焦 | home/subcommand→HIDE; webview-*→无视 |
| `webview-opened { height, icon }` | WebView 创建 | subcommand→webview-loading |
| `webview-ready` | WebView DOM 就绪 | webview-loading→webview-active |
| `webview-closed { data? }` | WebView 关闭 | webview-*→home |

### Core Model: Execute-and-Close

Every command execution follows a single rule: **after the task completes, close the window**. The user's next invocation starts fresh with a clean home screen.

The only exception is when the user **aborts** a task mid-flight — then they return to home mode to retry or do something else.

### Completion vs Cancellation

Render 端自行判断 shouldClose:
```
selectResult() 追踪 hadWebView 和 webViewHadData:
  hadWebView = false     → shouldClose = true
  hadWebView = true, webViewHadData = true  → task completed → shouldClose = true
  hadWebView = true, webViewHadData = false → user cancelled → shouldClose = false
```

- `futariWeb.close(data)` with data → "task done" → window closes
- `futariWeb.close()` with no args (or Escape / Backspace-empty) → "user aborted" → back to home

### Authority Boundary

```
Main process (SearchWindow):          Renderer (Vue + useAppState):
  ─────────────────────────            ───────────────────────────
  持有 BrowserWindow 资源              **唯一状态机** (idle/home/subcommand/wv-*)
  转发 OS 事件为 signal                  search bar + result list
  plugin execution                     theme rendering
  WebView 生命周期                      keyboard nav
  config persistence                   **所有 show/hide/resize 决策**
  ─ 零决策，零业务状态                  ─ 单向命令 main 执行机械操作
```

## Tech Stack
- Electron 33+ / Vue 3 (Composition API) / TypeScript
- Build: `electron-vite` (Vite-based)
- Logging: `electron-log` v5 (main + renderer → `~/.futari/logs/main.log` + console)
- No UI component library — hand-written CSS only
- Styles: CSS custom properties for light/dark themes; acrylic effect via `backdrop-filter`

## Directory Architecture
```
src/main/        Electron main process — NO DOM access
  index.ts          Entry: app lifecycle, builtin plugin registration, shortcut (→signalShow), config bootstrap
  search-window.ts  **无状态窗口壳** — BrowserWindow 创建/持有、show/hide 纯机械操作、sendSignal 统一出口、checkAutoActivate
  window-manager.ts SearchWindow 的薄门面 — 所有外部模块通过此访问窗口能力
  search-engine.ts  Search dispatch (prefix/subcommand/fallback/home) + execute with shouldClose tracking
  plugin-host.ts    Plugin lifecycle (load/unload/reload/loadFromPath)
  prefix-registry.ts Prefix → pluginId mapping
  ipc-handlers.ts   IPC handler registration (SEARCH/EXECUTE/SHOW_WINDOW/HIDE_WINDOW/WebView/LOG/CONFIG)
  toast.ts          Screen-bottom toast via data-URL BrowserWindow
  tray.ts           系统托盘 — 点击发送 tray-clicked signal (不再调用 toggleWindow)
  web-view-manager.ts WebContentsView lifecycle (open/close/resize/input-forward), preload building
  form-dialog.ts    Form dialog (frameless BrowserWindow, custom title bar, CSS drag region)
  config.ts         ~/.futari/config.json manager (load/save/getRaw/patch)
  logger.ts         Main process logger (electron-log → ~/.futari/logs/main.log)
  plugins/
    builtins/       Built-in plugins (calculator, run, plugin-creator, settings, ctool)
src/preload/     contextBridge — exposes typed futariAPI (onAppEvent, showWindow, hideWindow, search, execute...)
src/renderer/    Vue 3 SPA — NO Node.js access
  src/
    App.vue           Root component (search container, webview placeholder, toast)
    components/       SearchInput, ResultList
    composables/      **useAppState** (唯一状态机), useSearch (IPC bridge), useKeyboardNav, useTheme
    utils/logger.ts   Renderer logger (console + IPC forward to main log file)
src/shared/      Types and constants usable by both main + renderer
  ipc-channels.ts    IPC 通道常量 + AppSignalType 联合类型 + AppSignalPayload
resources/       web-view-preload.js, settings.html (builtin preload + settings WebView page)
types/           futari-plugin-types local npm package (plugin TypeScript typings)
docs/            plugin-development.md (plugin author tutorial)
```
- `src/main/` owns: plugin loading, tray, global shortcuts, **资源持有 (BrowserWindow)**, WebView lifecycle, **机械操作执行**
- `src/renderer/` owns: **所有状态决策**、search UI、keyboard navigation、theme rendering、**何时 show/hide/resize**
- Communication: `ipcRenderer` ↔ `ipcMain` via channels defined in `src/shared/ipc-channels.ts`

## Import Conventions
- `@shared/*` → `src/shared/*` (available in all modules)
- `@main/*` → `src/main/*` (main process only)
- `@/*` → `src/renderer/src/*` (renderer only)
- NEVER use relative imports (`./` or `../`); always use path aliases

## App State Machine (Critical)

Located in `src/renderer/src/composables/useAppState.ts`. Singleton pattern — **the only state machine in the entire app**.

### States
```
idle              — 窗口隐藏 (off-screen), 不响应除 SHOW 以外的事件
home              — 窗口可见, 首页搜索模式
subcommand        — 窗口可见, 插件子命令模式
  fields: pluginId, icon
webview-loading   — WebView 创建, 内容加载中
  fields: height, icon
webview-active    — WebView 内容已渲染
  fields: height, icon
```

### Internal Events (dispatch)
```
SHOW { autoActivate? } → idle → home/subcommand
HIDE                    → home/subcommand/webview-* → idle
ENTER_SUBCOMMAND        → home/subcommand → subcommand
EXIT_SUBCOMMAND         → subcommand → home
WEBVIEW_OPEN            → subcommand → webview-loading
WEBVIEW_READY           → webview-loading → webview-active
WEBVIEW_CLOSE           → webview-loading/webview-active → home
```

### Signal → Internal Event Mapping (handleSignal)
```
idle:
  shortcut-pressed/tray-clicked/second-instance → SHOW → home (or subcommand if autoActivate)
  window-blurred → ignore

home / subcommand:
  shortcut-pressed/tray-clicked → HIDE → idle
  second-instance → ignore (already visible)
  window-blurred → HIDE → idle

webview-loading / webview-active:
  shortcut-pressed/tray-clicked → WEBVIEW_CLOSE + HIDE → idle
  window-blurred → ignore (不打断 WebView 交互)
  webview-opened/ready/closed → 相应 transition
```

### `executingCommand` — async race guard
Set to `true` in `selectResult()` before `await execute()`, cleared after. Signals are still processed during execution, but the state machine handles the transitions correctly. If the user hides the window during execution, the subsequent shouldClose check is a no-op.

### Key computed properties
- `mode`: `'main'` (home/idle) or `'subcommand'`
- `webviewActive`: true for `webview-loading` or `webview-active`
- `activePluginIcon`: icon from `subcommand`, `webview-loading`, or `webview-active` states
- `activePluginId`: pluginId from `subcommand` state only

## Window Lifecycle

```
用户 Alt+Space
  → Main: checkAutoActivate() + sendSignal('shortcut-pressed', { autoActivate? })
  → Renderer: idle + shortcut-pressed → dispatch SHOW → home
              enter home: futariAPI.showWindow() + doSearch()

输入 "hi " → prefix match → ENTER_SUBCOMMAND → subcommand → 显示插件命令

选命令 → selectResult()
  非 WebView: await execute() → shouldClose=true → futariAPI.hideWindow() → HIDE → idle
  WebView:    await execute() ──── webview-opened → wv-loading → wv-ready → wv-active
                用户完成: futariWeb.close(data) → webview-closed → home
                shouldClose=true → futariAPI.hideWindow() → HIDE → idle
                用户取消: futariWeb.close() → webview-closed → home
                shouldClose=false → 留在 home, doSearch()

点击其他应用 (blur)
  → Main: sendSignal('window-blurred')
  → Renderer: home/subcommand → futariAPI.hideWindow() → HIDE → idle
              webview-* → 无视 (保护 WebView 交互)
```

## WebView Lifecycle (Critical)

### Icon delivery path
Plugin icon travels via **IPC payload**, NOT by capturing from renderer state:
```
searchEngine.execute() → injects resolveIcon(plugin.icon) into WebViewConfig.pluginIcon
  → webViewManager.open(config)
    → dom-ready handler: send APP_EVENT{ webview-opened, height, icon: config.pluginIcon }
      → renderer handleSignal → dispatch WEBVIEW_OPEN → 使用 payload.icon 直接
```
**NEVER** capture icon from `state.value.id === 'subcommand'` — this is the fragile pattern that caused the icon-loss bug.

### Timing contract
```
Main:                           Renderer:
execute() →
  searchEngine.execute()        selectResult() — executingCommand=true
    command.execute(ctx) →      [blocked at await execute()]
      ctx.openWebView(config) →
        webViewManager.open() →
          WCV created, isActive=true
          loadURL starts
          returns Promise          ← signal NOT sent yet
        [await Promise...]         ← IPC handler awaits execute()

... loadURL completes ...
dom-ready fires →
  setWindowSize(expanded)
  send APP_EVENT{ webview-opened, h, icon } → handleSignal: dispatch WEBVIEW_OPEN
  send APP_EVENT{ webview-ready }          → handleSignal: dispatch WEBVIEW_READY

... user clicks Save (with data) ...
WebView: futariWeb.close(data) →
  IPC CLOSE_WEB_VIEW →
    webViewManager.close(data)
    send APP_EVENT{ webview-closed, data } → handleSignal: dispatch WEBVIEW_CLOSE
    resolve Promise(data)                   → hadWebView=true, webViewHadData=true

command.execute() resumes         selectResult() resumes
                                  shouldClose=true → hideWindow() → HIDE → idle ✓

... OR user presses Escape ...
handleEscape() → futariAPI.closeWebView()
  IPC CLOSE_WEB_VIEW →
    webViewManager.close()        ← data=undefined
    send APP_EVENT{ webview-closed }
    resolve Promise(undefined)    → hadWebView=true, webViewHadData=false

                                  selectResult() resumes
                                  shouldClose=false → doSearch() ✓
```

### `ctx.openWebView()` is a Promise
- Returns `Promise<unknown>` — resolves when `closeWebView()` is called
- Resolution value: data from `futariWeb.close(data)` or last `futariWeb.send(data)`
- Plugin can `await` it for post-close logic
- The IPC EXECUTE handler **must await** `searchEngine.execute()` — the renderer's `selectResult` blocks, but signal listeners fire independently

### WebView rendering constraint
`WebContentsView` added via `contentView.addChildView()` sits **ON TOP** of the Vue renderer (z-order constraint). Vue elements cannot overlay on top of WCV content. The search bar header is styled separately from the container to remain visible above the WCV.

## Search Window (`search-window.ts`)

### Design
`SearchWindow` is a **zero-state** mechanical shell. It has no `_state` field tracking "mode" — only a `_visible` flag for operation idempotency.

```typescript
show()    // 纯机械: opacity 0 → show() → focus() → setImmediate(applyBounds + opacity 1)
hide()    // 纯机械: opacity 0 → setPosition(-9999, -9999)
sendSignal(type, payload?)  // 唯一信号出口 → IPC.APP_EVENT
signalShow(autoActivate?)   // 快捷方式: checkAutoActivate() + sendSignal('shortcut-pressed')
checkAutoActivate()          // show() 前检测 (active-win)
```

### Blur handler
```typescript
this.win.on('blur', () => {
  this.sendSignal('window-blurred')  // 只转发, 不决策
})
```

### Facade (`window-manager.ts`)
所有模块通过 `window-manager` 访问 SearchWindow，**绝不直接 import searchWindow**（`webViewManager` 作为紧耦合内部协作者除外）。

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

### Decision in renderer `selectResult()`
```
shouldClose: boolean = hadWebView ? webViewHadData : true
```
Render 端自行追踪 hadWebView/webViewHadData（通过临时 onAppEvent 监听），无需 main 告知。

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
- On shortcut press, `activeWin.sync()` captures foreground window BEFORE `show()`/`focus()`.
- Each plugin's `shouldAutoActivate?(appInfo): boolean` checked; first match bundled into `shortcut-pressed` signal's `autoActivate` field.
- Renderer `handleSignal` uses `autoActivate` to enter `subcommand` directly instead of `home`.

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
- Default size: 800×400 (configurable `windowWidth`); WebView mode expands to 800×(64+height)
- Container (Vue): 648px wide, x=16 margin each side
- `BOTTOM_SHADOW_SPACE=16`: WCV reduced by 16px so container box-shadow renders in the gap
- Global shortcut: `Alt+Space` (configurable in `~/.futari/config.json`)

### Off-screen hide pattern (CRITICAL — DO NOT CHANGE)
**Why**: The main window is `alwaysOnTop: true, 'screen-saver'` + `transparent: true` = `WS_EX_LAYERED`. Even with `setOpacity(0)` + `setIgnoreMouseEvents(true)`, its HWND remains in the DWM Z-order. DWM composites through this layered window for every mouse hit-test on sibling windows in the same process (Form dialog, DevTools), causing cursor flicker and drag jitter.

**Solution**: NEVER call `win.hide()` (causes Windows show/hide animation flash). Instead:
```
hideWindow(): setOpacity(0) → setPosition(-9999, -9999)
showWindow(): setOpacity(0) → show() → focus() → setImmediate(applyBounds + setOpacity(1))
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
- Key trace points: dispatch state transitions, selectResult lifecycle, handleSignal entry, openWebView/config, dom-ready timing, IPC EXECUTE flow
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
