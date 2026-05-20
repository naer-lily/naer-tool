import { app, BrowserWindow, globalShortcut } from 'electron'
import { createWindow, signalShow, checkAutoActivate, sendSignal } from '@main/window-manager'
import { createToastWindow, destroyToastWindow, showScreenToast } from '@main/toast'
import { createTray, destroyTray, setUpdateAvailable } from '@main/tray'
import { registerIpc } from '@main/ipc-handlers'
import { pluginHost } from '@main/plugin-host'
import { prefixRegistry } from '@main/prefix-registry'
import { configManager } from '@main/config'
import { logger } from '@main/logger'
import { autoUpdater } from '@main/auto-updater'
import { companionManager } from '@main/companion-manager'
import calculatorPlugin from '@main/plugins/builtins/calculator'
import runPlugin from '@main/plugins/builtins/run'
import pluginCreator from '@main/plugins/builtins/plugin-creator'
import settingsPlugin from '@main/plugins/builtins/settings'
import ctoolPlugin from '@main/plugins/builtins/ctool'

async function registerBuiltinPlugins(): Promise<void> {
  await pluginHost.activateBuiltin(calculatorPlugin, 'calculator')
  await pluginHost.activateBuiltin(runPlugin, 'run')
  await pluginHost.activateBuiltin(pluginCreator, 'plugin-creator')
  await pluginHost.activateBuiltin(settingsPlugin, 'settings')
  await pluginHost.activateBuiltin(ctoolPlugin, 'ctool')
}

async function loadUserPlugins(): Promise<void> {
  await pluginHost.scanAndLoadUserPlugins()
}

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    sendSignal('second-instance')
  })
}

void app.whenReady().then(async () => {
  configManager.load()
  app.setLoginItemSettings({ openAtLogin: configManager.getLaunchAtStartup() })
  await registerBuiltinPlugins()
  await loadUserPlugins()
  prefixRegistry.rebuild()
  createToastWindow()
  createWindow()
  createTray()

  const shortcut = configManager.getShortcut()
  logger.info('[App] registering global shortcut: %s', shortcut)
  globalShortcut.register(shortcut, () => {
    const aa = checkAutoActivate()
    signalShow(aa || undefined)
  })

  registerIpc()

  const skipVersion = configManager.getRaw().skipVersion
  const lastCheck = configManager.getRaw().lastUpdateCheck || 0
  const ONE_DAY = 24 * 60 * 60 * 1000
  if (Date.now() - lastCheck > ONE_DAY) {
    setTimeout(() => {
      void (async () => {
        configManager.patch({ lastUpdateCheck: Date.now() })
        const info = await autoUpdater.checkForUpdates()
        if (info.available && info.latestVersion && info.latestVersion !== skipVersion) {
          setUpdateAvailable(info.latestVersion)
          showScreenToast(`Futari ${info.latestVersion} 可用，右键托盘图标更新`)
        }
      })()
    }, 5000)
  }

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
  destroyTray()
  destroyToastWindow()
  companionManager.stopAll()
})
