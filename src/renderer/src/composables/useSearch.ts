import { ref, onBeforeUnmount } from 'vue'
import type { SearchResult } from '@shared/plugin-api'

export function useSearch() {
  const query = ref('')
  const results = ref<SearchResult[]>([])
  const activeIndex = ref(0)
  const toast = ref('')

  const searchMode = ref<'main' | 'subcommand'>('main')
  const activePluginId = ref<string | null>(null)
  const activePluginIcon = ref<string | null>(null)

  const webviewActive = ref(false)
  const webviewLoading = ref(false)

  let toastCleanup: (() => void) | null = null
  let showWebViewCleanup: (() => void) | null = null
  let hideWebViewCleanup: (() => void) | null = null
  let webViewReadyCleanup: (() => void) | null = null

  toastCleanup = window.futariAPI.onToast((msg: string) => {
    toast.value = msg
    setTimeout(() => {
      toast.value = ''
    }, 2000)
  })

  showWebViewCleanup = window.futariAPI.onShowWebView(() => {
    webviewActive.value = true
    webviewLoading.value = true
    results.value = []
    activeIndex.value = 0
  })

  hideWebViewCleanup = window.futariAPI.onHideWebView(() => {
    webviewActive.value = false
    webviewLoading.value = false
  })

  webViewReadyCleanup = window.futariAPI.onWebViewReady(() => {
    webviewLoading.value = false
  })

  onBeforeUnmount(() => {
    toastCleanup?.()
    showWebViewCleanup?.()
    hideWebViewCleanup?.()
    webViewReadyCleanup?.()
  })

  async function enterSubcommand(pluginId: string, icon?: string): Promise<void> {
    searchMode.value = 'subcommand'
    activePluginId.value = pluginId
    activePluginIcon.value = icon || null
    query.value = ''
    results.value = (await window.futariAPI.search('', pluginId)).results
    activeIndex.value = 0
  }

  async function doSearch(): Promise<void> {
    if (webviewActive.value) {
      window.futariAPI.webViewInput(query.value)
      return
    }

    const text = query.value.trim()

    if (searchMode.value === 'subcommand') {
      results.value = (await window.futariAPI.search(text, activePluginId.value!)).results
      activeIndex.value = 0
      return
    }

    const response = await window.futariAPI.search(text)

    if (response.mode === 'subcommand') {
      await enterSubcommand(response.pluginId!, response.pluginIcon)
    } else {
      results.value = response.results
      activeIndex.value = 0
    }
  }

  function exitSubcommand(): void {
    searchMode.value = 'main'
    activePluginId.value = null
    activePluginIcon.value = null
    query.value = ''
    doSearch()
  }

  function closeWebView(): void {
    window.futariAPI.closeWebView()
    searchMode.value = 'main'
    activePluginId.value = null
    activePluginIcon.value = null
    query.value = ''
    results.value = []
    activeIndex.value = 0
  }

  async function selectResult(index: number): Promise<void> {
    const item = results.value[index]
    if (!item) return

    if (item.prefixEntry) {
      await enterSubcommand(item.pluginId, item.icon)
      return
    }

    await window.futariAPI.execute(item.pluginId, item.id, query.value)
    query.value = ''
    results.value = []
    activeIndex.value = 0
    if (searchMode.value === 'subcommand') {
      exitSubcommand()
    }
  }

  return {
    query, results, activeIndex, toast,
    searchMode, activePluginId, activePluginIcon,
    webviewActive, webviewLoading,
    doSearch, selectResult, exitSubcommand, enterSubcommand, closeWebView
  }
}
