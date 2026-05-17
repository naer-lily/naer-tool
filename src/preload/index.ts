import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { SearchResponse } from '@shared/plugin-api'

const api = {
  search: (text: string, pluginId?: string): Promise<SearchResponse> => {
    return ipcRenderer.invoke(IPC.SEARCH, { text, pluginId })
  },

  execute: (pluginId: string, commandId: string, input: string): Promise<void> => {
    return ipcRenderer.invoke(IPC.EXECUTE, { pluginId, commandId, input })
  },

  closeWindow: (): void => {
    ipcRenderer.send(IPC.CLOSE)
  },

  onFocusInput: (cb: () => void): (() => void) => {
    const handler = () => cb()
    ipcRenderer.on('focus-input', handler)
    return () => {
      ipcRenderer.removeListener('focus-input', handler)
    }
  },

  onToast: (cb: (message: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, msg: string) => cb(msg)
    ipcRenderer.on(IPC.TOAST, handler)
    return () => {
      ipcRenderer.removeListener(IPC.TOAST, handler)
    }
  },

  onToggleTheme: (cb: () => void): (() => void) => {
    const handler = () => cb()
    ipcRenderer.on('toggle-theme', handler)
    return () => {
      ipcRenderer.removeListener('toggle-theme', handler)
    }
  },

  onAutoActivate: (cb: (pluginId: string, icon?: string) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, pluginId: string, icon?: string) => cb(pluginId, icon)
    ipcRenderer.on('auto-activate', handler)
    return () => {
      ipcRenderer.removeListener('auto-activate', handler)
    }
  }
}

contextBridge.exposeInMainWorld('futariAPI', api)

export type FutariAPI = typeof api
