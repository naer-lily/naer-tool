import { app, BrowserWindow, screen } from 'electron'
import { join } from 'path'
import activeWin from 'active-win'
import { pluginHost } from '@main/plugin-host'
import { logger } from '@main/logger'
import type { AppInfo } from '@shared/plugin-api'

const WIN_WIDTH = 680
const WIN_HEIGHT = 400
const OFFSCREEN_X = -9999
const OFFSCREEN_Y = -9999

let mainWindow: BrowserWindow | null = null
let isActive = false

export function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: WIN_WIDTH,
    height: WIN_HEIGHT,
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

  mainWindow.setAlwaysOnTop(true, 'screen-saver')
  centerAtTop()

  mainWindow.on('blur', () => {
    hideWindow()
  })

  mainWindow.on('ready-to-show', () => {
    showWindow()
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function centerAtTop(): void {
  if (!mainWindow) return
  const bounds = screen.getPrimaryDisplay().workArea
  const x = Math.round(bounds.x + (bounds.width - WIN_WIDTH) / 2)
  const y = Math.round(bounds.y + bounds.height * 0.12)
  mainWindow.setPosition(x, y)
}

export function showWindow(): void {
  if (!mainWindow) return
  logger.trace('[WM] showWindow called isActive=%s', isActive)
  isActive = true
  centerAtTop()

  const activated = checkAutoActivate()
  if (activated) {
    logger.trace('[WM] auto-activate plugin=%s', activated.pluginId)
    mainWindow.webContents.send('auto-activate', activated.pluginId, activated.icon)
  }

  mainWindow.setOpacity(0)
  mainWindow.setIgnoreMouseEvents(false)
  mainWindow.show()
  mainWindow.focus()

  if (!activated) {
    mainWindow.webContents.send('focus-input')
  }

  setImmediate(() => {
    mainWindow?.setOpacity(1)
  })
}

export function hideWindow(): void {
  if (!mainWindow) return
  isActive = false
  mainWindow.setOpacity(0)
  mainWindow.setIgnoreMouseEvents(true, { forward: true })
  mainWindow.setPosition(OFFSCREEN_X, OFFSCREEN_Y)
}

export function toggleWindow(): void {
  if (!mainWindow) return
  if (isActive) {
    hideWindow()
  } else {
    showWindow()
  }
}

function checkAutoActivate(): { pluginId: string; icon?: string } | null {
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

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}
