<template>
  <div ref="containerRef" class="search-container" :class="{ 'webview-mode': webviewActive }">
    <div class="header">
      <SearchInput
        ref="searchInputRef"
        v-model="query"
        :prefix-icon="activePluginIcon"
        @input="onInput"
        @keydown="onKeydown"
        @prefix-click="handleBackspace"
      />
    </div>

    <div class="mode-bar" v-if="!webviewActive && searchMode === 'subcommand'">
      <span class="mode-icon">
        <img v-if="isModeImg" :src="activePluginIcon || ''" class="mode-img">
        <span v-else v-html="activePluginIcon"></span>
      </span>
      子命令模式 · 退格清空返回
    </div>

    <div v-if="webviewActive" class="webview-placeholder" :style="{ minHeight: Math.max(0, webviewHeight - 16) + 'px' }">
      <div v-if="webviewLoading" class="webview-loading">
        <span class="loading-spinner"></span>
        加载中...
      </div>
    </div>

    <ResultList v-else
      :items="results"
      :active-index="activeIndex"
      @select="onSelect"
      @update:active-index="activeIndex = $event"
      @context-action="onContextAction"
    />

    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import SearchInput from '@/components/SearchInput.vue'
import ResultList from '@/components/ResultList.vue'
import { useSearch } from '@/composables/useSearch'
import { useKeyboardNav } from '@/composables/useKeyboardNav'
import { useTheme } from '@/composables/useTheme'

const { toggle, init: initTheme, setTheme } = useTheme()
const {
  query, results, activeIndex, toast,
  searchMode, activePluginIcon,
  webviewActive, webviewLoading, webviewHeight, isIdle,
  doSearch, selectResult,
  handleEscape, handleBackspace, setFocusCallback
} = useSearch()

const searchInputRef = ref<InstanceType<typeof SearchInput> | null>(null)
const containerRef = ref<HTMLElement | null>(null)
let resizeObserver: ResizeObserver | null = null
const isModeImg = computed(() => /^(data:image|https?:)/.test(activePluginIcon.value || ''))

const { onKeydown: navKeydown } = useKeyboardNav({
  results,
  activeIndex,
  onSelect: selectResult,
  onEscape: handleEscape
})

async function onSelect(index: number): Promise<void> {
  await selectResult(index)
  void nextTick(() => searchInputRef.value?.focusInput())
}

function onInput(): void {
  void doSearch()
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Backspace' && !query.value) {
    e.preventDefault()
    handleBackspace()
    return
  }
  navKeydown(e)
}

async function onContextAction(payload: { pluginId: string; commandId: string; actionId: string }): Promise<void> {
  await window.futariAPI.contextAction(payload.pluginId, payload.commandId, payload.actionId, query.value)
}

onMounted(() => {
  initTheme()
  void window.futariAPI.getConfig().then(cfg => {
    const t = cfg.theme
    if (t === 'light' || t === 'dark') {
      setTheme(t)
    }
  })

  setFocusCallback(() => {
    void nextTick(() => searchInputRef.value?.focusInput())
  })
  void doSearch()
  window.futariAPI.onToggleTheme(() => toggle())

  resizeObserver = new ResizeObserver(() => {
    if (containerRef.value && !webviewActive.value && !isIdle.value) {
      const h = containerRef.value.getBoundingClientRect().height + 16
      window.futariAPI.resizeWindow(h)
    }
  })
  if (containerRef.value) {
    resizeObserver.observe(containerRef.value)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})
</script>

<style>
@import '@/styles/variables.css';
</style>

<style scoped>
.search-container {
  position: relative;
  width: calc(100vw - 32px);
  background: var(--bg-primary);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid var(--border-primary);
  border-radius: 12px;
  box-shadow: var(--shadow);
  overflow: hidden;
  padding-bottom: 16px;
}

.search-container.webview-mode {
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  border-bottom: none;
  padding-bottom: 0;
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

.ctx-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: transparent;
}

.ctx-menu {
  position: fixed;
  z-index: 10000;
  background: var(--bg-primary);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  padding: 4px;
  min-width: 180px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  font-family: var(--font-family);
}

.ctx-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-primary);
  transition: background 0.08s;
}

.ctx-item:hover {
  background: var(--bg-active);
}

.ctx-icon {
  font-size: 15px;
  width: 20px;
  text-align: center;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.ctx-icon :deep(svg) {
  width: 16px;
  height: 16px;
}

.ctx-label {
  flex: 1;
  white-space: nowrap;
}

.ctx-separator {
  height: 1px;
  background: var(--border-divider);
  margin: 4px 8px;
}
</style>
