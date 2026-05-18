import { app, BrowserWindow, globalShortcut } from 'electron'
import { createWindow, toggleWindow } from '@main/window-manager'
import { createToastWindow, destroyToastWindow } from '@main/toast'
import { createTray, destroyTray } from '@main/tray'
import { registerIpc } from '@main/ipc-handlers'
import { pluginHost } from '@main/plugin-host'
import { prefixRegistry } from '@main/prefix-registry'
import { configManager } from '@main/config'
import { logger } from '@main/logger'
import helloPlugin from '@main/plugins/builtins/hello'
import calculatorPlugin from '@main/plugins/builtins/calculator'
import runPlugin from '@main/plugins/builtins/run'
import reloadPlugin from '@main/plugins/builtins/reload'
import pluginCreator from '@main/plugins/builtins/plugin-creator'

function registerBuiltinPlugins(): void {
  pluginHost.registerBuiltin(helloPlugin, 'hello')
  helloPlugin.onActivate({})
  pluginHost.registerBuiltin(calculatorPlugin, 'calculator')
  calculatorPlugin.onActivate({})
  pluginHost.registerBuiltin(runPlugin, 'run')
  runPlugin.onActivate({})
  pluginHost.registerBuiltin(reloadPlugin, 'reload')
  reloadPlugin.onActivate({})
  pluginHost.registerBuiltin(pluginCreator, 'plugin-creator')
  pluginCreator.onActivate({})
}

function loadUserPlugins(): void {
  for (const pluginPath of configManager.getPlugins()) {
    try {
      pluginHost.loadFromPath(pluginPath)
      logger.info('[App] loaded user plugin: %s', pluginPath)
    } catch (e) {
      logger.error('[App] failed to load user plugin %s:', pluginPath, e)
    }
  }
}

app.whenReady().then(() => {
  configManager.load()
  registerBuiltinPlugins()
  loadUserPlugins()
  prefixRegistry.rebuild()
  createToastWindow()
  createWindow()
  createTray()

  globalShortcut.register('Alt+Space', () => {
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
})
