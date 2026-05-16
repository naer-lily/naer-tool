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

  let toastCleanup: (() => void) | null = null

  toastCleanup = window.naerAPI.onToast((msg: string) => {
    toast.value = msg
    setTimeout(() => {
      toast.value = ''
    }, 2000)
  })

  onBeforeUnmount(() => {
    toastCleanup?.()
  })

  async function doSearch(): Promise<void> {
    const text = query.value.trim()

    if (searchMode.value === 'subcommand') {
      results.value = (await window.naerAPI.search(text, activePluginId.value!)).results
      activeIndex.value = 0
      return
    }

    const response = await window.naerAPI.search(text)

    if (response.mode === 'subcommand') {
      searchMode.value = 'subcommand'
      activePluginId.value = response.pluginId!
      activePluginIcon.value = response.pluginIcon || null
      query.value = ''
      results.value = response.results
    } else {
      results.value = response.results
    }

    activeIndex.value = 0
  }

  function exitSubcommand(): void {
    searchMode.value = 'main'
    activePluginId.value = null
    activePluginIcon.value = null
    query.value = ''
    results.value = []
    activeIndex.value = 0
    doSearch()
  }

  async function selectResult(index: number): Promise<void> {
    const item = results.value[index]
    if (!item) return

    if (item.prefixEntry) {
      query.value = item.prefixEntry
      await doSearch()
      return
    }

    await window.naerAPI.execute(item.pluginId, item.id, query.value)
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
    doSearch, selectResult, exitSubcommand
  }
}
