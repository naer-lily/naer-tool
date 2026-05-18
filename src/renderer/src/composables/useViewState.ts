import { ref, computed, nextTick } from 'vue'
import type { SearchResult } from '@shared/plugin-api'
import { logger } from '@/utils/logger'

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
  const executingCommand = ref(false)

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
    const prevId = state.value.id
    const s = state.value

    switch (event.type) {
      case 'enter-subcommand':
        state.value = { id: 'subcommand', pluginId: event.pluginId, icon: event.icon || null }
        logger.trace('[VS] dispatch %s → subcommand plugin=%s icon=%s', prevId, event.pluginId, event.icon || null)
        return true

      case 'exit-subcommand':
        if (s.id !== 'subcommand') return false
        state.value = { id: 'home' }
        logger.trace('[VS] dispatch subcommand → home')
        return true

      case 'open-webview':
        state.value = { id: 'webview-loading', height: event.height, icon: event.icon }
        logger.trace('[VS] dispatch %s → webview-loading icon=%s height=%d', prevId, event.icon, event.height)
        return true

      case 'webview-ready':
        if (s.id !== 'webview-loading') return false
        state.value = { id: 'webview-active', height: s.height, icon: s.icon }
        logger.trace('[VS] dispatch webview-loading → webview-active icon=%s', s.icon)
        return true

      case 'close-webview':
        if (s.id !== 'webview-loading' && s.id !== 'webview-active') return false
        state.value = { id: 'home' }
        logger.trace('[VS] dispatch %s → home', prevId)
        return true

      case 'focus-input':
        if (s.id === 'webview-loading' || s.id === 'webview-active') return false
        if (s.id === 'subcommand') {
          state.value = { id: 'home' }
          logger.trace('[VS] dispatch focus-input: subcommand → home')
        }
        return true

      case 'auto-activate':
        if (s.id === 'webview-loading' || s.id === 'webview-active') return false
        state.value = { id: 'subcommand', pluginId: event.pluginId, icon: event.icon || null }
        logger.trace('[VS] dispatch auto-activate %s → subcommand plugin=%s', prevId, event.pluginId)
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
  }

  async function selectResult(index: number): Promise<void> {
    const item = results.value[index]
    if (!item) return

    if (item.prefixEntry) {
      await enterSubcommand(item.pluginId, item.icon)
      return
    }

    const pluginId = activePluginId.value || item.pluginId
    logger.trace('[VS] selectResult idx=%d cmd=%s plugin=%s', index, item.id, pluginId)
    executingCommand.value = true
    const result = await window.futariAPI.execute(pluginId, item.id, query.value)
    executingCommand.value = false

    logger.trace('[VS] selectResult execute returned shouldClose=%s state=%s', result.shouldClose, state.value.id)

    if (result.shouldClose) {
      if (state.value.id === 'webview-loading' || state.value.id === 'webview-active') {
        dispatch({ type: 'close-webview' })
      } else if (state.value.id === 'subcommand') {
        dispatch({ type: 'exit-subcommand' })
      }
      query.value = ''
      results.value = []
      activeIndex.value = 0
      window.futariAPI.closeWindow()
      return
    }

    if (state.value.id === 'webview-loading' || state.value.id === 'webview-active') {
      dispatch({ type: 'close-webview' })
    }
    query.value = ''
    results.value = []
    activeIndex.value = 0
    if (state.value.id === 'subcommand') {
      exitSubcommand()
    } else {
      doSearch()
    }
  }

  function handleEscape(): void {
    const s = state.value
    if (s.id === 'webview-loading' || s.id === 'webview-active') {
      closeWebView()
      query.value = ''
      results.value = []
      activeIndex.value = 0
      doSearch()
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
      query.value = ''
      results.value = []
      activeIndex.value = 0
      doSearch()
      return
    }
    if (s.id === 'subcommand') {
      exitSubcommand()
    }
  }

  function handleFocusInput(onReady?: () => void): void {
    if (executingCommand.value) {
      logger.trace('[VS] handleFocusInput ignored: command execution in progress')
      return
    }
    if (!dispatch({ type: 'focus-input' })) return
    query.value = ''
    nextTick(async () => {
      await doSearch()
      onReady?.()
    })
  }

  function handleAutoActivate(pluginId: string, icon?: string): void {
    if (!dispatch({ type: 'auto-activate', pluginId, icon })) return
    enterSubcommand(pluginId, icon)
  }

  function handleShowWebView(payload: { height: number; icon: string | null }): void {
    logger.trace('[VS] handleShowWebView icon=%s height=%d', payload.icon, payload.height)
    dispatch({ type: 'open-webview', height: payload.height, icon: payload.icon })
    results.value = []
    activeIndex.value = 0
  }

  function handleWebViewReady(): void {
    logger.trace('[VS] handleWebViewReady state=%s', state.value.id)
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
