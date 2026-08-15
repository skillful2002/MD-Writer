<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { getFileManagerName } from '../../utils/platform';
import type { TreeNode } from '../../composables/useWorkspaceSession';

export interface SidebarContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  node: TreeNode | null;
}

export interface SidebarFolderMenuState {
  visible: boolean;
  x: number;
  y: number;
  /** 触发器（当前文件夹按钮）矩形，用于把菜单定位在名称正上方并左对齐。 */
  rect: { left: number; top: number; width: number; height: number } | null;
}

const props = defineProps<{
  contextMenu: SidebarContextMenuState;
  folderMenu: SidebarFolderMenuState;
}>();

const emit = defineEmits<{
  (e: 'rename'): void;
  (e: 'reveal'): void;
  (e: 'delete'): void;
  (e: 'new-file'): void;
  (e: 'new-folder'): void;
  (e: 'reveal-folder'): void;
  (e: 'close-folder'): void;
}>();

// ── 视口自适应定位 ──────────────────────────────────────────────
// 触发器（尤其是底部「当前文件夹」按钮）靠近窗口边缘时，菜单默认向下/向右
// 展开会溢出视口被裁掉。这里在菜单显示后测量尺寸，超界则向上翻转 / 向左移。
const contextMenuEl = ref<HTMLElement | null>(null);
const folderMenuEl = ref<HTMLElement | null>(null);

const contextMenuPos = ref({ left: 0, top: 0 });
const folderMenuPos = ref({ left: 0, top: 0 });

function fitToViewport(el: HTMLElement | null, x: number, y: number) {
  const margin = 8;
  let left = x;
  let top = y;
  const width = el?.getBoundingClientRect().width ?? 160;
  const height = el?.getBoundingClientRect().height ?? 120;
  if (left + width > window.innerWidth - margin) {
    left = Math.max(margin, window.innerWidth - margin - width);
  }
  if (top + height > window.innerHeight - margin) {
    top = Math.max(margin, window.innerHeight - margin - height);
  }
  return { left, top };
}

// 文件夹菜单：锚定在触发器按钮正上方、左边缘对齐按钮左边缘。
// 顶部空间不足时翻转到按钮下方，再做视口夹紧。
function positionFolderMenu(
  el: HTMLElement | null,
  rect: { left: number; top: number; width: number; height: number },
) {
  const margin = 8;
  const gap = 6;
  const width = el?.getBoundingClientRect().width ?? 180;
  const height = el?.getBoundingClientRect().height ?? 90;
  let left = rect.left;
  let top = rect.top - height - gap; // 默认显示在按钮上方
  if (top < margin) {
    // 上方放不下则翻转到按钮下方
    top = rect.top + rect.height + gap;
  }
  if (left + width > window.innerWidth - margin) {
    left = Math.max(margin, window.innerWidth - margin - width);
  }
  if (left < margin) left = margin;
  if (top + height > window.innerHeight - margin) {
    top = Math.max(margin, window.innerHeight - margin - height);
  }
  return { left, top };
}

watch(
  () => props.contextMenu.visible,
  (visible) => {
    if (!visible) return;
    contextMenuPos.value = { left: props.contextMenu.x, top: props.contextMenu.y };
    nextTick(() => {
      contextMenuPos.value = fitToViewport(
        contextMenuEl.value,
        props.contextMenu.x,
        props.contextMenu.y,
      );
    });
  },
);

watch(
  () => props.folderMenu.visible,
  (visible) => {
    if (!visible) return;
    const rect = props.folderMenu.rect;
    // 先放到触发器位置避免测量前的闪烁，随后按矩形精确定位到上方
    folderMenuPos.value = rect
      ? { left: rect.left, top: rect.top }
      : { left: props.folderMenu.x, top: props.folderMenu.y };
    nextTick(() => {
      folderMenuPos.value = rect
        ? positionFolderMenu(folderMenuEl.value, rect)
        : fitToViewport(folderMenuEl.value, props.folderMenu.x, props.folderMenu.y);
    });
  },
);
</script>

<template>
  <Teleport to="body">
    <div
      v-if="contextMenu.visible"
      ref="contextMenuEl"
      class="context-menu"
      :style="{ left: contextMenuPos.left + 'px', top: contextMenuPos.top + 'px' }"
    >
      <div v-if="contextMenu.node" class="context-menu-items">
        <div class="context-menu-item" @click="emit('new-file')">
          <span class="context-menu-icon">📄</span>
          <span>新建文件</span>
        </div>
        <div class="context-menu-item" @click="emit('new-folder')">
          <span class="context-menu-icon">📁</span>
          <span>新建文件夹</span>
        </div>
        <div class="context-menu-item" @click="emit('rename')">
          <span class="context-menu-icon">✏️</span>
          <span>重命名</span>
        </div>
        <div class="context-menu-item" @click="emit('reveal')">
          <span class="context-menu-icon">📂</span>
          <span>在 {{ getFileManagerName() }} 中显示</span>
        </div>
        <div class="context-menu-item context-menu-item-danger" @click="emit('delete')">
          <span class="context-menu-icon">🗑️</span>
          <span>删除</span>
        </div>
      </div>
    </div>

    <div
      v-if="folderMenu.visible"
      ref="folderMenuEl"
      class="context-menu"
      :style="{ left: folderMenuPos.left + 'px', top: folderMenuPos.top + 'px' }"
    >
      <div class="context-menu-items">
        <div class="context-menu-item" @click="emit('reveal-folder')">
          <span class="context-menu-icon">
            <svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
              <path d="M2 10h20" />
            </svg>
          </span>
          <span>在 {{ getFileManagerName() }} 中显示</span>
        </div>
        <div class="context-menu-item" @click="emit('close-folder')">
          <span class="context-menu-icon">
            <svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </span>
          <span>关闭文件夹</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.context-menu {
  position: fixed;
  z-index: 1000;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  min-width: 140px;
  padding: 4px 0;
  color: var(--text-color);
}

.context-menu-items {
  display: flex;
  flex-direction: column;
}

.context-menu-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  font-size: 13px;
  color: inherit;
  cursor: pointer;
  transition: background-color 0.1s;
}

.context-menu-item:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

.dark .context-menu-item:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.context-menu-item-danger {
  color: #dc2626;
}

.context-menu-item-danger:hover {
  background-color: #fef2f2;
}

.dark .context-menu-item-danger:hover {
  background-color: #450a0a;
}

.context-menu-icon {
  margin-right: 8px;
  font-size: 14px;
  display: inline-flex;
  align-items: center;
}

.menu-icon {
  width: 16px;
  height: 16px;
  display: block;
}
</style>
