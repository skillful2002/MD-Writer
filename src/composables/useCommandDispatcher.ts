import type { Ref } from 'vue';
import type { CommandSource } from '../commands/registry';
import { getCommand } from '../commands/registry';
import { openUrl } from '../services/tauri/opener';
import { revealStartupOpenLog } from '../services/tauri/window';

type ViewMode = 'editor' | 'image';

export interface EditorCommandApi {
  executeCommand?: (commandId: string) => boolean;
  hasFocus?: () => boolean;
  openSearch?: (showReplace?: boolean) => void;
}

export interface CommandDispatcherOptions {
  editorRef: Ref<EditorCommandApi | null>;
  activeViewMode: Ref<ViewMode>;
  isSourceMode: Ref<boolean>;
  handleNew: () => void | Promise<void>;
  handleOpen: () => void | Promise<void>;
  handleOpenFolder: () => void | Promise<void>;
  handleSave: () => void | Promise<void> | Promise<boolean> | boolean;
  handleSaveAs: () => void | Promise<void> | Promise<boolean> | boolean;
  handleOpenNewWindow: (path?: string) => void | Promise<void>;
  exportHtml: () => void | Promise<void>;
  exportPdf: () => void | Promise<void>;
  copyToWechat: () => void | Promise<void>;
  toggleSidebar: () => void;
  toggleOutline: () => void;
  toggleSourceMode: () => void;
  openSettings: () => void;
  openCommandPalette: () => void;
  openShortcuts: () => void;
  toggleFocusMode: () => void | Promise<void>;
  showAbout: () => void | Promise<void>;
  toggleFullscreen: () => void | Promise<void>;
  handleQuit: () => void | Promise<void>;
  handleCloseFolder: () => void | Promise<void>;
  openRecentByIndex: (index: number) => void | Promise<void>;
  openRecentFileByIndex: (index: number) => void | Promise<void>;
  clearRecentFolders: () => void | Promise<void>;
}

export function useCommandDispatcher(options: CommandDispatcherOptions) {
  const {
    editorRef,
    activeViewMode,
    isSourceMode,
  } = options;

  function canRunEditorShortcut() {
    if (activeViewMode.value !== 'editor' || isSourceMode.value) {
      return false;
    }
    return editorRef.value?.hasFocus?.() ?? false;
  }

  async function executeCommand(commandId: string, source: CommandSource = 'menu'): Promise<boolean> {
    // 动态历史菜单项：file.openRecent.<index>（文件夹）与 file.openRecentFile.<index>（文件）
    if (commandId.startsWith('file.openRecentFile.')) {
      const index = Number.parseInt(commandId.slice('file.openRecentFile.'.length), 10);
      if (Number.isInteger(index) && index >= 0) {
        await options.openRecentFileByIndex(index);
        return true;
      }
      return false;
    }
    if (commandId.startsWith('file.openRecent.')) {
      const index = Number.parseInt(commandId.slice('file.openRecent.'.length), 10);
      if (Number.isInteger(index) && index >= 0) {
        await options.openRecentByIndex(index);
        return true;
      }
      return false;
    }

    const command = getCommand(commandId);
    if (!command) {
      return false;
    }

    if (command.scope === 'editor') {
      if (source === 'shortcut' && !canRunEditorShortcut()) {
        return false;
      }
      return editorRef.value?.executeCommand?.(commandId) ?? false;
    }

    switch (commandId) {
      case 'file.new':
        await options.handleNew();
        return true;
      case 'file.open':
        await options.handleOpen();
        return true;
      case 'file.openFolder':
        await options.handleOpenFolder();
        return true;
      case 'file.save':
        await options.handleSave();
        return true;
      case 'file.saveAs':
        await options.handleSaveAs();
        return true;
      case 'file.newWindow':
        await options.handleOpenNewWindow();
        return true;
      case 'export.html':
        await options.exportHtml();
        return true;
      case 'export.pdf':
        await options.exportPdf();
        return true;
      case 'export.wechat':
        await options.copyToWechat();
        return true;
      case 'edit.find':
        if (activeViewMode.value === 'editor' && !isSourceMode.value) {
          editorRef.value?.openSearch?.(false);
          return true;
        }
        return false;
      case 'edit.replace':
        if (activeViewMode.value === 'editor' && !isSourceMode.value) {
          editorRef.value?.openSearch?.(true);
          return true;
        }
        return false;
      case 'edit.commandPalette':
        options.openCommandPalette();
        return true;
      case 'view.toggleSidebar':
        options.toggleSidebar();
        return true;
      case 'view.showOutline':
        options.toggleOutline();
        return true;
      case 'view.toggleSourceMode':
        options.toggleSourceMode();
        return true;
      case 'view.focusMode':
        await options.toggleFocusMode();
        return true;
      case 'view.fullscreen':
        await options.toggleFullscreen();
        return true;
      case 'settings.open':
        options.openSettings();
        return true;
      case 'help.shortcuts':
        options.openShortcuts();
        return true;
      case 'help.about':
        await options.showAbout();
        return true;
      case 'help.github':
        await openUrl('https://github.com/skillful2002/MarkdownEd');
        return true;
      case 'help.gitee':
        await openUrl('https://gitee.com/liuzhengguo/MarkdownEd');
        return true;
      case 'help.issues':
        await openUrl('https://github.com/skillful2002/MarkdownEd/issues');
        return true;
      case 'help.diagnostics':
        await revealStartupOpenLog();
        return true;
      case 'file.closeFolder':
        await options.handleCloseFolder();
        return true;
      case 'file.clearRecent':
        await options.clearRecentFolders();
        return true;
      case 'app.quit':
        await options.handleQuit();
        return true;
      default:
        return false;
    }
  }

  return {
    executeCommand,
  };
}
