import { ref, computed, nextTick } from 'vue'
import type { SearchResult } from '@shared/plugin-api'

type ViewState =
  | { id: 'home' }
  | { id: 'subcommand'; pluginId: string; icon: string | null }
  | { id: 'webview-loading'; height: number; icon: string | null }
  | { id: 'webview-active'; height: number; icon: string | null }

type ViewEvent =
  | { type: 'enter-subcommand'; pluginId: string; icon?: string }
  | { type: 'exit-subcommand' }
  | { type: 'open-webview'; height: number; icon: string | null }
  | { type: 'webview-ready' }
  | { type: 'close-webview' }
  | { type: 'focus-input' }
  | { type: 'auto-activate'; pluginId: string; icon?: string }

let instance: ReturnType<typeof createViewState> | null = null

function createViewState() {
  const state = ref<ViewState>({ id: 'home' })

  const query = ref('')
  const results = ref<SearchResult[]>([])
  const activeIndex = ref(0)
  const toast = ref('')

  const mode = computed<'main' | 'subcommand'>(() =>
    state.value.id === 'subcommand' ? 'subcommand' : 'main'
  )

  const webviewActive = computed(() =>
    state.value.id === 'webview-loading' || state.value.id === 'webview-active'
  )

  const webviewLoading = computed(() => state.value.id === 'webview-loading')

  const webviewHeight = computed(() => {
    const s = state.value
    return s.id === 'webview-loading' || s.id === 'webview-active' ? s.height : 0
  })

  const activePluginId = computed(() =>
    state.value.id === 'subcommand' ? state.value.pluginId : null
  )

  const activePluginIcon = computed(() => {
    const s = state.value
    if (s.id === 'subcommand') return s.icon
    if (s.id === 'webview-loading' || s.id === 'webview-active') return s.icon
    return null
  })

  function dispatch(event: ViewEvent): boolean {
    const s = state.value

    switch (event.type) {
      case 'enter-subcommand':
        state.value = { id: 'subcommand', pluginId: event.pluginId, icon: event.icon || null }
        return true

      case 'exit-subcommand':
        if (s.id !== 'subcommand') return false
        state.value = { id: 'home' }
        return true

      case 'open-webview':
        state.value = { id: 'webview-loading', height: event.height, icon: event.icon }
        return true

      case 'webview-ready':
        if (s.id !== 'webview-loading') return false
        state.value = { id: 'webview-active', height: s.height, icon: s.icon }
        return true

      case 'close-webview':
        if (s.id !== 'webview-loading' && s.id !== 'webview-active') return false
        state.value = { id: 'home' }
        return true

      case 'focus-input':
        if (s.id === 'webview-loading' || s.id === 'webview-active') return false
        if (s.id === 'subcommand') {
          state.value = { id: 'home' }
        }
        return true

      case 'auto-activate':
        if (s.id === 'webview-loading' || s.id === 'webview-active') return false
        state.value = { id: 'subcommand', pluginId: event.pluginId, icon: event.icon || null }
        return true

      default:
        return false
    }
  }

  // ── External actions (side effects, dispatched by consumer) ──

  async function doSearch(): Promise<void> {
    const s = state.value

    if (s.id === 'webview-loading' || s.id === 'webview-active') {
      window.futariAPI.webViewInput(query.value)
      return
    }

    const text = query.value.trim()

    if (s.id === 'subcommand') {
      results.value = (await window.futariAPI.search(text, s.pluginId)).results
      activeIndex.value = 0
      return
    }

    const response = await window.futariAPI.search(text)

    if (response.mode === 'subcommand') {
      dispatch({ type: 'enter-subcommand', pluginId: response.pluginId!, icon: response.pluginIcon })
      query.value = ''
      results.value = response.results
      activeIndex.value = 0
    } else {
      results.value = response.results
      activeIndex.value = 0
    }
  }

  async function enterSubcommand(pluginId: string, icon?: string): Promise<void> {
    dispatch({ type: 'enter-subcommand', pluginId, icon })
    query.value = ''
    results.value = (await window.futariAPI.search('', pluginId)).results
    activeIndex.value = 0
  }

  function exitSubcommand(): void {
    if (!dispatch({ type: 'exit-subcommand' })) return
    query.value = ''
    doSearch()
  }

  function closeWebView(): void {
    if (!dispatch({ type: 'close-webview' })) return
    window.futariAPI.closeWebView()
    query.value = ''
    results.value = []
    activeIndex.value = 0
    doSearch()
  }

  async function selectResult(index: number): Promise<void> {
    const item = results.value[index]
    if (!item) return

    if (item.prefixEntry) {
      await enterSubcommand(item.pluginId, item.icon)
      return
    }

    const pluginId = activePluginId.value || item.pluginId
    const result = await window.futariAPI.execute(pluginId, item.id, query.value)

    if (result.webViewOpened) return

    query.value = ''
    results.value = []
    activeIndex.value = 0

    if (state.value.id === 'subcommand') {
      exitSubcommand()
    }
  }

  function handleEscape(): void {
    const s = state.value
    if (s.id === 'webview-loading' || s.id === 'webview-active') {
      closeWebView()
      return
    }
    if (s.id === 'subcommand') {
      exitSubcommand()
      return
    }
    window.futariAPI.closeWindow()
  }

  function handleBackspace(): void {
    const s = state.value
    if (s.id === 'webview-loading' || s.id === 'webview-active') {
      closeWebView()
      return
    }
    if (s.id === 'subcommand') {
      exitSubcommand()
    }
  }

  function handleFocusInput(): void {
    if (!dispatch({ type: 'focus-input' })) return
    query.value = ''
    nextTick(() => doSearch())
  }

  function handleAutoActivate(pluginId: string, icon?: string): void {
    if (!dispatch({ type: 'auto-activate', pluginId, icon })) return
    enterSubcommand(pluginId, icon)
  }

  function handleShowWebView(payload: { height: number }): void {
    const icon = state.value.id === 'subcommand' ? state.value.icon : null
    dispatch({ type: 'open-webview', height: payload.height, icon })
    results.value = []
    activeIndex.value = 0
  }

  function handleWebViewReady(): void {
    dispatch({ type: 'webview-ready' })
    const input = document.querySelector('.search-input input') as HTMLInputElement | null
    input?.focus()
  }

  return {
    state,
    query,
    results,
    activeIndex,
    toast,
    mode,
    webviewActive,
    webviewLoading,
    webviewHeight,
    activePluginId,
    activePluginIcon,
    dispatch,
    doSearch,
    enterSubcommand,
    exitSubcommand,
    closeWebView,
    selectResult,
    handleEscape,
    handleBackspace,
    handleFocusInput,
    handleAutoActivate,
    handleShowWebView,
    handleWebViewReady
  }
}

export function useViewState() {
  if (!instance) {
    instance = createViewState()
  }
  return instance
}
