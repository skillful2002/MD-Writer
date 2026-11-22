<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useAppWindowSession } from './composables/useAppWindowSession';
import { useCommandDispatcher } from './composables/useCommandDispatcher';
import { useAppDomEvents } from './composables/useAppDomEvents';
import { useAppEditorState } from './composables/useAppEditorState';
import { useAppUiState } from './composables/useAppUiState';
import { useDocumentSession } from './composables/useDocumentSession';
import { useExportActions } from './composables/useExportActions';
import { useImagePreview } from './composables/useImagePreview';
import { useMenuEvents } from './composables/useMenuEvents';
import { useMenuShortcutsSync } from './composables/useMenuShortcutsSync';
import { usePanelResize, PANEL_WIDTH_LIMITS } from './composables/usePanelResize';
import { useWorkspaceSession } from './composables/useWorkspaceSession';
import CommandPalette from './components/Editor/CommandPalette.vue';
import ImageFullscreenOverlay from './components/Editor/ImageFullscreenOverlay.vue';
import ImagePreviewView from './components/Editor/ImagePreviewView.vue';
import ShortcutsModal from './components/Editor/ShortcutsModal.vue';
import Sidebar from './components/Editor/Sidebar.vue';
import SourceEditorView from './components/Editor/SourceEditorView.vue';
import PanelResizer from './components/Layout/PanelResizer.vue';
import StatusBar from './components/Layout/StatusBar.vue';
import TitleBar from './components/Layout/TitleBar.vue';
import SettingsModal from './components/Settings/SettingsModal.vue';
import SidebarOutlinePanel from './components/Editor/SidebarOutlinePanel.vue';
import { useFileStore } from './stores/file';
import { useSettingsStore } from './stores/settings';
import { useRecentFoldersStore } from './stores/recentFolders';
import { useRecentFilesStore } from './stores/recentFiles';
import { message } from './services/tauri/dialog';
import { findCommandByShortcut } from './utils/shortcuts';
import { dirname } from './utils/path';
import pkg from '../package.json';

const MarkdownEditor = defineAsyncComponent(() => import('./components/Editor/MarkdownEditor.vue'));

const fileStore = useFileStore();
const settingsStore = useSettingsStore();
const recentFoldersStore = useRecentFoldersStore();
const recentFilesStore = useRecentFilesStore();
const { settings, isLoaded } = storeToRefs(settingsStore);
const recentFoldersForSidebar = computed(() =>
  recentFoldersStore.displayFolders(settings.value.recentFoldersInSidebar),
);
const recentFilesForSidebar = computed(() =>
  recentFilesStore.displayFiles(settings.value.recentFilesInSidebar),
);
const appVersion = pkg.version;
const { editorRef, stats, outlineItems, handleEditorUpdate, scrollToHeading } =
  useAppEditorState();

const {
  activeViewMode,
  imagePreviewUrl,
  isFullscreenPreview,
  handleOpenImage,
  closeFullscreenPreview,
  resetToEditor,
} = useImagePreview();

const documentSession = useDocumentSession({
  resetViewMode: resetToEditor,
});

async function handleOpenFile(path: string, recordAsRecent = true) {
  // recordAsRecent=false 表示来自文件列表（侧栏）的打开：按规则 2，仅编辑保存后才记入历史。
  await documentSession.openDocumentWithPrompt(path, recordAsRecent);
}

// 源码模式：把文本区的光标位置（行/列）同步到状态栏
function handleSourceCursor(payload: { line: number; col: number; selectionText: string }) {
  handleEditorUpdate({
    cursor: { line: payload.line, col: payload.col },
    selectionText: payload.selectionText,
  });
}

const workspaceSession = useWorkspaceSession({
  openDocument: handleOpenFile,
  onCurrentDocumentDeleted: resetToEditor,
  onWorkspaceChanged: documentSession.handleWorkspaceChange,
});
const {
  rootFolder,
  treeNodes,
  flatFiles,
  pendingRenamePath,
  toggleDir,
  refreshTree,
  renameEntry: handleFileRenamed,
  deleteEntry: handleFileDeletedWrapper,
  handleRenameCompleted,
  revealInFinder: handleRevealInFinder,
} = workspaceSession;
const { autoSaveStatus, externalFileWarning } = documentSession;

const { exportHtml, exportPdf, copyToWechat } = useExportActions({
  editorRef,
  activeViewMode,
  fileStore,
  settingsStore,
});

const { syncMenuShortcuts, stopWatching: stopWatchingMenuShortcuts } = useMenuShortcutsSync({
  customShortcuts: computed(() => settings.value.customShortcuts),
  isLoaded,
});

