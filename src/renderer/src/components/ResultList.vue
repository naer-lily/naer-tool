<template>
  <div class="result-area">
    <ResultItem
      v-for="(item, index) in items"
      :key="item.id"
      :item="item"
      :active="index === activeIndex"
      :index="index"
      @select="$emit('select', $event)"
      @hover="$emit('update:activeIndex', $event)"
      @contextmenu="onContextMenu"
    />
    <p v-if="items.length === 0" class="placeholder">
      {{ emptyText }}
    </p>
    <Teleport to="body">
      <div v-if="menu.visible" class="ctx-overlay" @click="closeMenu" @contextmenu.prevent="closeMenu">
        <div
          class="ctx-menu"
          :style="{ left: menu.x + 'px', top: menu.y + 'px' }"
          @click.stop
        >
          <template v-for="(mi, i) in menu.items" :key="i">
            <div v-if="mi.separator" class="ctx-separator" />
            <div v-else class="ctx-item" @click="onMenuItem(mi)">
              <span class="ctx-icon" v-html="mi.icon || ''"></span>
              <span class="ctx-label">{{ mi.label }}</span>
            </div>
          </template>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
/**
 * ── 架构违规警告 ──
 *
 * 本文件直接监听 onAppEvent / 直接调用 resizeWindow，绕过了 useAppState 状态机抽象层。
 * 右键菜单的 visible 状态、高度变更、信号处理均应属于状态机的职责。
 *
 * 当前通过 blur/shortcut 信号的临时监听来弥补上下文菜单残留，
 * 但正确的做法是将 contextMenu 状态提升至 useAppState，统一在 handleSignal 中处置。
 *
 * ⛔ 不要参考本文件的实现模式。  TODO: 等待重构。
 */
import { reactive, nextTick, onMounted, onBeforeUnmount } from 'vue'
import type { SearchResult, ContextMenuItem } from '@shared/plugin-api'
import ResultItem from '@/components/ResultItem.vue'

const props = withDefaults(defineProps<{
  items: SearchResult[]
  activeIndex: number
  emptyText?: string
}>(), {
  emptyText: '输入关键字搜索命令...'
})

const emit = defineEmits<{
  select: [index: number]
  'update:activeIndex': [index: number]
  contextAction: [payload: { pluginId: string; commandId: string; actionId: string }]
}>()

const menu = reactive<{
  visible: boolean
  x: number
  y: number
  items: ContextMenuItem[]
  pluginId: string
  commandId: string
  savedWindowHeight: number
}>({
  visible: false,
  x: 0,
  y: 0,
  items: [],
  pluginId: '',
  commandId: '',
  savedWindowHeight: 0
})

function onContextMenu(payload: { index: number; x: number; y: number }) {
  const item = props.items[payload.index]
  if (!item?.contextMenu?.length) return

  menu.pluginId = item.pluginId
  menu.commandId = item.id
  menu.items = item.contextMenu
  menu.x = payload.x
  menu.y = payload.y
  menu.savedWindowHeight = window.innerHeight
  menu.visible = true

  void nextTick(() => {
    const menuEl = document.querySelector('.ctx-menu')
    if (!menuEl) return
    const rect = menuEl.getBoundingClientRect()

    const rightOverflow = rect.right - window.innerWidth
    if (rightOverflow > 0) {
      menu.x = Math.max(0, menu.x - rightOverflow - 8)
    }

    const bottomOverflow = (rect.bottom + 8) - window.innerHeight
    if (bottomOverflow > 0) {
      window.futariAPI.resizeWindow(window.innerHeight + bottomOverflow)
    }
  })
}

function closeMenu() {
  if (menu.savedWindowHeight > 0 && menu.savedWindowHeight < window.innerHeight) {
    window.futariAPI.resizeWindow(menu.savedWindowHeight)
  }
  menu.savedWindowHeight = 0
  menu.visible = false
}

function onMenuItem(mi: ContextMenuItem) {
  if (!mi.id) return
  emit('contextAction', {
    pluginId: menu.pluginId,
    commandId: menu.commandId,
    actionId: mi.id
  })
  closeMenu()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    closeMenu()
  }
}

let unsubAppEvent: (() => void) | null = null

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  unsubAppEvent = window.futariAPI.onAppEvent((payload) => {
    if (payload.type === 'window-blurred' || payload.type === 'shortcut-pressed' || payload.type === 'tray-clicked') {
      closeMenu()
    }
  })
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  unsubAppEvent?.()
})
</script>

<style scoped>
.result-area {
  min-height: 40px;
}

.placeholder {
  color: var(--text-hint);
  font-size: 13px;
  text-align: center;
  padding: 28px 16px;
}
</style>
