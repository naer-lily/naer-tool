import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import activeWin from 'active-win'
import { pluginHost } from '@main/plugin-host'
import { configManager } from '@main/config'
import { logger } from '@main/logger'
import type { AppInfo } from '@shared/plugin-api'

const BASE_WIN_HEIGHT = 400
const BASE_SEARCH_HEIGHT = 64
const OFFSCREEN_X = -9999
const OFFSCREEN_Y = -9999

export type WindowState = 'idle' | 'shown' | 'setup' | 'expanded'

class WindowStateMachine {
  private win: BrowserWindow | null = null
  private _state: WindowState = 'idle'
  private expandedHeight = 0
  private _scale = 1.0
  private _windowTopRatio = 0.12
  private _baseWinWidth = 800

  get state(): WindowState {
    return this._state
  }

  get isVisible(): boolean {
    return this._state !== 'idle'
  }

  get webContents() {
    return this.win?.webContents
  }

  get browserWindow(): BrowserWindow | null {
    return this.win
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
  // 初始化
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

    this.win.on('blur', () => this.handleBlur())
    this.win.on('ready-to-show', () => this.handleReadyToShow())

    if (process.env['ELECTRON_RENDERER_URL']) {
      void this.win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      void this.win.loadFile(join(__dirname, '../renderer/index.html'))
    }
  }

  // ═══════════════════════════════════════
  // 公开操作
  // ═══════════════════════════════════════

  show(): void {
    if (!this.win || this._state !== 'idle') return

    logger.trace('[WSM] show')
    this._state = this.expandedHeight > 0 ? 'expanded' : 'shown'

    const activated = this.checkAutoActivate()

    this.win.setOpacity(0)
    this.win.show()
    this.win.focus()

    if (activated) {
      logger.trace('[WSM] auto-activate plugin=%s', activated.pluginId)
      this.win.webContents.send('auto-activate', activated.pluginId, activated.icon)
    } else {
      this.win.webContents.send('focus-input')
    }

    setImmediate(() => {
      this.applyBounds()
      this.win?.setOpacity(1)
    })
  }

  hide(reason?: string): void {
    if (!this.win || this._state === 'idle') return

    logger.trace('[WSM] hide state=%s reason=%s', this._state, reason || '?')
    this._state = 'idle'
    this.win.setOpacity(0)
    this.win.setPosition(OFFSCREEN_X, OFFSCREEN_Y)
  }

  toggle(): void {
    if (this._state === 'idle') {
      this.show()
    } else {
      this.hide('toggle')
    }
  }

  beginWebView(): void {
    if (this._state !== 'shown' && this._state !== 'expanded') return
    logger.trace('[WSM] beginWebView → setup')
    this._state = 'setup'
  }

  webViewReady(height: number): void {
    if (this._state !== 'setup') return

    logger.trace('[WSM] webViewReady → expanded height=%d', height)
    this._state = 'expanded'
    this.expandedHeight = height

    const w = this.scaledWinWidth
    const h = Math.round((BASE_SEARCH_HEIGHT + height) * this._scale)
    this.setWindowSize(w, h)
  }

  endWebView(): void {
    if (this._state !== 'expanded') return

    logger.trace('[WSM] endWebView → shown')
    this._state = 'shown'
    this.expandedHeight = 0
  }

  adjustHeight(rendererHeight: number): void {
    if (this._state !== 'shown') return
    if (!this.win) return
    const scaled = Math.round(rendererHeight * this._scale)
    const b = this.win.getBounds()
    this.win.setBounds({ x: b.x, y: b.y, width: b.width, height: scaled })
  }

  resizeExpanded(totalHeight: number): void {
    if (!this.win || this._state !== 'expanded') return
    this.expandedHeight = Math.round(totalHeight / this._scale) - BASE_SEARCH_HEIGHT
    this.setWindowSize(this.scaledWinWidth, totalHeight)
  }

  applyScale(newScale: number): void {
    const clamped = Math.max(0.5, Math.min(2.0, newScale))
    if (this._scale === clamped) return

    logger.trace('[WSM] applyScale %.2f → %.2f', this._scale, clamped)
    this._scale = clamped

    if (!this.win) return

    this.win.webContents.setZoomFactor(this._scale)

    const w = this.scaledWinWidth
    const h = this._state === 'expanded'
      ? Math.round((BASE_SEARCH_HEIGHT + this.expandedHeight) * this._scale)
      : this.scaledWinHeight
    this.setWindowSize(w, h)
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

    if (this._state === 'expanded') {
      const h = Math.round((BASE_SEARCH_HEIGHT + this.expandedHeight) * this._scale)
      this.win.setBounds({ x, y, width: w, height: h })
    } else {
      const b = this.win.getBounds()
      this.win.setBounds({ x, y, width: w, height: b.height })
    }
  }

  private setWindowSize(w: number, h: number): void {
    if (!this.win) return
    const b = this.win.getBounds()
    this.win.setBounds({ x: b.x, y: b.y, width: w, height: h })
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

  private handleBlur(): void {
    if (this._state === 'shown' || this._state === 'expanded') {
      this.hide('blur')
    } else {
      logger.trace('[WSM] blur ignored state=%s', this._state)
    }
  }

  private handleReadyToShow(): void {
    if (this._state === 'idle') {
      this.hide('ready-to-show')
    } else {
      logger.trace('[WSM] ready-to-show ignored state=%s', this._state)
    }
  }

  private checkAutoActivate(): { pluginId: string; icon?: string } | null {
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
}

export const windowStateMachine = new WindowStateMachine()
