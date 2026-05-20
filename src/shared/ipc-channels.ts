export const IPC = {
  SEARCH: 'search',
  EXECUTE: 'execute',
  TOAST: 'toast',
  GET_THEME: 'get-theme',
  FORM_SUBMIT: 'form-submit',
  APP_EVENT: 'app-event',
  WEB_VIEW_INPUT: 'web-view-input',
  WEB_VIEW_RESIZE: 'web-view-resize',
  WEB_VIEW_MESSAGE: 'web-view-message',
  CLOSE_WEB_VIEW: 'close-web-view',
  LOG: 'log',
  GET_CONFIG: 'get-config',
  SET_CONFIG: 'set-config',
  RESIZE_WINDOW: 'resize-window',
  SHOW_WINDOW: 'show-window',
  HIDE_WINDOW: 'hide-window',
  SET_THEME: 'set-theme'
} as const

export type AppSignalType =
  | 'shortcut-pressed'
  | 'window-blurred'
  | 'tray-clicked'
  | 'second-instance'
  | 'webview-opened'
  | 'webview-ready'
  | 'webview-closed'
  | 'webview-message'

export interface AppSignalAutoActivate {
  pluginId: string
  icon?: string
}

export interface AppSignalPayload {
  type: AppSignalType
  autoActivate?: AppSignalAutoActivate
  height?: number
  icon?: string | null
  data?: unknown
}
