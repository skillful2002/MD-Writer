<template>
  <div
    class="sidebar-container h-full flex flex-col select-none border-r"
    style="background-color: var(--sidebar-bg); border-color: var(--border-color)"
  >
    <SidebarFilesPanel
      :root-folder="rootFolder"
      :root-folder-name="rootFolderName"
      :search-query="searchQuery"
      :search-results="searchResults"
      :flat-tree="flatTree"
      :current-file-path="currentFilePath"
      :recent-folders="recentFolders"
      :recent-files="recentFiles"
      @update-search-query="searchQuery = $event"
      @open-folder="$emit('open-folder')"
      @open-recent="$emit('open-recent', $event)"
      @open-recent-file="$emit('open-recent-file', $event)"
      @select-node="handleNodeClick"
      @context-menu="showContextMenu"
      @new-markdown="$emit('new-markdown')"
      @folder-menu="showFolderMenu"
    />

    <SidebarMenus
      :context-menu="contextMenu"
      :folder-menu="folderMenu"
      @rename="handleRename"
      @reveal="handleRevealInFinder"
      @delete="handleDelete"
      @new-file="handleNewFileInContext"
      @new-folder="handleNewFolderInContext"
      @reveal-folder="handleRevealFolder"
      @close-folder="handleCloseFolderMenu"
    />

    <SidebarFileDialogs
      :rename-dialog="renameDialog"
      :new-dialog="newDialog"
      @close-rename="renameDialog.visible = false"
      @update-rename-name="renameDialog.newName = $event"
      @confirm-rename="confirmRename"
      @close-new="newDialog.visible = false"
      @update-new-name="newDialog.name = $event"
      @confirm-new="confirmNew"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue';
import type { TreeNode } from '../../composables/useWorkspaceSession';
import type { RecentFile, RecentFolder } from '../../services/tauri/history-store';
import { confirm } from '../../services/tauri/dialog';
import { dirname } from '../../utils/path';
import SidebarFileDialogs from './SidebarFileDialogs.vue';
import SidebarFilesPanel from './SidebarFilesPanel.vue';
import SidebarMenus from './SidebarMenus.vue';

const props = defineProps<{
  treeNodes: TreeNode[];
  rootFolder: string | null;
  currentFilePath: string | null;
  pendingRenamePath?: string | null;
  recentFolders: RecentFolder[];
  recentFiles: RecentFile[];
}>();

const emit = defineEmits<{
  (e: 'open-folder'): void;
  (e: 'open-recent', path: string): void;
  (e: 'open-recent-file', path: string): void;
  (e: 'open-file', path: string): void;
  (e: 'open-image', path: string): void;
  (e: 'open-file-in-new-window', path: string): void;
  (e: 'toggle-dir', path: string): void;
  (e: 'refresh-files'): void;
  (e: 'file-renamed', oldPath: string, newName: string): void;
  (e: 'file-deleted', path: string): void;
  (e: 'file-created', name: string, isFolder: boolean, targetDir?: string | null): void;
  (e: 'reveal-in-finder', path: string): void;
  (e: 'rename-completed'): void;
  (e: 'new-markdown'): void;
  (e: 'close-folder'): void;
}>();

const searchQuery = ref('');

// ── 树扁平化 ──────────────────────────────────────────────────

function flatten(nodes: TreeNode[], depth = 0): Array<{ node: TreeNode; depth: number }> {
  const result: Array<{ node: TreeNode; depth: number }> = [];
  for (const node of nodes) {
    result.push({ node, depth });
    if (node.is_dir && node.expanded && node.children) {
      result.push(...flatten(node.children, depth + 1));
    }
  }
  return result;
}

function collectAll(nodes: TreeNode[]): TreeNode[] {
  const result: TreeNode[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.is_dir && node.children) result.push(...collectAll(node.children));
  }
  return result;
}

const flatTree = computed(() => flatten(props.treeNodes));

const searchResults = computed(() => {
  if (!searchQuery.value) return [];
  const q = searchQuery.value.toLowerCase();
  return collectAll(props.treeNodes).filter((n) => n.name.toLowerCase().includes(q));
});

const rootFolderName = computed(() => {
  if (!props.rootFolder) return '';
  const parts = props.rootFolder.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? props.rootFolder;
});

// ── 右键菜单 ──────────────────────────────────────────────────

const contextMenu = ref<{ visible: boolean; x: number; y: number; node: TreeNode | null }>({
  visible: false,
  x: 0,
  y: 0,
  node: null,
});

const folderMenu = ref<{
  visible: boolean;
  x: number;
  y: number;
  rect: { left: number; top: number; width: number; height: number } | null;
}>({
  visible: false,
  x: 0,
  y: 0,
  rect: null,
});

const renameDialog = ref<{ visible: boolean; newName: string }>({
  visible: false,
  newName: '',
});