const {
  isSidebarOpen,
  isOutlineOpen,
  isSourceMode,
  imagePasteWarning,
  isCommandPaletteOpen,
  isShortcutsModalOpen,
  toggleSidebar,
  toggleOutline,
  toggleSourceMode,
  openCommandPalette,
  openShortcutsModal,
  showImagePasteWarning,
} = useAppUiState();

// ── 三栏宽度拖动 ──────────────────────────────────────────────
// 宽度在拖动过程中只写本地 ref（每帧更新配置会触发主题重应用，掉帧），
// mouseup / 键盘微调结束时才提交到 settings 持久化。
const panelContainerRef = ref<HTMLElement | null>(null);
const sidebarWidth = ref<number>(PANEL_WIDTH_LIMITS.sidebar.default);
const outlineWidth = ref<number>(PANEL_WIDTH_LIMITS.outline.default);

const { activeSide, startResize, resetWidth, nudgeWidth, refreshLimits } = usePanelResize({
  sidebarWidth,
  outlineWidth,
  containerRef: panelContainerRef,
  onCommit: () => {
    settingsStore.updateSetting('sidebarWidth', sidebarWidth.value);
    settingsStore.updateSetting('outlineWidth', outlineWidth.value);
  },
});

// 配置加载完成 / 恢复默认设置后，把持久化宽度同步回本地值（拖动中不打断），
// 并按当前窗口宽度重新收进「编辑区至少 50%」的约束
watch(
  () => [settings.value.sidebarWidth, settings.value.outlineWidth] as const,
  ([nextSidebarWidth, nextOutlineWidth]) => {
    if (activeSide.value) return;
    sidebarWidth.value = nextSidebarWidth;
    outlineWidth.value = nextOutlineWidth;
    refreshLimits();
  },
  { immediate: true },
);

// 模式切换时，把「切换前所在源码行」暂存下来，供两个视图挂载后恢复光标位置
const pendingCursorLine = ref<number | null>(null);
function onToggleSource() {
  pendingCursorLine.value = stats.cursor.line;
  toggleSourceMode();
  nextTick(() => {
    pendingCursorLine.value = null;
  });
}

// 标题栏中央显示的文件名（macOS Overlay 模式下 native titlebar 文本不再可见，
// 需要在 HTML TitleBar 中画文件名替代显示）
const titleBarFileTitle = computed(() => {
  const path = fileStore.currentFile.path;
  if (!path) return '未命名';
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
});

