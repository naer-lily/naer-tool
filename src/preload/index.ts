import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { AppSignalPayload } from '@shared/ipc-channels'
import type { SearchResponse } from '@shared/plugin-api'

const api = {
  search: async (text: string, pluginId?: string): Promise<SearchResponse> => {
    return ipcRenderer.invoke(IPC.SEARCH, { text, pluginId })
  },

  execute: async (pluginId: string, commandId: string, input: string): Promise<{ outcome?: 'close' | 'home' }> => {
    return ipcRenderer.invoke(IPC.EXECUTE, { pluginId, commandId, input })
  },

  showWindow: (): void => {
    ipcRenderer.send(IPC.SHOW_WINDOW)
  },

  hideWindow: (): void => {
    ipcRenderer.send(IPC.HIDE_WINDOW)
  },

  closeWebView: (data?: unknown): void => {
    ipcRenderer.send(IPC.CLOSE_WEB_VIEW, data)
  },

  webViewInput: (text: string): void => {
    ipcRenderer.send(IPC.WEB_VIEW_INPUT, text)
  },

  onAppEvent: (cb: (payload: AppSignalPayload) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, payload: AppSignalPayload) => cb(payload)
    ipcRenderer.on(IPC.APP_EVENT, handler)
    return () => {
      ipcRenderer.removeListener(IPC.APP_EVENT, handler)
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

  log: (level: string, ...args: unknown[]): void => {
    ipcRenderer.send(IPC.LOG, { level, args })
  },

  resizeWindow: (height: number): void => {
    ipcRenderer.send(IPC.RESIZE_WINDOW, height)
  },

  contextAction: async (pluginId: string, commandId: string, actionId: string, input: string): Promise<void> => {
    return ipcRenderer.invoke(IPC.CONTEXT_ACTION, { pluginId, commandId, actionId, input })
  }
}

contextBridge.exposeInMainWorld('futariAPI', api)

export type FutariAPI = typeof api