const newDialog = ref<{ visible: boolean; name: string; isFolder: boolean; targetDir: string | null }>({
  visible: false,
  name: '',
  isFolder: false,
  targetDir: null,
});

function showContextMenu(event: MouseEvent, node: TreeNode) {
  contextMenu.value = { visible: true, x: event.clientX, y: event.clientY, node };
}

function showFolderMenu(event: MouseEvent) {
  // 阻止冒泡到 document 的 click 监听，否则刚打开就被 handleClickOutside 关掉
  event.stopPropagation();
  contextMenu.value.visible = false;
  if (folderMenu.value.visible) {
    folderMenu.value.visible = false;
    return;
  }
  // 用触发器按钮的矩形定位，让菜单出现在名称正上方并左对齐
  const target = event.currentTarget as HTMLElement | null;
  const rect = target?.getBoundingClientRect() ?? null;
  folderMenu.value = {
    visible: true,
    x: rect ? rect.left : event.clientX,
    y: rect ? rect.top : event.clientY,
    rect: rect
      ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
      : null,
  };
}

/** 右键节点的目标目录：目录节点本身，文件节点取其父目录。 */
function targetDirForNode(node: TreeNode | null): string | null {
  if (!node) return props.rootFolder;
  return node.is_dir ? node.path : dirname(node.path) || props.rootFolder;
}

// ── 节点点击 ──────────────────────────────────────────────────

function handleNodeClick(node: TreeNode, event?: MouseEvent) {
  if (node.is_image) {
    emit('open-image', node.path);
    return;
  }
  if (node.is_dir) {
    emit('toggle-dir', node.path);
    return;
  }
  if (event && (event.metaKey || event.ctrlKey)) {
    emit('open-file-in-new-window', node.path);
    return;
  }
  emit('open-file', node.path);
}

// ── 重命名 ───────────────────────────────────────────────────

function handleRename() {
  if (!contextMenu.value.node) return;
  renameDialog.value.newName = contextMenu.value.node.name;
  renameDialog.value.visible = true;
  contextMenu.value.visible = false;
}

function confirmRename() {
  if (!contextMenu.value.node || !renameDialog.value.newName.trim()) return;
  emit('file-renamed', contextMenu.value.node.path, renameDialog.value.newName.trim());
  renameDialog.value.visible = false;
  emit('rename-completed');
}

// ── 删除 ─────────────────────────────────────────────────────

async function handleDelete() {
  if (!contextMenu.value.node) return;
  const node = contextMenu.value.node;
  const msg = node.is_dir
    ? `确定删除文件夹 "${node.name}" 及其所有内容？`
    : `确定删除文件 "${node.name}"？`;
  const confirmed = await confirm(msg, {
    title: '删除确认',
    kind: 'warning',
    okLabel: '删除',
    cancelLabel: '取消',
  });
  if (confirmed) emit('file-deleted', node.path);
  contextMenu.value.visible = false;
}

function handleRevealInFinder() {
  if (!contextMenu.value.node) return;
  emit('reveal-in-finder', contextMenu.value.node.path);
  contextMenu.value.visible = false;
}

function handleRevealFolder() {
  folderMenu.value.visible = false;
  if (props.rootFolder) emit('reveal-in-finder', props.rootFolder);
}

function handleCloseFolderMenu() {
  folderMenu.value.visible = false;
  emit('close-folder');
}

// ── 新建 ─────────────────────────────────────────────────────

function handleNewFileInContext() {
  const targetDir = targetDirForNode(contextMenu.value.node);
  contextMenu.value.visible = false;
  emit('file-created', '__AUTO_RENAME__', false, targetDir);
}

function handleNewFolderInContext() {
  const targetDir = targetDirForNode(contextMenu.value.node);
  newDialog.value = { visible: true, name: '', isFolder: true, targetDir };
  contextMenu.value.visible = false;
}

function confirmNew() {
  if (!newDialog.value.name.trim()) return;
  emit(
    'file-created',
    newDialog.value.name.trim(),
    newDialog.value.isFolder,
    newDialog.value.targetDir,
  );
  newDialog.value.visible = false;
}

// ── pendingRenamePath 监听 ────────────────────────────────────

watch(
  () => props.pendingRenamePath,
  (path) => {
    if (!path) return;
    const node = collectAll(props.treeNodes).find((n) => n.path === path);
    if (node) {
      nextTick(() => {
        contextMenu.value.node = node;
        renameDialog.value.newName = node.name.replace(/\.md$/i, '');
        renameDialog.value.visible = true;
      });
    }
  },
);

// ── 点击外部关闭菜单 ──────────────────────────────────────────

function handleClickOutside() {
  contextMenu.value.visible = false;
  folderMenu.value.visible = false;
}

onMounted(() => document.addEventListener('click', handleClickOutside));
onUnmounted(() => document.removeEventListener('click', handleClickOutside));
</script>