function folderNameFromPath(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

async function openWorkspaceByPath(path: string): Promise<boolean> {
  const ok = await workspaceSession.loadWorkspace(path);
  if (ok) {
    isSidebarOpen.value = true;
    await recentFoldersStore.add(path, folderNameFromPath(path));
  }
  return ok;
}

async function handleOpenFolder() {
  const path = await workspaceSession.openWorkspacePicker();
  if (path) {
    isSidebarOpen.value = true;
    await recentFoldersStore.add(path, folderNameFromPath(path));
  }
}

async function openRecentByIndex(index: number) {
  const folder = recentFoldersStore.folders[index];
  if (folder) {
    await openWorkspaceByPath(folder.path);
  }
}

async function openRecentFileByIndex(index: number) {
  const file = recentFilesStore.files[index];
  if (file) {
    await handleOpenFile(file.path);
  }
}

async function clearRecentFolders() {
  await recentFoldersStore.clear();
  await recentFilesStore.clear();
}

async function handleCloseFolder() {
  workspaceSession.closeWorkspace();
  fileStore.reset();
  resetToEditor();
  // 关闭文件夹后当前文档已不存在，清空侧栏大纲（编辑器重挂载时不会主动回发黄框大纲）
  outlineItems.value = [];
}

async function handleOpenNewWindow(path?: string) {
  await windowSession.handleOpenEditorWindow(path);
}

function handleFileCreatedWrapper(name: string, isFolder: boolean, targetDir?: string | null) {
  void workspaceSession.createEntry(name, isFolder, targetDir ?? undefined);
}

/** 每次新建未命名文档自增，作为编辑器 key 的一部分，确保点击 + 时编辑器始终重挂载出全新空白文档（即使原本就处于空白态也可见）。 */
const newDocSeq = ref(0);

/** 点击侧栏 + 号：在当前打开文件所在目录新建一个未命名 Markdown 文档。 */
async function handleNewMarkdownFromSidebar() {
  const currentPath = fileStore.currentFile.path;
  const dir = currentPath ? dirname(currentPath) : (rootFolder.value ?? null);
  const created = await documentSession.createNewMarkdown(dir || null);
  if (created) {
    newDocSeq.value++;
    // 等待编辑器因 key 变化重挂载完成后聚焦，确保「新建文档」有可见的光标反馈
    await nextTick();
    editorRef.value?.focus();
  }
}

const windowTitle = computed(() => {
  const file = fileStore.currentFile;
  let fileName = '未命名';

  if (activeViewMode.value === 'editor') {
    fileName = file.path ? file.path.split(/[/\\]/).pop() || '未命名' : '未命名';
  } else if (activeViewMode.value === 'image' && imagePreviewUrl.value) {
    fileName = '查看图片';
  }

  return file.isDirty ? `${fileName} ●` : fileName;
});

const windowSession = useAppWindowSession({
  openDocument: handleOpenFile,
  saveDocument: documentSession.saveCurrentDocument,
  isDirty: () => fileStore.currentFile.isDirty,
  windowTitle,
});

function showAbout() {
  message(
    `纽新 (MarkdownEd) v${appVersion}\n\n一款高性能、自研内核的 Markdown 编辑器\n\nGitHub: https://github.com/skillful2002/MarkdownEd\nGitee: https://gitee.com/liuzhengguo/MarkdownEd\n\n© 2026 newxin.tech`,
    {
      title: '关于',
      kind: 'info',
    },
  );
}

const { executeCommand } = useCommandDispatcher({
  editorRef,
  activeViewMode,
  isSourceMode,
  handleNew: documentSession.handleNewDocument,
  handleOpen: documentSession.handleOpenDocument,
  handleOpenFolder,
  handleSave: documentSession.saveCurrentDocument,
  handleSaveAs: documentSession.saveCurrentDocumentAs,
  handleOpenNewWindow,
  exportHtml,
  exportPdf,
  copyToWechat,
  toggleSidebar,
  toggleSourceMode,
  openSettings: () => settingsStore.openModal(),
  openCommandPalette,
  openShortcuts: openShortcutsModal,
  toggleFocusMode: () => settingsStore.toggleFocusMode(),
  toggleOutline,
  showAbout,
  toggleFullscreen: windowSession.toggleFullscreen,
  handleQuit: windowSession.handleQuit,
  handleCloseFolder,
  openRecentByIndex,
  openRecentFileByIndex,
  clearRecentFolders,
});

useAppDomEvents({
  editorRef,
  activeViewMode,
  isSourceMode,
  isFullscreenPreview,
  isFocusMode: () => settingsStore.isFocusMode,
  customShortcuts: () => settingsStore.settings.customShortcuts,
  findCommandByShortcut,
  executeCommand,
  clearFullscreenPreview: () => {
    isFullscreenPreview.value = false;
  },
  toggleFocusMode: () => settingsStore.toggleFocusMode(),
  showImagePasteWarning,
});

watch(
  () => [fileStore.currentFile.path, activeViewMode.value] as const,
  ([path, viewMode]) => {
    if (path && viewMode === 'editor') {
      workspaceSession.syncWorkspaceFromDocumentPath(path);
    }
  },
  { immediate: true },
);

// 历史记录（文件夹 / 文件）变化时，去抖重建原生菜单，
// 使「打开历史记录」子菜单即时反映最新记录（否则要等下次启动/快捷键变更才刷新）。
let menuRefreshTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  () => [recentFoldersStore.folders, recentFilesStore.files],
  () => {
    if (!isLoaded.value) return;
    if (menuRefreshTimer) clearTimeout(menuRefreshTimer);
    menuRefreshTimer = setTimeout(() => {
      void syncMenuShortcuts();
    }, 300);
  },
  { deep: true },
);

useMenuEvents(async (commandId) => {
  await executeCommand(commandId, 'menu');
});

onMounted(async () => {
  await settingsStore.init();
  // 容器此时已完成首次布局，按真实宽度再收紧一次面板宽度
  refreshLimits();
  await workspaceSession.setup();
  await windowSession.setup();
  await syncMenuShortcuts();
  await recentFoldersStore.load();
  await recentFilesStore.load();
});

onUnmounted(() => {
  workspaceSession.cleanup();
  windowSession.cleanup();
  stopWatchingMenuShortcuts();
});
</script>

