import { app, BrowserWindow, globalShortcut, ipcMain, screen } from 'electron'
import { join } from 'path'
import { IPC } from '../shared/ipc-channels'
import { searchEngine } from './search-engine'
import { pluginHost } from './plugin-host'
import { prefixRegistry } from './prefix-registry'
import helloPlugin from './plugins/hello'

const WIN_WIDTH = 680
const WIN_HEIGHT = 400

let mainWindow: BrowserWindow | null = null
let toastWindow: BrowserWindow | null = null
let isActive = false

function createToastWindow(): void {
  toastWindow = new BrowserWindow({
    width: 360,
    height: 40,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    show: false,
    resizable: false,
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      sandbox: false
    }
  })
  toastWindow.setIgnoreMouseEvents(true, { forward: true })
}

function showScreenToast(message: string): void {
  if (!toastWindow) return
  const bounds = screen.getPrimaryDisplay().workArea
  const x = Math.round(bounds.x + (bounds.width - 360) / 2)
  const y = Math.round(bounds.y + bounds.height - 80)
  toastWindow.setPosition(x, y)

  toastWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(
    `<html><body style="margin:0;display:flex;justify-content:center;align-items:center;height:100vh;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif;background:transparent;overflow:hidden;">
      <div style="background:rgba(32,32,32,0.88);color:#e8e8e8;font-size:13px;padding:8px 20px;border-radius:8px;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.08);box-shadow:0 4px 16px rgba(0,0,0,0.3);white-space:nowrap;">${message.replace(/</g,'&lt;')}</div>
    </html></body>`
  )}`)

  toastWindow.show()
  setTimeout(() => {
    toastWindow?.hide()
  }, 2000)
}

function registerBuiltinPlugins(): void {
  pluginHost.registerBuiltin(helloPlugin, 'hello')
  helloPlugin.onActivate({})
  prefixRegistry.rebuild()
}

function createWindow(): void {
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

function showWindow(): void {
  if (!mainWindow) return
  isActive = true
  centerAtTop()
  mainWindow.setOpacity(0)
  mainWindow.show()
  mainWindow.setIgnoreMouseEvents(false)
  mainWindow.focus()
  mainWindow.webContents.send('focus-input')
  setImmediate(() => {
    mainWindow?.setOpacity(1)
  })
}

function hideWindow(): void {
  if (!mainWindow) return
  isActive = false
  mainWindow.setOpacity(0)
  mainWindow.setIgnoreMouseEvents(true, { forward: true })
}

function toggleWindow(): void {
  if (!mainWindow) return
  if (isActive) {
    hideWindow()
  } else {
    showWindow()
  }
}

function registerShortcuts(): void {
  globalShortcut.register('Alt+Space', () => {
    toggleWindow()
  })
}

function registerIpc(): void {
  ipcMain.handle(IPC.SEARCH, async (_event, payload: { text: string; pluginId?: string }) => {
    if (payload.pluginId) {
      return {
        mode: 'subcommand',
        pluginId: payload.pluginId,
        results: await searchEngine.searchSubcommand(payload.pluginId, payload.text)
      }
    }
    return searchEngine.search(payload.text)
  })

  ipcMain.handle(IPC.EXECUTE, async (_event, payload: { pluginId: string; commandId: string; input: string }) => {
    const result = await searchEngine.execute(payload.pluginId, payload.commandId, payload.input)
    if (result && typeof result === 'object' && 'type' in result) {
      const r = result as { type: string; message?: string }
      if (r.type === 'toast' && r.message) {
        showScreenToast(r.message)
      }
    }
    return result
  })

  ipcMain.on(IPC.CLOSE, () => {
    hideWindow()
  })
}

app.whenReady().then(() => {
  registerBuiltinPlugins()
  createToastWindow()
  createWindow()
  registerShortcuts()
  registerIpc()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  toastWindow?.close()
})
