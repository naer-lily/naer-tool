import { onBeforeUnmount } from 'vue'
import { useViewState } from './useViewState'

export function useSearch() {
  const vs = useViewState()

  let toastCleanup: (() => void) | null = null

  toastCleanup = window.futariAPI.onToast((msg: string) => {
    vs.toast.value = msg
    setTimeout(() => {
      vs.toast.value = ''
    }, 2000)
  })

  const showWebViewCleanup = window.futariAPI.onShowWebView((payload) => {
    vs.handleShowWebView(payload)
  })

  const hideWebViewCleanup = window.futariAPI.onHideWebView(() => {
    /* state already updated synchronously in closeWebView */
  })

  const webViewReadyCleanup = window.futariAPI.onWebViewReady(() => {
    vs.handleWebViewReady()
  })

  onBeforeUnmount(() => {
    toastCleanup?.()
    showWebViewCleanup?.()
    hideWebViewCleanup?.()
    webViewReadyCleanup?.()
  })

  return {
    query: vs.query,
    results: vs.results,
    activeIndex: vs.activeIndex,
    toast: vs.toast,
    searchMode: vs.mode,
    activePluginId: vs.activePluginId,
    activePluginIcon: vs.activePluginIcon,
    webviewActive: vs.webviewActive,
    webviewLoading: vs.webviewLoading,
    webviewHeight: vs.webviewHeight,
    doSearch: vs.doSearch,
    selectResult: vs.selectResult,
    exitSubcommand: vs.exitSubcommand,
    enterSubcommand: vs.enterSubcommand,
    closeWebView: vs.closeWebView,
    handleEscape: vs.handleEscape,
    handleBackspace: vs.handleBackspace,
    handleFocusInput: vs.handleFocusInput,
    handleAutoActivate: vs.handleAutoActivate
  }
}
