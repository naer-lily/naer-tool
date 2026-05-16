import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { searchEngine } from '@main/search-engine'
import { hideWindow } from '@main/window-manager'
import { showScreenToast } from '@main/toast'

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
    await searchEngine.execute(payload.pluginId, payload.commandId, payload.input, showScreenToast)
  })

  ipcMain.on(IPC.CLOSE, () => {
    hideWindow()
  })
}
