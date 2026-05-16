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
    />
    <p v-if="items.length === 0" class="placeholder">
      {{ emptyText }}
    </p>
  </div>
</template>

<script setup lang="ts">
import type { SearchResult } from '@shared/plugin-api'
import ResultItem from './ResultItem.vue'

withDefaults(defineProps<{
  items: SearchResult[]
  activeIndex: number
  emptyText?: string
}>(), {
  emptyText: '输入关键字搜索命令...'
})

defineEmits<{
  select: [index: number]
  'update:activeIndex': [index: number]
}>()
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
