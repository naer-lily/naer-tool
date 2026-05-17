<template>
  <div class="search-container" :class="{ 'webview-mode': webviewActive }">
    <div class="header">
      <SearchInput
        v-model="query"
        :prefix-icon="activePluginIcon"
        @input="onInput"
        @keydown="onKeydown"
      />
    </div>

    <div class="mode-bar" v-if="!webviewActive && searchMode === 'subcommand'">
      <span class="mode-icon">
        <img v-if="isModeImg" :src="activePluginIcon || ''" class="mode-img">
        <span v-else v-html="activePluginIcon"></span>
      </span>
      子命令模式 · 退格清空返回
    </div>

    <div v-if="webviewActive" class="webview-placeholder" :style="{ minHeight: Math.max(0, webviewHeight - 12) + 'px' }">
      <div v-if="webviewLoading" class="webview-loading">
        <span class="loading-spinner"></span>
        加载中...
      </div>
    </div>

    <div v-if="webviewActive && !webviewLoading" class="webview-bottom"></div>

    <ResultList v-else
      :items="results"
      :active-index="activeIndex"
      @select="selectResult"
      @update:active-index="activeIndex = $event"
    />

    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, computed, nextTick } from 'vue'
import SearchInput from '@/components/SearchInput.vue'
import ResultList from '@/components/ResultList.vue'
import { useSearch } from '@/composables/useSearch'
import { useKeyboardNav } from '@/composables/useKeyboardNav'
import { useTheme } from '@/composables/useTheme'

const { theme, toggle } = useTheme()
const { query, results, activeIndex, toast, doSearch, selectResult, searchMode, activePluginIcon, exitSubcommand, enterSubcommand, webviewActive, webviewLoading, webviewHeight, closeWebView } = useSearch()

const isModeImg = computed(() => /^(data:image|https?:)/.test(activePluginIcon.value || ''))

function handleEscape(): void {
  if (webviewActive.value) {
    closeWebView()
    return
  }
  if (searchMode.value === 'subcommand') {
    exitSubcommand()
  } else {
    window.futariAPI.closeWindow()
  }
}

const { onKeydown: navKeydown } = useKeyboardNav({
  results,
  activeIndex,
  onSelect: selectResult,
  onEscape: handleEscape
})

function onInput(): void {
  doSearch()
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Backspace' && !query.value) {
    if (webviewActive.value) {
      e.preventDefault()
      closeWebView()
      return
    }
    if (searchMode.value === 'subcommand') {
      e.preventDefault()
      exitSubcommand()
      return
    }
  }
  navKeydown(e)
}

onMounted(() => {
  doSearch()
  window.futariAPI.onFocusInput(() => {
    if (webviewActive.value) return
    exitSubcommand()
    query.value = ''
    nextTick(() => doSearch())
  })
  window.futariAPI.onToggleTheme(() => {
    toggle()
  })
  window.futariAPI.onAutoActivate((pluginId: string, icon?: string) => {
    if (webviewActive.value) return
    enterSubcommand(pluginId, icon)
  })
})
</script>

<style>
@import '@/styles/variables.css';
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

.search-container.webview-mode {
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.search-container.webview-mode .header {
  background: var(--bg-primary);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border-bottom: 1px solid var(--border-primary);
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
  display: flex;
  align-items: center;
  gap: 4px;
}
.mode-icon {
  display: inline-flex;
  align-items: center;
}
.mode-img {
  width: 14px;
  height: 14px;
  object-fit: contain;
}
.mode-bar :deep(svg) {
  width: 14px;
  height: 14px;
}

.webview-placeholder {
  flex: 1;
  background: transparent;
  -webkit-app-region: no-drag;
  user-select: none;
}

.webview-bottom {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 12px;
  background: var(--bg-primary);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border-radius: 0 0 12px 12px;
  pointer-events: none;
  z-index: 1;
}

.webview-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 0;
  color: var(--text-hint);
  font-size: 13px;
}

.loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border-divider);
  border-top-color: var(--text-hint);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
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
