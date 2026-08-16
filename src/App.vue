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
import { useWorkspaceSession } from './composables/useWorkspaceSession';
import CommandPalette from './components/Editor/CommandPalette.vue';
import ImageFullscreenOverlay from './components/Editor/ImageFullscreenOverlay.vue';
import ImagePreviewView from './components/Editor/ImagePreviewView.vue';
import ShortcutsModal from './components/Editor/ShortcutsModal.vue';
import Sidebar from './components/Editor/Sidebar.vue';
import SourceEditorView from './components/Editor/SourceEditorView.vue';
import StatusBar from './components/Layout/StatusBar.vue';
import TitleBar from './components/Layout/TitleBar.vue';
import PanelToggleButtons from './components/Layout/PanelToggleButtons.vue';
import SettingsModal from './components/Settings/SettingsModal.vue';
import EditorToolbar from './components/Toolbar/EditorToolbar.vue';
import SidebarOutlinePanel from './components/Editor/SidebarOutlinePanel.vue';
import { useFileStore } from './stores/file';
import { useSettingsStore } from './stores/settings';
import { useRecentFoldersStore } from './stores/recentFolders';
import { message } from './services/tauri/dialog';
import { findCommandByShortcut } from './utils/shortcuts';
import { dirname } from './utils/path';
import { isMac } from './utils/platform';
import pkg from '../package.json';

const MarkdownEditor = defineAsyncComponent(() => import('./components/Editor/MarkdownEditor.vue'));

const fileStore = useFileStore();
const settingsStore = useSettingsStore();
const recentFoldersStore = useRecentFoldersStore();
const { settings, isLoaded } = storeToRefs(settingsStore);
const recentFoldersForSidebar = computed(() =>
  recentFoldersStore.displayFolders(settings.value.recentFoldersInSidebar),
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

async function handleOpenFile(path: string) {
  await documentSession.openDocumentWithPrompt(path);
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

async function clearRecentFolders() {
  await recentFoldersStore.clear();
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

useMenuEvents(async (commandId) => {
  await executeCommand(commandId, 'menu');
});

onMounted(async () => {
  await settingsStore.init();
  await workspaceSession.setup();
  await windowSession.setup();
  await syncMenuShortcuts();
  await recentFoldersStore.load();
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
      v-if="!isMac"
      :is-sidebar-open="isSidebarOpen"
      :is-outline-open="isOutlineOpen"
      @toggle-sidebar="toggleSidebar"
      @toggle-outline="toggleOutline"
    />

    <!-- macOS 无自定义标题栏（走系统原生红绿灯/菜单），文件名由原生标题栏显示。
         两个面板显隐按钮置于右上角，与大刚标题所在行对齐；无论大纲是否隐藏都常显 -->
    <div
      v-if="isMac"
      class="fixed top-0 right-0 z-50 flex items-center h-8 transition-opacity duration-300"
      :class="{ 'opacity-0 pointer-events-none': settingsStore.isFocusMode }"
      data-tauri-no-drag
    >
      <PanelToggleButtons
        :is-sidebar-open="isSidebarOpen"
        :is-outline-open="isOutlineOpen"
        @toggle-sidebar="toggleSidebar"
        @toggle-outline="toggleOutline"
      />
    </div>

    <div
      class="toolbar-container transition-opacity duration-300"
      :class="{ 'opacity-0 pointer-events-none': settingsStore.isFocusMode }"
    >
      <EditorToolbar
        :is-source-mode="isSourceMode"
        @new-file="documentSession.handleNewDocument"
        @open-file="documentSession.handleOpenDocument"
        @save-file="documentSession.saveCurrentDocument"
        @toggle-sidebar="toggleSidebar"
        @toggle-source="toggleSourceMode"
        @copy-wechat="copyToWechat"
      />
    </div>

    <div class="flex-1 flex overflow-hidden">
      <aside
        v-show="isSidebarOpen && !isSourceMode && !settingsStore.isFocusMode"
        class="w-64 flex-shrink-0 transition-all duration-300"
      >
        <Sidebar
          :tree-nodes="treeNodes"
          :root-folder="rootFolder"
          :current-file-path="fileStore.currentFile.path"
          :pending-rename-path="pendingRenamePath"
          :recent-folders="recentFoldersForSidebar"
          @open-folder="handleOpenFolder"
          @open-recent="openWorkspaceByPath"
          @open-file="handleOpenFile"
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

      <main
        class="flex-1 relative overflow-hidden select-text"
        :class="{ 'focus-mode-editor': settingsStore.isFocusMode }"
      >
        <MarkdownEditor
          v-if="activeViewMode === 'editor' && !isSourceMode"
          :key="fileStore.currentFile.path || ('new-' + newDocSeq)"
          ref="editorRef"
          :initial-content="fileStore.currentFile.content"
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
          @update-content="fileStore.setContent"
        />
      </main>

      <aside
        v-show="isOutlineOpen && !isSourceMode && !settingsStore.isFocusMode"
        class="w-64 flex-shrink-0 flex flex-col border-l transition-all duration-300"
        style="background-color: var(--sidebar-bg); border-color: var(--border-color)"
      >
        <div
          class="flex-shrink-0 px-4 py-2 text-xs font-semibold border-b"
          style="border-color: var(--border-color); color: var(--text-color)"
        >
          大纲
        </div>
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
