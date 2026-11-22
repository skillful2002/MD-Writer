<template>
  <div
    class="panel-resizer"
    :class="{ 'panel-resizer-active': active }"
    :style="{ width: RESIZER_WIDTH + 'px' }"
    role="separator"
    aria-orientation="vertical"
    :aria-label="ariaLabel"
    tabindex="0"
    @mousedown="onMouseDown"
    @dblclick="onDoubleClick"
    @keydown="onKeyDown"
  >
    <span class="panel-resizer-line" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RESIZER_WIDTH, type PanelSide } from '../../composables/usePanelResize';

const props = defineProps<{
  side: PanelSide;
  active: boolean;
}>();

const emit = defineEmits<{
  (e: 'start', event: MouseEvent): void;
  (e: 'reset'): void;
  (e: 'nudge', delta: number): void;
}>();

const ariaLabel = computed(() =>
  props.side === 'sidebar'
    ? '拖动调整文件列表宽度，双击恢复默认，方向键微调'
    : '拖动调整大纲宽度，双击恢复默认，方向键微调',
);

function onMouseDown(event: MouseEvent) {
  emit('start', event);
}

function onDoubleClick() {
  emit('reset');
}

function onKeyDown(event: KeyboardEvent) {
  const step = event.shiftKey ? 48 : 16;
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    emit('nudge', -step);
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    emit('nudge', step);
  }
}
</script>

<style scoped>
.panel-resizer {
  position: relative;
  flex-shrink: 0;
  cursor: col-resize;
  outline: none;
  /* 与相邻面板同色，视觉上不引入一条额外留白 */
  background-color: var(--sidebar-bg);
  transition: background-color 0.15s ease;
  touch-action: none;
}

.panel-resizer-line {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 1px;
  transform: translateX(-50%);
  background-color: transparent;
  transition: background-color 0.15s ease;
}

.panel-resizer:hover,
.panel-resizer:focus-visible,
.panel-resizer-active {
  background-color: var(--primary-light);
}

.panel-resizer:hover .panel-resizer-line,
.panel-resizer:focus-visible .panel-resizer-line,
.panel-resizer-active .panel-resizer-line {
  background-color: var(--primary-color);
}
</style>
