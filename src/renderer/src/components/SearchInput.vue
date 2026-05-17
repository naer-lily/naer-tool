<template>
  <div class="search-input" @click="focusInput">
    <span v-if="prefixIcon" class="prefix-chip">
      <img v-if="isImg" :src="prefixIcon" class="chip-img">
      <span v-else v-html="prefixIcon"></span>
    </span>
    <input
      ref="inputEl"
      :value="modelValue"
      :placeholder="prefixIcon ? '子命令...' : placeholder"
      class="input-field"
      @input="onInput"
      @keydown="$emit('keydown', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  prefixIcon?: string | null
}>(), {
  placeholder: '输入命令...'
})

const isImg = computed(() => /^(data:image|https?:)/.test(props.prefixIcon || ''))

const emit = defineEmits<{
  'update:modelValue': [value: string]
  keydown: [e: KeyboardEvent]
}>()

const inputEl = ref<HTMLInputElement | null>(null)

function onInput(e: Event): void {
  const target = e.target as HTMLInputElement
  emit('update:modelValue', target.value)
}

function focusInput(): void {
  nextTick(() => {
    inputEl.value?.focus()
  })
}

defineExpose({ focusInput })

onMounted(() => {
  focusInput()
})
</script>

<style scoped>
.search-input {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-divider);
}

.prefix-chip {
  flex-shrink: 0;
  font-size: 16px;
  line-height: 26px;
  margin-right: 8px;
  padding: 0 8px;
  border-radius: 5px;
  background: var(--bg-hover);
  display: inline-flex;
  align-items: center;
}
.prefix-chip .chip-img {
  width: 18px;
  height: 18px;
  object-fit: contain;
}
.prefix-chip :deep(svg) {
  width: 18px;
  height: 18px;
}

.input-field {
  flex: 1;
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-size: 15px;
  line-height: 26px;
  font-family: var(--font-family);
}

.input-field::placeholder {
  color: var(--text-placeholder);
}
</style>
