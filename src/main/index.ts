import { app, BrowserWindow, globalShortcut } from 'electron'
import { createWindow, toggleWindow, showWindow } from '@main/window-manager'
import { createToastWindow, destroyToastWindow } from '@main/toast'
import { createTray, destroyTray } from '@main/tray'
import { registerIpc } from '@main/ipc-handlers'
import { pluginHost } from '@main/plugin-host'
import { prefixRegistry } from '@main/prefix-registry'
import { configManager } from '@main/config'
import { logger } from '@main/logger'
import { companionManager } from '@main/companion-manager'
import helloPlugin from '@main/plugins/builtins/hello'
import calculatorPlugin from '@main/plugins/builtins/calculator'
import runPlugin from '@main/plugins/builtins/run'
import reloadPlugin from '@main/plugins/builtins/reload'
import pluginCreator from '@main/plugins/builtins/plugin-creator'
import settingsPlugin from '@main/plugins/builtins/settings'

async function registerBuiltinPlugins(): Promise<void> {
  await pluginHost.activateBuiltin(helloPlugin, 'hello')
  await pluginHost.activateBuiltin(calculatorPlugin, 'calculator')
  await pluginHost.activateBuiltin(runPlugin, 'run')
  await pluginHost.activateBuiltin(reloadPlugin, 'reload')
  await pluginHost.activateBuiltin(pluginCreator, 'plugin-creator')
  await pluginHost.activateBuiltin(settingsPlugin, 'settings')
}

function loadUserPlugins(): void {
  pluginHost.scanAndLoadUserPlugins()
}

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showWindow()
  })
}

app.whenReady().then(async () => {
  configManager.load()
  app.setLoginItemSettings({ openAtLogin: configManager.getLaunchAtStartup() })
  await registerBuiltinPlugins()
  loadUserPlugins()
  prefixRegistry.rebuild()
  createToastWindow()
  createWindow()
  createTray()

  const shortcut = configManager.getShortcut()
  logger.info('[App] registering global shortcut: %s', shortcut)
  globalShortcut.register(shortcut, () => {
    toggleWindow()
  })

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
  destroyTray()
  destroyToastWindow()
  companionManager.stopAll()
})
