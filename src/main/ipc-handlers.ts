import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { searchEngine } from '@main/search-engine'
import { hideWindow, getMainWindow } from '@main/window-manager'
import { showScreenToast } from '@main/toast'
import { formDialog } from '@main/form-dialog'
import { webViewManager } from '@main/web-view-manager'

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
    console.log('[IPC] EXECUTE: plugin=%s cmd=%s input=%s', payload.pluginId, payload.commandId, payload.input)
    await searchEngine.execute(payload.pluginId, payload.commandId, payload.input, showScreenToast)
    console.log('[IPC] EXECUTE done, webView.isActive=%s', webViewManager.isActive)
    return { webViewOpened: webViewManager.isActive }
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

  ipcMain.on(IPC.CLOSE_WEB_VIEW, () => {
    console.log('[IPC] CLOSE_WEB_VIEW received')
    webViewManager.close()
  })

  ipcMain.on(IPC.WEB_VIEW_RESIZE, (_event, height: number) => {
    webViewManager.handleResize(height)
  })

  ipcMain.on(IPC.WEB_VIEW_MESSAGE, (_event, data: unknown) => {
    console.log('[IPC] WEB_VIEW_MESSAGE:', data)
    webViewManager.handleMessage(data)
  })

  ipcMain.on(IPC.WEB_VIEW_RESIZE, (_event, height: number) => {
    console.log('[IPC] WEB_VIEW_RESIZE:', height)
    webViewManager.handleResize(height)
  })
}
