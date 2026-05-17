import { WebContentsView, app } from 'electron'
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { getMainWindow } from '@main/window-manager'
import type { WebViewConfig } from '@shared/web-view-api'

const RESOURCES_DIR = app.isPackaged
  ? join(__dirname, '..', 'resources')
  : join(__dirname, '..', '..', 'resources')
const BUILTIN_PRELOAD = join(RESOURCES_DIR, 'web-view-preload.js')
const SEARCH_HEIGHT = 58

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
    code += '\n' + readFileSync(config.preload, 'utf-8')
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

  open(config: WebViewConfig): void {
    const mainWin = getMainWindow()
    if (!mainWin) return

    this.close()

    this.view = getWebView(config)
    this.view.setBackgroundColor('#00000000')

    mainWin.contentView.addChildView(this.view)

    const winWidth = mainWin.getBounds().width
    this.view.setBounds({ x: 0, y: SEARCH_HEIGHT, width: winWidth, height: 1 })

    if (config.html) {
      const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(config.html)}`
      this.view.webContents.loadURL(dataUrl)
    } else if (config.url) {
      this.view.webContents.loadURL(config.url)
    }

    this.view.webContents.on('dom-ready', () => {
      const height = config.height || 450
      this.setExpandedHeight(height)
      mainWin.webContents.send('web-view-ready')
    })

    mainWin.webContents.send('show-web-view', { height: config.height || 450 })
  }

  close(): void {
    const mainWin = getMainWindow()
    if (!mainWin) return

    if (this.view) {
      try { mainWin.contentView.removeChildView(this.view) } catch { /* ignore */ }
      this.view = null
    }

    cleanupTempPreload()

    this.restoreWindowSize()

    mainWin.webContents.send('hide-web-view')
  }

  sendInput(text: string): void {
    this.view?.webContents.send('sub-input-change', { text })
  }

  handleResize(height: number): void {
    this.setExpandedHeight(height)
  }

  handleMessage(data: unknown): void {
    const mainWin = getMainWindow()
    mainWin?.webContents.send('web-view-message', data)
  }

  setExpandedHeight(height: number): void {
    const mainWin = getMainWindow()
    if (!mainWin) return

    const totalHeight = SEARCH_HEIGHT + height
    const winWidth = mainWin.getBounds().width

    mainWin.setResizable(true)
    mainWin.setSize(winWidth, totalHeight)
    mainWin.setResizable(false)

    if (this.view) {
      this.view.setBounds({ x: 0, y: SEARCH_HEIGHT, width: winWidth, height })
    }
  }

  restoreWindowSize(): void {
    const mainWin = getMainWindow()
    if (!mainWin) return

    const winWidth = mainWin.getBounds().width
    mainWin.setResizable(true)
    mainWin.setSize(winWidth, 400)
    mainWin.setResizable(false)
  }
}

export const webViewManager = new WebViewManager()
