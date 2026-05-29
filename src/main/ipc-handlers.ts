import { ipcMain, clipboard, shell } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { searchEngine } from '@main/search-engine'
import { showWindow, hideWindow, setWindowHeight } from '@main/window-manager'
import { showScreenToast } from '@main/toast'
import { formDialog } from '@main/form-dialog'
import { webViewManager } from '@main/web-view-manager'
import { configManager } from '@main/config'
import { logger, createPluginLogger } from '@main/logger'
import { pluginHost } from '@main/plugin-host'
import { companionManager } from '@main/companion-manager'

export function registerIpc(): void {
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
    logger.trace('[IPC] EXECUTE plugin=%s cmd=%s input=%s', payload.pluginId, payload.commandId, payload.input)
    try {
      const { outcome } = await searchEngine.execute(payload.pluginId, payload.commandId, payload.input, showScreenToast)
      logger.trace('[IPC] EXECUTE done outcome=%s', outcome)
      return { outcome }
    } catch (err) {
      logger.error('[IPC] EXECUTE error:', err)
      return { outcome: 'close' as const }
    }
  })

  ipcMain.on(IPC.HIDE_WINDOW, () => {
    logger.trace('[IPC] HIDE_WINDOW received')
    hideWindow()
  })

  ipcMain.on(IPC.SHOW_WINDOW, () => {
    logger.trace('[IPC] SHOW_WINDOW received')
    showWindow()
  })

  ipcMain.on(IPC.FORM_SUBMIT, (event, values: Record<string, unknown>) => {
    formDialog.handleSubmit(event.sender.id, values)
  })

  ipcMain.handle(IPC.GET_THEME, async () => {
    return configManager.getTheme()
  })

  ipcMain.on(IPC.WEB_VIEW_INPUT, (_event, text: string) => {
    webViewManager.sendInput(text)
  })

  ipcMain.on(IPC.CLOSE_WEB_VIEW, (_event, data?: unknown) => {
    logger.trace('[IPC] CLOSE_WEB_VIEW data=%o', data)
    webViewManager.close(data)
  })

  ipcMain.on(IPC.WEB_VIEW_RESIZE, (_event, height: number) => {
    webViewManager.handleResize(height)
  })

  ipcMain.on(IPC.WEB_VIEW_MESSAGE, (_event, data: unknown) => {
    webViewManager.handleMessage(data)
  })

  ipcMain.on(IPC.RESIZE_WINDOW, (_event, height: number) => {
    setWindowHeight(height)
  })

  ipcMain.on(IPC.LOG, (_event, payload: { level: string; args: unknown[] }) => {
    const fn = (logger as unknown as Record<string, (...a: unknown[]) => void>)[payload.level]
    if (fn) {
      fn(...payload.args)
    }
  })

  ipcMain.handle(IPC.GET_CONFIG, async () => {
    return configManager.getRaw()
  })

  ipcMain.handle(IPC.SET_CONFIG, async (_event, partial: Record<string, unknown>) => {
    configManager.patch(partial)
    return { ok: true }
  })

  ipcMain.handle(IPC.CONTEXT_ACTION, async (_event, payload: { pluginId: string; commandId: string; actionId: string; input: string }) => {
    logger.trace('[IPC] CONTEXT_ACTION plugin=%s cmd=%s action=%s', payload.pluginId, payload.commandId, payload.actionId)
    const plugin = pluginHost.get(payload.pluginId)
    if (!plugin?.onContextAction) {
      logger.warn('[IPC] CONTEXT_ACTION plugin not found or no onContextAction: %s', payload.pluginId)
      return
    }

    const ctx: Parameters<NonNullable<typeof plugin.onContextAction>>[2] = {
      input: payload.input,
      toast: showScreenToast,
      showForm: async (config) => formDialog.show(config),
      openWebView: async (config) => webViewManager.open(config),
      closeWebView: () => webViewManager.close(),
      clipboard: {
        writeText: (text) => clipboard.writeText(text),
        readText: () => clipboard.readText(),
        writeHTML: (html) => clipboard.writeHTML(html),
        readHTML: () => clipboard.readHTML(),
        clear: () => clipboard.clear()
      },
      shell: {
        openExternal: async (url) => shell.openExternal(url),
        openPath: async (path) => shell.openPath(path),
        showItemInFolder: (path) => shell.showItemInFolder(path),
        beep: () => shell.beep()
      },
      companions: companionManager.getHandlesForPlugin(payload.pluginId),
      log: createPluginLogger(payload.pluginId)
    }

    try {
      await plugin.onContextAction(payload.commandId, payload.actionId, ctx)
    } catch (e) {
      logger.error('[IPC] CONTEXT_ACTION error:', e)
    }
  })
}
