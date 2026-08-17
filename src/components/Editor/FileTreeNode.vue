<script setup lang="ts">
import { computed } from 'vue';
import type { TreeNode } from '../../composables/useWorkspaceSession';
import { setTreeImageDragData, clearTreeImageDragData } from './tiptap/editor-image-tree-drop';
import appIcon from '../../assets/app-icon.png';

const props = withDefaults(
  defineProps<{
    node: TreeNode;
    currentFilePath: string | null;
    depth?: number;
    showToggle?: boolean;
  }>(),
  {
    depth: 0,
    showToggle: true,
  },
);

const emit = defineEmits<{
  (e: 'select', node: TreeNode, event: MouseEvent): void;
  (e: 'context-menu', event: MouseEvent, node: TreeNode): void;
}>();

const rowStyle = computed(() => {
  return {
    paddingLeft: `${props.depth * 14 + 8}px`,
  };
});

const rowClasses = computed(() =>
  props.node.path === props.currentFilePath
    ? 'bg-blue-50 text-blue-600 dark:bg-[var(--active-bg)] dark:text-[var(--text-secondary)] font-medium'
    : 'text-gray-600 hover:bg-gray-100 dark:text-[var(--muted-color)] dark:hover:bg-[var(--sidebar-hover)]',
);

const icon = computed(() => {
  if (props.node.is_dir) return props.node.expanded ? '📂' : '📁';
  if (props.node.is_md) return '📝';
  if (props.node.is_image) return '🖼️';
  return '📄';
});

function handleDragStart(event: DragEvent) {
  if (props.node.is_image) {
    setTreeImageDragData(event, props.node.path);
  }
}

function handleDragEnd() {
  clearTreeImageDragData();
}
</script>

<template>
  <div
    class="flex items-center py-1 pr-2 text-sm cursor-pointer transition-colors"
    :class="rowClasses"
    :style="rowStyle"
    :draggable="node.is_image"
    @click="emit('select', node, $event)"
    @contextmenu.prevent="emit('context-menu', $event, node)"
    @dragstart="handleDragStart"
    @dragend="handleDragEnd"
  >
    <span
      v-if="showToggle"
      class="w-3 flex-shrink-0 text-center mr-0.5 text-xs text-gray-400"
    >
      <template v-if="node.is_dir">{{ node.expanded ? '▾' : '▸' }}</template>
    </span>
    <span
      class="mr-1.5 flex-shrink-0 flex items-center justify-center w-4 h-4"
      :class="node.is_md ? 'bg-gray-700 rounded' : ''"
    >
      <img
        v-if="node.is_md"
        :src="appIcon"
        alt="markdown"
        class="w-3 h-3 object-contain"
        draggable="false"
      />
      <template v-else>{{ icon }}</template>
    </span>
    <span class="truncate text-sm">{{ node.name }}</span>
  </div>
</template>
