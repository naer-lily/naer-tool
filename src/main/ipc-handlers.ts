import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { searchEngine } from '@main/search-engine'
import { showWindow, hideWindow, getMainWindow, setWindowHeight } from '@main/window-manager'
import { showScreenToast } from '@main/toast'
import { formDialog } from '@main/form-dialog'
import { webViewManager } from '@main/web-view-manager'
import { configManager } from '@main/config'
import { logger } from '@main/logger'

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
    const win = getMainWindow()
    return win?.webContents.executeJavaScript('localStorage.getItem("futari-theme") || "dark"')
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
}
