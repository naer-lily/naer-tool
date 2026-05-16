<template>
  <div class="search-container">
    <div class="header">
      <SearchInput
        v-model="query"
        :prefix-icon="activePluginIcon"
        @input="doSearch"
        @keydown="onKeydown"
      />
    </div>

    <div class="mode-bar" v-if="searchMode === 'subcommand'">
      {{ activePluginIcon }} 子命令模式 · 退格清空返回
    </div>

    <ResultList
      :items="results"
      :active-index="activeIndex"
      @select="selectResult"
      @update:active-index="activeIndex = $event"
    />

    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, nextTick } from 'vue'
import SearchInput from './components/SearchInput.vue'
import ResultList from './components/ResultList.vue'
import { useSearch } from './composables/useSearch'
import { useKeyboardNav } from './composables/useKeyboardNav'
import { useTheme } from './composables/useTheme'

const { theme, toggle } = useTheme()
const { query, results, activeIndex, toast, doSearch, selectResult, searchMode, activePluginIcon, exitSubcommand } = useSearch()

function handleEscape(): void {
  if (searchMode.value === 'subcommand') {
    exitSubcommand()
  } else {
    window.naerAPI.closeWindow()
  }
}

const { onKeydown: navKeydown } = useKeyboardNav({
  results,
  activeIndex,
  onSelect: selectResult,
  onEscape: handleEscape
})

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Backspace' && searchMode.value === 'subcommand' && !query.value) {
    e.preventDefault()
    exitSubcommand()
    return
  }
  navKeydown(e)
}

onMounted(() => {
  doSearch()
  window.naerAPI.onFocusInput(() => {
    exitSubcommand()
    query.value = ''
    nextTick(() => doSearch())
  })
  window.naerAPI.onToggleTheme(() => {
    toggle()
  })
})
</script>

<style>
@import './styles/variables.css';
</style>

<style scoped>
.search-container {
  position: relative;
  width: 648px;
  background: var(--bg-primary);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid var(--border-primary);
  border-radius: 12px;
  box-shadow: var(--shadow);
  overflow: hidden;
}

.header {
  display: flex;
  align-items: center;
}

.header > :first-child {
  flex: 1;
}

.toast {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--toast-bg);
  color: var(--toast-text);
  font-size: 12px;
  padding: 5px 14px;
  border-radius: 5px;
  white-space: nowrap;
  pointer-events: none;
}

.mode-bar {
  padding: 4px 16px;
  font-size: 11px;
  color: var(--text-hint);
  border-bottom: 1px solid var(--border-divider);
}
</style>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: var(--font-family);
  background: transparent;
  overflow: hidden;
  user-select: none;
}

#app {
  width: 100vw;
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 16px;
}
</style>
