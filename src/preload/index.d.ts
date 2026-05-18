import type { SearchResponse } from '@shared/plugin-api'

export interface FutariAPI {
  search(text: string, pluginId?: string): Promise<SearchResponse>
  execute(pluginId: string, commandId: string, input: string): Promise<{ webViewOpened: boolean; shouldClose: boolean }>
  closeWindow(): void
  closeWebView(): void
  webViewInput(text: string): void
  onFocusInput(cb: () => void): () => void
  onToast(cb: (message: string) => void): () => void
  onToggleTheme(cb: () => void): () => void
  onAutoActivate(cb: (pluginId: string, icon?: string) => void): () => void
  onShowWebView(cb: (payload: { height: number; icon: string | null }) => void): () => void
  onHideWebView(cb: () => void): () => void
  onWebViewReady(cb: () => void): () => void
  log(level: string, ...args: unknown[]): void
}

declare global {
  interface Window {
    futariAPI: FutariAPI
  }
}