<template>
  <div
    class="h-screen flex flex-col overflow-hidden font-sans select-none"
    :class="{ 'focus-mode': settingsStore.isFocusMode }"
    style="background-color: var(--bg-color); color: var(--text-color)"
  >
    <TitleBar
      :is-sidebar-open="isSidebarOpen"
      :is-outline-open="isOutlineOpen"
      :is-source-mode="isSourceMode"
      :file-title="titleBarFileTitle"
      @toggle-sidebar="toggleSidebar"
      @toggle-outline="toggleOutline"
      @toggle-source="onToggleSource"
    />

    <div ref="panelContainerRef" class="flex-1 flex overflow-hidden">
      <aside
        v-show="isSidebarOpen && !isSourceMode && !settingsStore.isFocusMode"
        class="flex-shrink-0 overflow-hidden"
        :class="{ 'transition-all duration-300': !activeSide }"
        :style="{ width: sidebarWidth + 'px' }"
      >
        <Sidebar
          :tree-nodes="treeNodes"
          :root-folder="rootFolder"
          :current-file-path="fileStore.currentFile.path"
          :pending-rename-path="pendingRenamePath"
          :recent-folders="recentFoldersForSidebar"
          :recent-files="recentFilesForSidebar"
          @open-folder="handleOpenFolder"
          @open-recent="openWorkspaceByPath"
          @open-file="(p) => handleOpenFile(p, false)"
          @open-recent-file="handleOpenFile"
          @open-image="handleOpenImage"
          @toggle-dir="toggleDir"
          @open-file-in-new-window="handleOpenNewWindow"
          @refresh-files="refreshTree"
          @file-renamed="handleFileRenamed"
          @file-deleted="handleFileDeletedWrapper"
          @file-created="handleFileCreatedWrapper"
          @reveal-in-finder="handleRevealInFinder"
          @rename-completed="handleRenameCompleted"
          @new-markdown="handleNewMarkdownFromSidebar"
          @close-folder="handleCloseFolder"
        />
      </aside>

      <PanelResizer
        v-if="isSidebarOpen && !isSourceMode && !settingsStore.isFocusMode"
        side="sidebar"
        :active="activeSide === 'sidebar'"
        @start="(event) => startResize('sidebar', event)"
        @reset="resetWidth('sidebar')"
        @nudge="(delta) => nudgeWidth('sidebar', delta)"
      />

      <main
        class="flex-1 min-w-0 relative overflow-hidden select-text"
        :class="{ 'focus-mode-editor': settingsStore.isFocusMode }"
      >
        <MarkdownEditor
          v-if="activeViewMode === 'editor' && !isSourceMode"
          :key="fileStore.currentFile.path || ('new-' + newDocSeq)"
          ref="editorRef"
          :initial-content="fileStore.currentFile.content"
          :initial-line="pendingCursorLine"
          @update="handleEditorUpdate"
        />

        <ImagePreviewView
          v-else-if="activeViewMode === 'image' && imagePreviewUrl"
          :image-url="imagePreviewUrl"
          @open-fullscreen="isFullscreenPreview = true"
        />

        <SourceEditorView
          v-else
          :content="fileStore.currentFile.content"
          :initial-line="pendingCursorLine"
          @update-content="fileStore.setContent"
          @cursor="handleSourceCursor"
        />
      </main>

      <PanelResizer
        v-if="isOutlineOpen && !isSourceMode && !settingsStore.isFocusMode"
        side="outline"
        :active="activeSide === 'outline'"
        @start="(event) => startResize('outline', event)"
        @reset="resetWidth('outline')"
        @nudge="(delta) => nudgeWidth('outline', delta)"
      />

      <aside
        v-show="isOutlineOpen && !isSourceMode && !settingsStore.isFocusMode"
        class="flex-shrink-0 flex flex-col border-l overflow-hidden"
        :class="{ 'transition-all duration-300': !activeSide }"
        :style="{
          width: outlineWidth + 'px',
          backgroundColor: 'var(--sidebar-bg)',
          borderColor: 'var(--border-color)',
        }"
      >
        <SidebarOutlinePanel
          :doc-id="fileStore.currentFile.path || ('new-' + newDocSeq)"
          :items="outlineItems"
          @scroll-to="scrollToHeading"
        />
      </aside>
    </div>

    <div
      class="statusbar-container transition-opacity duration-300"
      :class="{ 'opacity-0 pointer-events-none': settingsStore.isFocusMode }"
    >
      <StatusBar
        :word-count="stats.wordCount"
        :cursor="stats.cursor"
        :selection-text="stats.selectionText"
        :auto-save-status="autoSaveStatus"
        :image-paste-warning="imagePasteWarning"
        :external-file-warning="externalFileWarning"
      />
    </div>

    <SettingsModal />

    <ShortcutsModal :visible="isShortcutsModalOpen" @close="isShortcutsModalOpen = false" />

    <CommandPalette
      :visible="isCommandPaletteOpen"
      :files="flatFiles"
      :current-folder="rootFolder"
      @close="isCommandPaletteOpen = false"
      @execute="(command) => executeCommand(command.id, 'palette')"
      @open-file="handleOpenFile"
    />

    <ImageFullscreenOverlay
      :visible="isFullscreenPreview && Boolean(imagePreviewUrl)"
      :image-url="imagePreviewUrl || ''"
      @close="closeFullscreenPreview"
    />
  </div>
</template>
