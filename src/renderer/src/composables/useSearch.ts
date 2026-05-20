import { onBeforeUnmount } from 'vue'
import { useAppState } from './useAppState'

export function useSearch() {
  const as = useAppState()

  let toastCleanup: (() => void) | null = null
  let appEventCleanup: (() => void) | null = null

  toastCleanup = window.futariAPI.onToast((msg: string) => {
    as.toast.value = msg
    setTimeout(() => {
      as.toast.value = ''
    }, 2000)
  })

  appEventCleanup = window.futariAPI.onAppEvent((payload) => {
    as.handleSignal(payload)
  })

  onBeforeUnmount(() => {
    toastCleanup?.()
    appEventCleanup?.()
  })

  return {
    query: as.query,
    results: as.results,
    activeIndex: as.activeIndex,
    toast: as.toast,
    searchMode: as.mode,
    activePluginId: as.activePluginId,
    activePluginIcon: as.activePluginIcon,
    isIdle: as.isIdle,
    webviewActive: as.webviewActive,
    webviewLoading: as.webviewLoading,
    webviewHeight: as.webviewHeight,
    doSearch: as.doSearch,
    selectResult: as.selectResult,
    exitSubcommand: as.exitSubcommand,
    enterSubcommand: as.enterSubcommand,
    closeWebView: as.closeWebView,
    handleEscape: as.handleEscape,
    handleBackspace: as.handleBackspace,
    setFocusCallback: as.setFocusCallback,
    focusInput: as.focusInput
  }
}
