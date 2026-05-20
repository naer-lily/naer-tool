import type { SearchResponse } from '@shared/plugin-api'
import type { AppSignalPayload } from '@shared/ipc-channels'

export interface FutariAPI {
  search(text: string, pluginId?: string): Promise<SearchResponse>
  execute(pluginId: string, commandId: string, input: string): Promise<{ outcome?: 'close' | 'home' }>
  showWindow(): void
  hideWindow(): void
  closeWebView(data?: unknown): void
  webViewInput(text: string): void
  onAppEvent(cb: (payload: AppSignalPayload) => void): () => void
  onToast(cb: (message: string) => void): () => void
  onToggleTheme(cb: () => void): () => void
  log(level: string, ...args: unknown[]): void
  resizeWindow(height: number): void
}

declare global {
  interface Window {
    futariAPI: FutariAPI
  }
}
