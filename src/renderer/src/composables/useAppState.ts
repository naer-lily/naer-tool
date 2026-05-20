import { ref, computed, nextTick } from 'vue'
import type { SearchResult, SearchResponse } from '@shared/plugin-api'
import type { AppSignalPayload } from '@shared/ipc-channels'
import { logger } from '@/utils/logger'

type AppState =
  | { id: 'idle' }
  | { id: 'home' }
  | { id: 'subcommand'; pluginId: string; icon: string | null }
  | { id: 'webview-loading'; height: number; icon: string | null }
  | { id: 'webview-active'; height: number; icon: string | null }

type InternalEvent =
  | { type: 'SHOW'; autoActivate?: { pluginId: string; icon?: string } }
  | { type: 'HIDE' }
  | { type: 'WEBVIEW_OPEN'; height: number; icon: string | null }
  | { type: 'WEBVIEW_READY' }
  | { type: 'WEBVIEW_CLOSE'; data?: unknown }
  | { type: 'ENTER_SUBCOMMAND'; pluginId: string; icon?: string }
  | { type: 'EXIT_SUBCOMMAND' }
  | { type: 'RESUME_WEBVIEW'; height: number; icon: string | null }

let instance: ReturnType<typeof createAppState> | null = null

function createAppState() {
  const state = ref<AppState>({ id: 'idle' })

  const query = ref('')
  const results = ref<SearchResult[]>([])
  const activeIndex = ref(0)
  const toast = ref('')
  const executingCommand = ref(false)

  let resumeWebView: { height: number; icon: string | null } | null = null
  let resumeSubcommand: { pluginId: string; icon: string | null; query: string } | null = null

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

  const isIdle = computed(() => state.value.id === 'idle')

  // ── 转换引擎 ──

  function dispatch(event: InternalEvent): boolean {
    const prevId = state.value.id
    const s = state.value

    switch (event.type) {
      case 'SHOW': {
        if (event.autoActivate) {
          state.value = { id: 'subcommand', pluginId: event.autoActivate.pluginId, icon: event.autoActivate.icon || null }
        } else {
          state.value = { id: 'home' }
        }
        logger.trace('[AS] dispatch %s → %s aa=%s', prevId, state.value.id, !!event.autoActivate)
        return true
      }

      case 'HIDE':
        state.value = { id: 'idle' }
        logger.trace('[AS] dispatch %s → idle', prevId)
        return true

      case 'ENTER_SUBCOMMAND':
        state.value = { id: 'subcommand', pluginId: event.pluginId, icon: event.icon || null }
        logger.trace('[AS] dispatch %s → subcommand plugin=%s', prevId, event.pluginId)
        return true

      case 'EXIT_SUBCOMMAND':
        if (s.id !== 'subcommand') return false
        state.value = { id: 'home' }
        logger.trace('[AS] dispatch subcommand → home')
        return true

      case 'WEBVIEW_OPEN':
        state.value = { id: 'webview-loading', height: event.height, icon: event.icon }
        logger.trace('[AS] dispatch %s → webview-loading h=%d icon=%s', prevId, event.height, event.icon)
        return true

      case 'WEBVIEW_READY':
        if (s.id !== 'webview-loading') return false
        state.value = { id: 'webview-active', height: s.height, icon: s.icon }
        logger.trace('[AS] dispatch webview-loading → webview-active')
        return true

      case 'WEBVIEW_CLOSE':
        if (s.id !== 'webview-loading' && s.id !== 'webview-active') return false
        state.value = { id: 'home' }
        logger.trace('[AS] dispatch %s → home', prevId)
        return true

      case 'RESUME_WEBVIEW':
        if (s.id !== 'idle') return false
        state.value = { id: 'webview-active', height: event.height, icon: event.icon }
        logger.trace('[AS] dispatch idle → webview-active (resume) h=%d', event.height)
        return true

      default:
        return false
    }
  }

  // ── 信号处理 (Main → Renderer) ──

  function handleSignal(payload: AppSignalPayload): void {
    const s = state.value
    logger.trace('[AS] handleSignal type=%s state=%s', payload.type, s.id)

    switch (payload.type) {
      case 'shortcut-pressed':
      case 'tray-clicked':
        if (s.id === 'idle') {
          const rwv = resumeWebView
          resumeWebView = null
          if (rwv) {
            logger.trace('[AS] signal: idle+%s → RESUME_WEBVIEW h=%d + showWindow', payload.type, rwv.height)
            dispatch({ type: 'RESUME_WEBVIEW', height: rwv.height, icon: rwv.icon })
            window.futariAPI.showWindow()
          } else {
            const aa = payload.autoActivate
            if (aa) {
              logger.trace('[AS] signal: idle+%s AA=%s → SHOW(subcommand) + showWindow', payload.type, aa.pluginId)
              dispatch({ type: 'SHOW', autoActivate: aa })
              window.futariAPI.showWindow()
              void enterSubcommandInternal(aa.pluginId, aa.icon)
              focusInput()
            } else {
              const rsc = resumeSubcommand
              resumeSubcommand = null
              if (rsc) {
                logger.trace('[AS] signal: idle+%s → resume subcommand plugin=%s query=%s', payload.type, rsc.pluginId, rsc.query)
                dispatch({ type: 'SHOW', autoActivate: { pluginId: rsc.pluginId, icon: rsc.icon ?? undefined } })
                window.futariAPI.showWindow()
                query.value = rsc.query
                void doSearch()
                focusInput()
              } else {
                logger.trace('[AS] signal: idle+%s → SHOW(home) + showWindow', payload.type)
                dispatch({ type: 'SHOW' })
                window.futariAPI.showWindow()
                void doSearch().then(() => focusInput())
              }
            }
          }
        } else {
          if (s.id === 'webview-loading' || s.id === 'webview-active') {
            resumeWebView = { height: s.height, icon: s.icon }
            logger.trace('[AS] signal: %s+%s → save WebView + HIDE (keep WebView alive)', s.id, payload.type)
          } else if (s.id === 'subcommand') {
            resumeSubcommand = { pluginId: s.pluginId, icon: s.icon, query: query.value }
            logger.trace('[AS] signal: subcommand+%s → save subcommand + HIDE', payload.type)
          } else {
            logger.trace('[AS] signal: %s+%s → HIDE', s.id, payload.type)
          }
          dispatch({ type: 'HIDE' })
          window.futariAPI.hideWindow()
        }
        return

      case 'second-instance':
        if (s.id === 'idle') {
          const rwv = resumeWebView
          resumeWebView = null
          if (rwv) {
            logger.trace('[AS] signal: idle+second-instance → RESUME_WEBVIEW + showWindow')
            dispatch({ type: 'RESUME_WEBVIEW', height: rwv.height, icon: rwv.icon })
            window.futariAPI.showWindow()
          } else {
            const rsc = resumeSubcommand
            resumeSubcommand = null
            if (rsc) {
              logger.trace('[AS] signal: idle+second-instance → resume subcommand plugin=%s', rsc.pluginId)
              dispatch({ type: 'SHOW', autoActivate: { pluginId: rsc.pluginId, icon: rsc.icon ?? undefined } })
              window.futariAPI.showWindow()
              query.value = rsc.query
              void doSearch()
              focusInput()
            } else {
              logger.trace('[AS] signal: idle+second-instance → SHOW + showWindow')
              dispatch({ type: 'SHOW' })
              window.futariAPI.showWindow()
              void doSearch().then(() => focusInput())
            }
          }
        } else {
          logger.trace('[AS] signal: %s+second-instance → ignore', s.id)
        }
        return

      case 'window-blurred':
        if (s.id === 'home' || s.id === 'subcommand') {
          if (s.id === 'subcommand') {
            resumeSubcommand = { pluginId: s.pluginId, icon: s.icon, query: query.value }
          }
          logger.trace('[AS] signal: %s+window-blurred → HIDE', s.id)
          dispatch({ type: 'HIDE' })
          window.futariAPI.hideWindow()
        } else if (s.id === 'webview-loading' || s.id === 'webview-active') {
          resumeWebView = { height: s.height, icon: s.icon }
          logger.trace('[AS] signal: %s+window-blurred → save WebView + HIDE', s.id)
          dispatch({ type: 'HIDE' })
          window.futariAPI.hideWindow()
        } else {
          logger.trace('[AS] signal: %s+window-blurred → ignore', s.id)
        }
        return

      case 'webview-opened': {
        const height = payload.height || 450
        const icon = payload.icon ?? null
        logger.trace('[AS] signal: %s+webview-opened h=%d → WEBVIEW_OPEN', s.id, height)
        resumeWebView = null
        dispatch({ type: 'WEBVIEW_OPEN', height, icon })
        results.value = []
        activeIndex.value = 0
        return
      }

      case 'webview-ready':
        logger.trace('[AS] signal: %s+webview-ready → WEBVIEW_READY', s.id)
        dispatch({ type: 'WEBVIEW_READY' })
        void nextTick(() => {
          const input = document.querySelector<HTMLInputElement>('.search-input input')
          input?.focus()
        })
        return

      case 'webview-closed':
        logger.trace('[AS] signal: %s+webview-closed data=%o → WEBVIEW_CLOSE', s.id, payload.data)
        if (s.id === 'idle') {
          resumeWebView = null
          logger.trace('[AS] signal: idle+webview-closed → cleared resumeWebView')
          return
        }
        dispatch({ type: 'WEBVIEW_CLOSE', data: payload.data })
        return

      case 'webview-message':
        logger.trace('[AS] signal: %s+webview-message data=%o → ignore (handled by WebView itself)', s.id, payload.data)
        return
    }
  }

  // ── 搜索 ──

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

    const response: SearchResponse = await window.futariAPI.search(text)

    if (response.mode === 'subcommand') {
      resumeSubcommand = null
      dispatch({ type: 'ENTER_SUBCOMMAND', pluginId: response.pluginId!, icon: response.pluginIcon || undefined })
      query.value = ''
      results.value = response.results
      activeIndex.value = 0
    } else {
      results.value = response.results
      activeIndex.value = 0
    }
  }

  async function enterSubcommandInternal(pluginId: string, icon?: string): Promise<void> {
    dispatch({ type: 'ENTER_SUBCOMMAND', pluginId, icon })
    query.value = ''
    results.value = (await window.futariAPI.search('', pluginId)).results
    activeIndex.value = 0
  }

  async function enterSubcommand(pluginId: string, icon?: string): Promise<void> {
    await enterSubcommandInternal(pluginId, icon)
  }

  function exitSubcommand(): void {
    if (!dispatch({ type: 'EXIT_SUBCOMMAND' })) return
    resumeSubcommand = null
    query.value = ''
    void doSearch()
  }

  function closeWebView(): void {
    if (!dispatch({ type: 'WEBVIEW_CLOSE' })) return
    window.futariAPI.closeWebView()
  }

  // ── 命令执行 ──

  let hadWebView = false
  let webViewHadData = false

  async function selectResult(index: number): Promise<void> {
    const item = results.value[index]
    if (!item) return

    if (item.prefixEntry) {
      logger.trace('[AS] selectResult prefixEntry → enterSubcommand plugin=%s', item.pluginId)
      await enterSubcommand(item.pluginId, item.icon)
      return
    }

    const pluginId = activePluginId.value || item.pluginId
    logger.trace('[AS] selectResult idx=%d cmd=%s plugin=%s state=%s', index, item.id, pluginId, state.value.id)

    hadWebView = false
    webViewHadData = false

    const tempOpen = (payload: AppSignalPayload) => {
      if (payload.type === 'webview-opened') {
        hadWebView = true
        logger.trace('[AS] selectResult temp: webview-opened → hadWebView=true')
      }
    }
    const tempClose = (payload: AppSignalPayload) => {
      if (payload.type === 'webview-closed') {
        webViewHadData = payload.data !== undefined
        logger.trace('[AS] selectResult temp: webview-closed data=%o → hadData=%s', payload.data, webViewHadData)
      }
    }
    const unsubOpen = window.futariAPI.onAppEvent(tempOpen)
    const unsubClose = window.futariAPI.onAppEvent(tempClose)

    logger.trace('[AS] selectResult await execute start')
    executingCommand.value = true
    const execResult = await window.futariAPI.execute(pluginId, item.id, query.value)
    executingCommand.value = false
    logger.trace('[AS] selectResult await execute done outcome=%s state=%s', execResult.outcome, state.value.id)

    unsubOpen()
    unsubClose()

    if (state.value.id === 'idle') {
      logger.trace('[AS] selectResult state=idle: user hid window during execution → nothing to do')
      return
    }

    const shouldClose: boolean = execResult.outcome === 'close' ? true
      : execResult.outcome === 'home' ? false
      : hadWebView ? webViewHadData
      : true

    logger.trace('[AS] selectResult shouldClose=%s hadWebView=%s hadData=%s state=%s', shouldClose, hadWebView, webViewHadData, state.value.id)

    if (shouldClose) {
      logger.trace('[AS] selectResult shouldClose=true → cleaning up + hideWindow')
      if (state.value.id === 'webview-loading' || state.value.id === 'webview-active') {
        dispatch({ type: 'WEBVIEW_CLOSE' })
      } else if (state.value.id === 'subcommand') {
        dispatch({ type: 'EXIT_SUBCOMMAND' })
        resumeSubcommand = null
      }
      query.value = ''
      results.value = []
      activeIndex.value = 0
      dispatch({ type: 'HIDE' })
      window.futariAPI.hideWindow()
      return
    }

    logger.trace('[AS] selectResult shouldClose=false → staying')
    if (state.value.id === 'webview-loading' || state.value.id === 'webview-active') {
      dispatch({ type: 'WEBVIEW_CLOSE' })
    }
    query.value = ''
    results.value = []
    activeIndex.value = 0
    if (state.value.id === 'subcommand') {
      exitSubcommand()
    } else {
      void doSearch()
    }
  }

  // ── 键盘/UI 事件 ──

  function handleEscape(): void {
    const s = state.value
    logger.trace('[AS] handleEscape state=%s', s.id)
    if (s.id === 'webview-loading' || s.id === 'webview-active') {
      logger.trace('[AS] handleEscape → closeWebView + doSearch')
      window.futariAPI.closeWebView()
      dispatch({ type: 'WEBVIEW_CLOSE' })
      query.value = ''
      results.value = []
      activeIndex.value = 0
      void doSearch()
      return
    }
    if (s.id === 'subcommand') {
      logger.trace('[AS] handleEscape → exitSubcommand')
      exitSubcommand()
      return
    }
    logger.trace('[AS] handleEscape → HIDE + hideWindow')
    dispatch({ type: 'HIDE' })
    window.futariAPI.hideWindow()
  }

  function handleBackspace(): void {
    const s = state.value
    logger.trace('[AS] handleBackspace state=%s', s.id)
    if (s.id === 'webview-loading' || s.id === 'webview-active') {
      logger.trace('[AS] handleBackspace → closeWebView + doSearch')
      window.futariAPI.closeWebView()
      dispatch({ type: 'WEBVIEW_CLOSE' })
      query.value = ''
      results.value = []
      activeIndex.value = 0
      void doSearch()
      return
    }
    if (s.id === 'subcommand') {
      logger.trace('[AS] handleBackspace → exitSubcommand')
      exitSubcommand()
    }
  }

  // ── 回调 ──

  let focusCallback: (() => void) | null = null

  function setFocusCallback(cb: () => void): void {
    focusCallback = cb
  }

  function focusInput(): void {
    void nextTick(() => focusCallback?.())
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
    isIdle,
    dispatch,
    handleSignal,
    doSearch,
    enterSubcommand,
    exitSubcommand,
    closeWebView,
    selectResult,
    handleEscape,
    handleBackspace,
    setFocusCallback,
    focusInput
  }
}

export function useAppState() {
  if (!instance) {
    instance = createAppState()
  }
  return instance
}
