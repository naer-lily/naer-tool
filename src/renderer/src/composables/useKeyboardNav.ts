import { type Ref } from 'vue'
import type { SearchResult } from '@shared/plugin-api'

interface KeyboardNavOptions {
  results: Ref<SearchResult[]>
  activeIndex: Ref<number>
  onSelect: (index: number) => void
  onEscape: () => void
}

export function useKeyboardNav(opts: KeyboardNavOptions) {
  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault()
      opts.onEscape()
      return
    }

    if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'j')) {
      e.preventDefault()
      if (opts.results.value.length > 0) {
        opts.activeIndex.value = Math.min(
          opts.activeIndex.value + 1,
          opts.results.value.length - 1
        )
      }
      return
    }

    if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'k')) {
      e.preventDefault()
      if (opts.results.value.length > 0) {
        opts.activeIndex.value = Math.max(opts.activeIndex.value - 1, 0)
      }
      return
    }

    if (e.key === 'Enter' && opts.results.value.length > 0) {
      e.preventDefault()
      opts.onSelect(opts.activeIndex.value)
      return
    }

    if (e.altKey && e.key >= '1' && e.key <= '9') {
      e.preventDefault()
      const idx = parseInt(e.key) - 1
      if (idx < opts.results.value.length) {
        opts.onSelect(idx)
      }
    }
  }

  return { onKeydown }
}
