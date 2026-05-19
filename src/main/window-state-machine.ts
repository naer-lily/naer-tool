import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import activeWin from 'active-win'
import { pluginHost } from '@main/plugin-host'
import { configManager } from '@main/config'
import { logger } from '@main/logger'
import type { AppInfo } from '@shared/plugin-api'

const BASE_WIN_WIDTH = 680
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
    return Math.round(BASE_WIN_WIDTH * this._scale)
  }

  get scaledWinHeight(): number {
    return Math.round(BASE_WIN_HEIGHT * this._scale)
  }

  get scaledSearchHeight(): number {
    return Math.round(BASE_SEARCH_HEIGHT * this._scale)
  }

  // ═══════════════════════════════════════
  // 初始化
  // ═══════════════════════════════════════

  create(): void {
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
      center: true,
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
    this._state = 'shown'
    this.centerAtTop()

    const activated = this.checkAutoActivate()
    if (activated) {
      logger.trace('[WSM] auto-activate plugin=%s', activated.pluginId)
      this.win.webContents.send('auto-activate', activated.pluginId, activated.icon)
    }

    this.win.setOpacity(0)
    this.win.setIgnoreMouseEvents(false)
    this.win.show()
    this.win.focus()

    if (!activated) {
      this.win.webContents.send('focus-input')
    }

    setImmediate(() => {
      this.win?.setOpacity(1)
    })
  }

  hide(reason?: string): void {
    if (!this.win || this._state === 'idle') return

    logger.trace('[WSM] hide state=%s reason=%s', this._state, reason || '?')
    this._state = 'idle'
    this.expandedHeight = 0
    this.win.setOpacity(0)
    this.win.setIgnoreMouseEvents(true, { forward: true })
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
    if (this._state !== 'shown') return
    logger.trace('[WSM] beginWebView → setup')
    this._state = 'setup'
  }

  webViewReady(height: number): void {
    if (this._state !== 'setup') return

    logger.trace('[WSM] webViewReady → expanded height=%d', height)
    this._state = 'expanded'
    this.expandedHeight = height

    if (this.win) {
      const totalHeight = Math.round((BASE_SEARCH_HEIGHT + height) * this._scale)
      this.win.setResizable(true)
      this.win.setSize(this.scaledWinWidth, totalHeight)
      this.win.setResizable(false)
    }
  }

  endWebView(): void {
    if (this._state !== 'expanded') return

    logger.trace('[WSM] endWebView → shown')
    this._state = 'shown'
    this.expandedHeight = 0

    if (this.win) {
      this.win.setResizable(true)
      this.win.setSize(this.scaledWinWidth, this.scaledWinHeight)
      this.win.setResizable(false)
    }
  }

  resizeExpanded(totalHeight: number): void {
    if (!this.win || this._state !== 'expanded') return
    this.expandedHeight = Math.round(totalHeight / this._scale) - BASE_SEARCH_HEIGHT
    this.win.setResizable(true)
    this.win.setSize(this.scaledWinWidth, totalHeight)
    this.win.setResizable(false)
  }

  applyScale(newScale: number): void {
    const clamped = Math.max(0.5, Math.min(2.0, newScale))
    if (this._scale === clamped) return

    logger.trace('[WSM] applyScale %.2f → %.2f', this._scale, clamped)
    this._scale = clamped

    if (!this.win) return

    this.win.webContents.setZoomFactor(this._scale)

    const w = this.scaledWinWidth
    if (this._state === 'expanded') {
      const totalHeight = Math.round((BASE_SEARCH_HEIGHT + this.expandedHeight) * this._scale)
      this.win.setResizable(true)
      this.win.setSize(w, totalHeight)
      this.win.setResizable(false)
    } else {
      this.win.setResizable(true)
      this.win.setSize(w, this.scaledWinHeight)
      this.win.setResizable(false)
    }
  }

  // ═══════════════════════════════════════
  // 内部
  // ═══════════════════════════════════════

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
