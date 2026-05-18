import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { SearchResponse } from '@shared/plugin-api'

const api = {
  search: (text: string, pluginId?: string): Promise<SearchResponse> => {
    return ipcRenderer.invoke(IPC.SEARCH, { text, pluginId })
  },

  execute: (pluginId: string, commandId: string, input: string): Promise<{ webViewOpened: boolean; shouldClose: boolean }> => {
    return ipcRenderer.invoke(IPC.EXECUTE, { pluginId, commandId, input })
  },

  closeWindow: (): void => {
    ipcRenderer.send(IPC.CLOSE)
  },

  closeWebView: (): void => {
    ipcRenderer.send(IPC.CLOSE_WEB_VIEW)
  },

  webViewInput: (text: string): void => {
    ipcRenderer.send(IPC.WEB_VIEW_INPUT, text)
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
  },

  onShowWebView: (cb: (payload: { height: number; icon: string | null }) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, payload: { height: number; icon: string | null }) => cb(payload)
    ipcRenderer.on(IPC.SHOW_WEB_VIEW, handler)
    return () => {
      ipcRenderer.removeListener(IPC.SHOW_WEB_VIEW, handler)
    }
  },

  onHideWebView: (cb: () => void): (() => void) => {
    const handler = () => cb()
    ipcRenderer.on(IPC.HIDE_WEB_VIEW, handler)
    return () => {
      ipcRenderer.removeListener(IPC.HIDE_WEB_VIEW, handler)
    }
  },

  onWebViewReady: (cb: () => void): (() => void) => {
    const handler = () => cb()
    ipcRenderer.on(IPC.WEB_VIEW_READY, handler)
    return () => {
      ipcRenderer.removeListener(IPC.WEB_VIEW_READY, handler)
    }
  },

  log: (level: string, ...args: unknown[]): void => {
    ipcRenderer.send(IPC.LOG, { level, args })
  }
}

contextBridge.exposeInMainWorld('futariAPI', api)

export type FutariAPI = typeof api
