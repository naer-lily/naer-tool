import type { SearchResponse } from '../shared/plugin-api'

export interface NaerAPI {
  search(text: string, pluginId?: string): Promise<SearchResponse>
  execute(pluginId: string, commandId: string, input: string): Promise<unknown>
  closeWindow(): void
  onFocusInput(cb: () => void): () => void
  onToast(cb: (message: string) => void): () => void
}

declare global {
  interface Window {
    naerAPI: NaerAPI
  }
}
