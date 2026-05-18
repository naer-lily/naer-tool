import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { searchEngine } from '@main/search-engine'
import { hideWindow, getMainWindow } from '@main/window-manager'
import { showScreenToast } from '@main/toast'
import { formDialog } from '@main/form-dialog'
import { webViewManager } from '@main/web-view-manager'
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
      await searchEngine.execute(payload.pluginId, payload.commandId, payload.input, showScreenToast)
    } catch (err) {
      logger.error('[IPC] EXECUTE error:', err)
    }
    const active = webViewManager.isActive
    logger.trace('[IPC] EXECUTE done isActive=%s', active)
    return { webViewOpened: active }
  })

  ipcMain.on(IPC.CLOSE, () => {
    hideWindow()
  })

  ipcMain.on(IPC.FORM_SUBMIT, (event, values: Record<string, unknown>) => {
    formDialog.handleSubmit(event.sender.id, values)
  })

  ipcMain.handle(IPC.GET_THEME, () => {
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
}
