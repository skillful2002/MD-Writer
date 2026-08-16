<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useSettingsStore } from '../../stores/settings';

const props = defineProps<{
  content: string;
}>();

const emit = defineEmits<{
  (e: 'update-content', content: string): void;
  (e: 'cursor', payload: { line: number; col: number; selectionText: string }): void;
}>();

const settingsStore = useSettingsStore();
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const gutterRef = ref<HTMLElement | null>(null);

// 行号栏：每行一个数字，行高与文本区严格一致以保证对齐
const lineCount = computed(() => Math.max(1, props.content.split('\n').length));
const lineNumbers = computed(() =>
  Array.from({ length: lineCount.value }, (_, i) => i + 1).join('\n'),
);

function handleInput(event: Event) {
  emit('update-content', (event.target as HTMLTextAreaElement).value);
  emitCursor();
}

function syncScroll() {
  if (gutterRef.value && textareaRef.value) {
    gutterRef.value.scrollTop = textareaRef.value.scrollTop;
  }
}

function emitCursor() {
  const ta = textareaRef.value;
  if (!ta) return;
  const pos = ta.selectionStart;
  const before = props.content.slice(0, pos);
  const line = before.split('\n').length;
  const lastNl = before.lastIndexOf('\n');
  const col = pos - lastNl;
  const selectionText =
    ta.selectionStart !== ta.selectionEnd
      ? props.content.slice(ta.selectionStart, ta.selectionEnd)
      : '';
  emit('cursor', { line, col, selectionText });
}

onMounted(emitCursor);
</script>

<template>
  <div class="h-full w-full flex" style="background-color: var(--bg-color)">
    <div
      v-if="settingsStore.settings.showLineNumbers"
      ref="gutterRef"
      class="source-gutter select-none overflow-hidden text-right pr-2 font-mono text-[11px]"
      style="
        width: 3.5rem;
        line-height: 1.75rem;
        padding-top: 1rem;
        white-space: pre;
        color: var(--muted-color);
        border-right: 1px solid var(--border-color);
        background-color: var(--sidebar-bg);
        opacity: 0.55;
        flex-shrink: 0;
      "
    >{{ lineNumbers }}</div>

    <textarea
      ref="textareaRef"
      class="flex-1 h-full w-full resize-none outline-none font-mono text-sm border-none"
      style="
        line-height: 1.75rem;
        padding: 1rem;
        color: var(--text-color);
        background-color: var(--bg-color);
      "
      :value="content"
      placeholder="在此输入 Markdown 源码..."
      @input="handleInput"
      @scroll="syncScroll"
      @click="emitCursor"
      @keyup="emitCursor"
      @select="emitCursor"
    ></textarea>
  </div>
</template>
