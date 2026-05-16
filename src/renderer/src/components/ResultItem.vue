<template>
  <div
    :class="['result-item', { active }]"
    @click="$emit('select', index)"
    @mouseenter="$emit('hover', index)"
  >
    <span class="item-icon" v-html="item.icon || '&#x1F4E6;'"></span>
    <span class="item-preview">{{ item.preview }}</span>
    <span class="item-name">{{ item.name }}</span>
    <span class="item-shortcut">Alt+{{ item.shortcutIndex + 1 }}</span>
  </div>
</template>

<script setup lang="ts">
import type { SearchResult } from '@shared/plugin-api'

defineProps<{
  item: SearchResult
  active: boolean
  index: number
}>()

defineEmits<{
  select: [index: number]
  hover: [index: number]
}>()
</script>

<style scoped>
.result-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 16px;
  cursor: pointer;
  transition: background 0.08s;
}

.result-item.active {
  background: var(--bg-active);
}

.item-icon {
  font-size: 17px;
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  text-align: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.item-icon :deep(svg) {
  width: 18px;
  height: 18px;
}

.item-preview {
  color: var(--text-secondary);
  font-size: 13px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-name {
  color: var(--text-primary);
  font-size: 13px;
  flex-shrink: 0;
}

.item-shortcut {
  color: var(--badge-text);
  font-size: 10px;
  background: var(--badge-bg);
  padding: 1px 6px;
  border-radius: 3px;
  flex-shrink: 0;
}
</style>
