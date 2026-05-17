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
    if (!mainWin) { console.log('[WV] open: no mainWin'); return }

    if (this.view) { console.log('[WV] open: closing existing view'); this.close() }

    console.log('[WV] open: creating WebContentsView...')
    this.view = getWebView(config)
    this.view.setBackgroundColor('#00000000')

    mainWin.contentView.addChildView(this.view)
    console.log('[WV] open: added to contentView')

    const winWidth = mainWin.getBounds().width
    this.view.setBounds({ x: 0, y: SEARCH_HEIGHT, width: winWidth, height: 1 })

    if (config.html) {
      const b64 = Buffer.from(config.html, 'utf-8').toString('base64')
      const dataUrl = `data:text/html;charset=utf-8;base64,${b64}`
      console.log('[WV] open: loading HTML, length=%d', config.html.length)
      this.view.webContents.loadURL(dataUrl)
    } else if (config.url) {
      console.log('[WV] open: loading URL:', config.url)
      this.view.webContents.loadURL(config.url)
    }

    this.view.webContents.on('did-finish-load', () => {
      console.log('[WV] did-finish-load')
    })

    this.view.webContents.on('did-fail-load', (_e, code, desc) => {
      console.log('[WV] did-fail-load: %d %s', code, desc)
    })

    this.view.webContents.on('dom-ready', () => {
      console.log('[WV] dom-ready, expanding to height=%d', config.height || 450)
      const height = config.height || 450
      this.setExpandedHeight(height)
      mainWin.webContents.send('web-view-ready')
    })

    console.log('[WV] open: sending show-web-view to renderer')
    mainWin.webContents.send('show-web-view', { height: config.height || 450 })
    console.log('[WV] open: done, isActive=%s', this.isActive)
  }

  close(): void {
    const mainWin = getMainWindow()
    if (!mainWin) { console.log('[WV] close: no mainWin'); return }

    if (this.view) {
      console.log('[WV] close: removing childView')
      try { mainWin.contentView.removeChildView(this.view) } catch { /* ignore */ }
      this.view = null
    } else {
      console.log('[WV] close: no view to close')
    }

    cleanupTempPreload()

    this.restoreWindowSize()
    console.log('[WV] close: sending hide-web-view')

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

  get isActive(): boolean {
    return this.view !== null
  }
}

export const webViewManager = new WebViewManager()
