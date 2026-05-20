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
import { reactive, onMounted, onBeforeUnmount } from 'vue'
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
}>({
  visible: false,
  x: 0,
  y: 0,
  items: [],
  pluginId: '',
  commandId: ''
})

function onContextMenu(payload: { index: number; x: number; y: number }) {
  const item = props.items[payload.index]
  if (!item?.contextMenu?.length) return

  menu.pluginId = item.pluginId
  menu.commandId = item.id
  menu.items = item.contextMenu
  menu.x = payload.x
  menu.y = payload.y
  menu.visible = true
}

function closeMenu() {
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

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
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
