import { WebContentsView } from 'electron'
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { windowStateMachine } from '@main/window-state-machine'
import { logger } from '@main/logger'
import type { WebViewConfig } from '@shared/web-view-api'

const RESOURCES_DIR = join(__dirname, '..', '..', 'resources')
const BUILTIN_PRELOAD = join(RESOURCES_DIR, 'web-view-preload.js')
const WIN_WIDTH = 680
const CONTAINER_WIDTH = 648
const CONTAINER_X = Math.round((WIN_WIDTH - CONTAINER_WIDTH) / 2)
const SEARCH_HEIGHT = 64
const BOTTOM_SHADOW_SPACE = 16

const BASE_CSS = `
*,*::before,*::after{box-sizing:border-box}
html{scroll-behavior:smooth;-webkit-font-smoothing:antialiased}
body{margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;line-height:1.6;background:transparent}
::-webkit-scrollbar{width:6px;height:6px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:rgba(128,128,128,.3);border-radius:3px}
::-webkit-scrollbar-thumb:hover{background:rgba(128,128,128,.5)}
`.trim()

let tempPreloadPath: string | null = null

function buildPreload(config: WebViewConfig): string {
  if (!existsSync(BUILTIN_PRELOAD)) {
    throw new Error(`Builtin preload not found: ${BUILTIN_PRELOAD}`)
  }
  let code = readFileSync(BUILTIN_PRELOAD, 'utf-8')
  if (config.preload) {
    if (!existsSync(config.preload)) {
      throw new Error(`Preload not found: ${config.preload}`)
    }
    code += `\nrequire('${config.preload.replace(/\\/g, '/')}');\n`
  }
  return code
}

function writeTempPreload(code: string): string {
  const dir = join(tmpdir(), 'futari-web-preloads')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  const p = join(dir, `preload-${Date.now()}.js`)
  writeFileSync(p, code, 'utf-8')
  return p
}

function cleanupTempPreload(): void {
  if (tempPreloadPath) {
    try { unlinkSync(tempPreloadPath) } catch { /* ignore */ }
    tempPreloadPath = null
  }
}

function getWebView(config: WebViewConfig): WebContentsView {
  cleanupTempPreload()
  const preloadCode = buildPreload(config)
  tempPreloadPath = writeTempPreload(preloadCode)

  return new WebContentsView({
    webPreferences: {
      preload: tempPreloadPath,
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
      allowRunningInsecureContent: true
    }
  })
}

class WebViewManager {
  view: WebContentsView | null = null
  private closeResolver: ((data: unknown) => void) | null = null
  private closePromise: Promise<unknown> | null = null
  private lastMessage: unknown = undefined

  async open(config: WebViewConfig): Promise<unknown> {
    const mainWin = windowStateMachine.browserWindow
    if (!mainWin) {
      logger.warn('[WVM] open: no main window')
      return Promise.resolve(undefined)
    }

    logger.trace('[WVM] open called htmlPath=%s htmlLen=%d preload=%s height=%d injectCSS=%s',
      config.htmlPath || null,
      config.html ? config.html.length : 0,
      config.preload || null,
      config.height || 450,
      String(config.injectBaseStyles || false))

    if (this.view) this.close()

    windowStateMachine.beginWebView()
    this.view = getWebView(config)
    this.view.setBackgroundColor('#00000000')

    mainWin.contentView.addChildView(this.view)
    // 初始高度 1px — 此时页面尚未加载，窗口也还未扩展。
    // ⚠️ 注意: 1px 视口会导致页面 JS 中的 focus()/select() 触发浏览器的
    //    scroll-into-view 行为，污染滚动位置（后续 expand 后无法自动恢复）。
    //    因此 WebView 页面应避免在 load 阶段调用 focus()。
    this.view.setBounds({ x: CONTAINER_X, y: SEARCH_HEIGHT, width: CONTAINER_WIDTH, height: 1 })

    if (config.html) {
      const b64 = Buffer.from(config.html, 'utf-8').toString('base64')
      const dataUrl = `data:text/html;charset=utf-8;base64,${b64}`
      void this.view.webContents.loadURL(dataUrl)
      logger.trace('[WVM] loadURL data URI len=%d', b64.length)
    } else if (config.htmlPath) {
      const fileUrl = `file:///${config.htmlPath.replace(/\\/g, '/')}`
      void this.view.webContents.loadURL(fileUrl)
      logger.trace('[WVM] loadURL file=%s', fileUrl)
    } else if (config.url) {
      void this.view.webContents.loadURL(config.url)
      logger.trace('[WVM] loadURL url=%s', config.url)
    }

    this.lastMessage = undefined
    this.closePromise = new Promise((resolve) => {
      this.closeResolver = resolve
    })
    logger.trace('[WVM] closePromise created')

    this.view.webContents.on('dom-ready', () => {
      logger.trace('[WVM] dom-ready fired')
      if (config.injectBaseStyles) {
        this.view!.webContents.insertCSS(BASE_CSS).catch((e: Error) => logger.warn('[WVM] insertCSS failed:', e.message))
      }
      const height = config.height || 450

      windowStateMachine.webViewReady(height)

      if (this.view) {
        this.view.setBounds({
          x: CONTAINER_X,
          y: SEARCH_HEIGHT,
          width: CONTAINER_WIDTH,
          height: height - BOTTOM_SHADOW_SPACE
        })
      }

      const wc = windowStateMachine.webContents
      wc?.send('show-web-view', { height, icon: config.pluginIcon || null })
      wc?.send('web-view-ready')
      logger.trace('[WVM] sent show-web-view(%d) icon=%s + web-view-ready', height, config.pluginIcon || null)

      mainWin.focus()
      mainWin.webContents.focus()
    })

    logger.trace('[WVM] returning closePromise')
    return this.closePromise
  }

  close(webViewData?: unknown): void {
    logger.trace('[WVM] close called data=%o', webViewData)

    windowStateMachine.endWebView()
    const mainWin = windowStateMachine.browserWindow
    const resolveData = webViewData !== undefined ? webViewData : this.lastMessage

    if (this.view) {
      try { mainWin?.contentView.removeChildView(this.view) } catch { /* ignore */ }
      this.view = null
    }

    cleanupTempPreload()

    logger.trace('[WVM] resolving closePromise with data=%o hasResolver=%s', resolveData, !!this.closeResolver)
    if (this.closeResolver) {
      this.closeResolver(resolveData)
      this.closeResolver = null
      this.closePromise = null
    }

    windowStateMachine.webContents?.send('hide-web-view')
  }

  sendInput(text: string): void {
    this.view?.webContents.send('sub-input-change', { text })
  }

  handleResize(height: number): void {
    windowStateMachine.resizeExpanded(SEARCH_HEIGHT + height)
    if (this.view) {
      this.view.setBounds({
        x: CONTAINER_X,
        y: SEARCH_HEIGHT,
        width: CONTAINER_WIDTH,
        height: height - BOTTOM_SHADOW_SPACE
      })
    }
  }

  handleMessage(data: unknown): void {
    this.lastMessage = data
    windowStateMachine.webContents?.send('web-view-message', data)
  }

  get isActive(): boolean {
    return this.view !== null
  }
}

export const webViewManager = new WebViewManager()
