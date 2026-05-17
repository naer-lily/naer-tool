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
const WIN_WIDTH = 680
const CONTAINER_WIDTH = 648
const CONTAINER_X = Math.round((WIN_WIDTH - CONTAINER_WIDTH) / 2)
const SEARCH_HEIGHT = 64

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

    if (this.view) this.close()

    this.view = getWebView(config)
    this.view.setBackgroundColor('#00000000')

    mainWin.contentView.addChildView(this.view)

    this.view.setBounds({ x: CONTAINER_X, y: SEARCH_HEIGHT, width: CONTAINER_WIDTH, height: 1 })

    if (config.html) {
      const b64 = Buffer.from(config.html, 'utf-8').toString('base64')
      const dataUrl = `data:text/html;charset=utf-8;base64,${b64}`
      this.view.webContents.loadURL(dataUrl)
    } else if (config.url) {
      this.view.webContents.loadURL(config.url)
    }

    this.view.webContents.on('dom-ready', () => {
      const height = config.height || 450
      this.setExpandedHeight(height)
      mainWin.webContents.send('web-view-ready')
      mainWin.focus()
      mainWin.webContents.focus()
    })

    mainWin.webContents.send('show-web-view', { height: config.height || 450 })
    mainWin.focus()
    mainWin.webContents.focus()
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

    mainWin.setResizable(true)
    mainWin.setSize(WIN_WIDTH, totalHeight)
    mainWin.setResizable(false)

    if (this.view) {
      this.view.setBounds({ x: CONTAINER_X, y: SEARCH_HEIGHT, width: CONTAINER_WIDTH, height })
    }
  }

  restoreWindowSize(): void {
    const mainWin = getMainWindow()
    if (!mainWin) return

    mainWin.setResizable(true)
    mainWin.setSize(WIN_WIDTH, 400)
    mainWin.setResizable(false)
  }

  get isActive(): boolean {
    return this.view !== null
  }
}

export const webViewManager = new WebViewManager()
