import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import activeWin from 'active-win'
import { pluginHost } from '@main/plugin-host'
import { configManager } from '@main/config'
import { logger } from '@main/logger'
import type { AppSignalPayload, AppSignalAutoActivate } from '@shared/ipc-channels'
import { IPC } from '@shared/ipc-channels'
import type { AppInfo } from '@shared/plugin-api'

const BASE_WIN_HEIGHT = 400
const BASE_SEARCH_HEIGHT = 64
const OFFSCREEN_X = -9999
const OFFSCREEN_Y = -9999

class SearchWindow {
  private win: BrowserWindow | null = null
  private _visible = false
  private _scale = 1.0
  private _windowTopRatio = 0.12
  private _baseWinWidth = 800

  // ═══════════════════════════════════════
  // 创建
  // ═══════════════════════════════════════

  create(): void {
    this._baseWinWidth = configManager.getWindowWidth()
    this._scale = configManager.getScale()
    this._windowTopRatio = configManager.getWindowTopRatio()

    this.win = new BrowserWindow({
      width: this.scaledWinWidth,
      height: this.scaledWinHeight,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      show: false,
      resizable: false,
      skipTaskbar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    this.win.setAlwaysOnTop(true, 'screen-saver')
    this.centerAtTop()

    this.win.webContents.on('did-finish-load', () => {
      this.win?.webContents.setZoomFactor(this._scale)
    })

    this.win.on('blur', () => {
      logger.trace('[SW] blur event visible=%s', this._visible)
      this.sendSignal('window-blurred')
    })

    this.win.setPosition(OFFSCREEN_X, OFFSCREEN_Y)

    if (process.env['ELECTRON_RENDERER_URL']) {
      void this.win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      void this.win.loadFile(join(__dirname, '../renderer/index.html'))
    }
  }

  // ═══════════════════════════════════════
  // 机械操作 (纯执行，不决策)
  // ═══════════════════════════════════════

  show(): void {
    logger.trace('[SW] show called visible=%s hasWin=%s', this._visible, !!this.win)
    if (!this.win || this._visible) return

    logger.trace('[SW] show executing')
    this._visible = true

    this.win.setOpacity(0)
    this.win.show()
    this.win.focus()

    setImmediate(() => {
      this.applyBounds()
      this.win?.setOpacity(1)
      logger.trace('[SW] show complete bounds applied')
    })
  }

  hide(): void {
    logger.trace('[SW] hide called visible=%s hasWin=%s', this._visible, !!this.win)
    if (!this.win || !this._visible) return

    logger.trace('[SW] hide executing')
    this._visible = false

    this.win.setOpacity(0)
    this.win.setPosition(OFFSCREEN_X, OFFSCREEN_Y)
  }

  // ═══════════════════════════════════════
  // 信号 (Main → Renderer 唯一出口)
  // ═══════════════════════════════════════

  sendSignal(type: AppSignalPayload['type'], extra?: Partial<AppSignalPayload>): void {
    if (!this.win) return
    const payload: AppSignalPayload = { type, ...extra }
    logger.trace('[SW] sendSignal %s %o', type, extra)
    this.win.webContents.send(IPC.APP_EVENT, payload)
  }

  signalShow(autoActivate?: AppSignalAutoActivate): void {
    this.sendSignal('shortcut-pressed', autoActivate ? { autoActivate } : {})
  }

  // ═══════════════════════════════════════
  // 布局 getter
  // ═══════════════════════════════════════

  get browserWindow(): BrowserWindow | null {
    return this.win
  }

  get webContents() {
    return this.win?.webContents
  }

  get scale(): number {
    return this._scale
  }

  get scaledWinWidth(): number {
    return Math.round(this._baseWinWidth * this._scale)
  }

  get scaledWinHeight(): number {
    return Math.round(BASE_WIN_HEIGHT * this._scale)
  }

  get scaledSearchHeight(): number {
    return Math.round(BASE_SEARCH_HEIGHT * this._scale)
  }

  get scaledContainerWidth(): number {
    return this.scaledWinWidth - Math.round(32 * this._scale)
  }

  get scaledContainerX(): number {
    return Math.round(16 * this._scale)
  }

  // ═══════════════════════════════════════
  // 窗口尺寸操作
  // ═══════════════════════════════════════

  setWindowHeight(rendererHeight: number): void {
    if (!this.win) return
    const scaled = Math.round(rendererHeight * this._scale)
    const b = this.win.getBounds()
    this.win.setBounds({ x: b.x, y: b.y, width: b.width, height: scaled })
  }

  resetWindowHeight(): void {
    this.setWindowSize(this.scaledWinWidth, this.scaledWinHeight)
  }

  setWindowSize(w: number, h: number): void {
    if (!this.win) return
    const b = this.win.getBounds()
    this.win.setBounds({ x: b.x, y: b.y, width: w, height: h })
  }

  applyScale(newScale: number): void {
    const clamped = Math.max(0.5, Math.min(2.0, newScale))
    if (this._scale === clamped) return

    logger.trace('[SW] applyScale %.2f -> %.2f', this._scale, clamped)
    this._scale = clamped

    if (!this.win) return

    this.win.webContents.setZoomFactor(this._scale)
    this.setWindowSize(this.scaledWinWidth, this.scaledWinHeight)
  }

  // ═══════════════════════════════════════
  // Auto-activate (show 前检测)
  // ═══════════════════════════════════════

  checkAutoActivate(): AppSignalAutoActivate | null {
    try {
      const win = activeWin.sync()
      if (!win) return null
      const appInfo: AppInfo = {
        name: win.owner.name,
        path: win.owner.path,
        pid: win.owner.processId
      }
      for (const plugin of pluginHost.getAll()) {
        if (plugin.shouldAutoActivate?.(appInfo)) {
          return { pluginId: plugin.id, icon: plugin.icon }
        }
      }
    } catch {
      // ignore
    }
    return null
  }

  // ═══════════════════════════════════════
  // 内部
  // ═══════════════════════════════════════

  private applyBounds(): void {
    if (!this.win) return
    const w = this.scaledWinWidth
    const cursor = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(cursor).workArea
    const x = Math.round(display.x + (display.width - w) / 2)
    const y = Math.round(display.y + display.height * this._windowTopRatio)
    const b = this.win.getBounds()
    this.win.setBounds({ x, y, width: w, height: b.height })
  }

  private centerAtTop(): void {
    if (!this.win) return
    const cursor = screen.getCursorScreenPoint()
    const bounds = screen.getDisplayNearestPoint(cursor).workArea
    const w = this.scaledWinWidth
    const x = Math.round(bounds.x + (bounds.width - w) / 2)
    const y = Math.round(bounds.y + bounds.height * this._windowTopRatio)
    this.win.setPosition(x, y)
  }
}

export const searchWindow = new SearchWindow()
