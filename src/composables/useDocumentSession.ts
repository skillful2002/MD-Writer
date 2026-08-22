import { onUnmounted, ref, watch } from 'vue';
import { openDocument, saveDocument, type DocumentOpenResult } from '../services/tauri/document';
import { normalizeTauriError } from '../services/tauri/client';
import { confirm, message, open, save } from '../services/tauri/dialog';
import type { WorkspaceChangedPayload } from '../services/tauri/events';
import { useFileStore } from '../stores/file';
import { useSettingsStore } from '../stores/settings';
import { useRecentFilesStore } from '../stores/recentFiles';
import { basename, dirname } from '../utils/path';
import { CODE_FILE_EXTENSIONS, languageFromPath } from '../utils/code-language';

export interface AutoSaveStatus {
  message: string;
  timestamp: number;
}

interface DocumentSessionOptions {
  resetViewMode: () => void;
}

export function useDocumentSession(options: DocumentSessionOptions) {
  const fileStore = useFileStore();
  const settingsStore = useSettingsStore();
  const recentFilesStore = useRecentFilesStore();

  const autoSaveStatus = ref<AutoSaveStatus | null>(null);
  const externalFileWarning = ref<string | null>(null);

  let autoSaveIntervalId: ReturnType<typeof setInterval> | null = null;
  let autoSaveStatusTimer: ReturnType<typeof setTimeout> | null = null;
  let externalWarningTimer: ReturnType<typeof setTimeout> | null = null;
  // 保存防重入锁：一次 Cmd+S 会同时触发系统菜单加速键与前端 keydown 两条路径，
  // 若并发执行会在编码选择框弹出期间重复弹框、并因 mtime 竞争触发"强制覆盖"。
  // 已有保存流程进行中时，后续调用直接忽略。
  let saveInProgress = false;

  // 把内部编码名映射为对用户友好的描述, 便于在选择框中展示原编码格式。
  function encodingLabel(encoding: string): string {
    const lower = encoding.toLowerCase();
    if (lower === 'gb18030') return 'GB18030（中文，兼容 GBK / GB2312）';
    if (lower === 'gbk') return 'GBK（中文）';
    if (lower === 'gb2312') return 'GB2312（中文）';
    if (lower === 'big5') return 'Big5（繁体中文）';
    if (lower === 'shift_jis' || lower === 'sjis') return 'Shift_JIS（日文）';
    if (lower === 'euc-jp') return 'EUC-JP（日文）';
    if (lower === 'euc-kr') return 'EUC-KR（韩文）';
    return encoding.toUpperCase();
  }

  async function loadDocumentFromPath(path: string, resetEncodingState = true): Promise<boolean> {
    try {
      fileStore.setLoading(true);
      const document = await openDocument(path);
      applyLoadedDocument(document, resetEncodingState);
      return true;
    } catch (error) {
      const { message: errorMessage } = normalizeTauriError(error);
      console.error('Failed to open document:', errorMessage);
      await message(`打开文件失败: ${errorMessage}`, { title: '错误', kind: 'error' });
      return false;
    } finally {
      fileStore.setLoading(false);
    }
  }

  function applyLoadedDocument(document: DocumentOpenResult, resetEncodingState = true) {
    const language = languageFromPath(document.path);
    const isNonUtf = !!document.encoding && !document.encoding.toLowerCase().startsWith('utf');
    // 非 UTF-8 文件加载后标记"编码待确认"(保存时只问一次)，UTF-8 文件直接视为已确认。
    // 仅当用户主动打开新文件时重置该状态；外部同步重载(resetEncodingState=false)保留已确认状态, 避免反复弹窗。
    const resolved = resetEncodingState ? !isNonUtf : fileStore.currentFile.encodingResolved;
    fileStore.setFile(
      document.content,
      document.path,
      document.lastModifiedMs,
      language,
      document.encoding,
      resolved,
    );
  }

  async function confirmDiscardUnsavedChanges() {
    if (!fileStore.currentFile.path && !fileStore.currentFile.content.trim()) {
      return true;
    }
    if (!fileStore.currentFile.isDirty) {
      return true;
    }

    return confirm('当前文件有未保存的更改，是否放弃更改？', {
      title: '未保存的更改',
      kind: 'warning',
      okLabel: '放弃更改',
      cancelLabel: '取消',
    });
  }

  /**
   * 记录一条「最近打开的文件」历史。
   * 菜单直接打开（recordAsRecent=true）时立即记录；
   * 文件列表中打开的文件只在「编辑并保存」后才记录（见 save*），这里不传该标志。
   */
  function recordRecentFile(path: string) {
    recentFilesStore.add(path, basename(path));
  }

  async function openDocumentWithPrompt(path: string, recordAsRecent = false) {
    if (!(await confirmDiscardUnsavedChanges())) {
      return false;
    }

    const loaded = await loadDocumentFromPath(path);
    if (loaded) {
      clearExternalWarning();
      options.resetViewMode();
      if (recordAsRecent) {
        recordRecentFile(path);
      }
    }
    return loaded;
  }

  async function handleNewDocument() {
    if (!(await confirmDiscardUnsavedChanges())) {
      return;
    }

    clearExternalWarning();
    fileStore.reset();
    options.resetViewMode();
  }

  /**
   * 在指定目录下新建一个「未命名」Markdown 文档（内存态，不立即落盘）。
   * 首次保存（Ctrl+S）时会弹系统「另存为」对话框，defaultPath 默认定位到 targetDir。
   * @returns 成功新建返回 true（用户取消放弃更改时返回 false）。
   */
  async function createNewMarkdown(targetDir: string | null): Promise<boolean> {
    if (!(await confirmDiscardUnsavedChanges())) {
      return false;
    }

    clearExternalWarning();
    fileStore.reset();
    fileStore.setSuggestedDir(targetDir || null);
    options.resetViewMode();
    return true;
  }

  async function handleOpenDocument() {
    const selected = await open({
      multiple: false,
      filters: [
        { name: 'Markdown', extensions: ['md', 'markdown', 'txt'] },
        { name: 'Code', extensions: CODE_FILE_EXTENSIONS },
        { name: 'All', extensions: ['*'] },
      ],
    });
    if (selected && typeof selected === 'string') {
      // 通过菜单直接打开的文件：打开即记入历史（规则 1）
      await openDocumentWithPrompt(selected, true);
    }
  }

  async function persistDocument(
    path: string,
    force: boolean,
    expectedLastModifiedMs?: number | null,
  ) {
    // 非 UTF-8 文件且尚未确认过编码时, 保存前让用户选择回写方式(每个文件只问一次)。
    let encoding = fileStore.currentFile.encoding;
    if (
      !fileStore.currentFile.encodingResolved &&
      encoding &&
      !encoding.toLowerCase().startsWith('utf')
    ) {
      const label = encodingLabel(encoding);
      const keepOriginal = await confirm(
        `文件原为 ${label} 编码。保存时如何写入？`,
        {
          title: '编码选择',
          kind: 'warning',
          okLabel: `按原编码（${label}）保存`,
          cancelLabel: '转为 UTF-8 保存',
        },
      );
      encoding = keepOriginal ? encoding : 'utf-8';
      fileStore.currentFile.encoding = encoding;
      fileStore.currentFile.encodingResolved = true;
    }

    return saveDocument(
      path,
      fileStore.currentFile.content,
      expectedLastModifiedMs,
      force,
      encoding,
    );
  }

  async function saveCurrentDocument(force = false): Promise<boolean> {
    // 防重入：菜单加速键与前端 keydown 会并发触发保存，这里合并为一次。
    if (saveInProgress) {
      return false;
    }
    saveInProgress = true;
    try {
      return await saveCurrentDocumentInternal(force);
    } finally {
      saveInProgress = false;
    }
  }

  async function saveCurrentDocumentInternal(force = false): Promise<boolean> {
    const currentFile = fileStore.currentFile;
    if (!currentFile.path) {
      return saveCurrentDocumentAs();
    }

    try {
      const result = await persistDocument(currentFile.path, force, currentFile.lastModifiedTime);
      fileStore.markSaved(result.lastModifiedMs);
      // 编辑并保存成功的文件记入历史（规则 2：文件列表中打开后编辑保存的文件）
      recordRecentFile(currentFile.path);
      return true;
    } catch (error) {
      const appError = normalizeTauriError(error);
      if (appError.code === 'document_conflict' && !force) {
        const confirmed = await confirm('文件已被外部修改，是否强制覆盖？', {
          title: '检测到冲突',
          kind: 'warning',
          okLabel: '强制覆盖',
          cancelLabel: '取消',
        });
        if (!confirmed) {
          return false;
        }
        return saveCurrentDocumentInternal(true);
      }

      console.error('Failed to save document:', appError.message);
      await message(`保存失败: ${appError.message}`, { title: '错误', kind: 'error' });
      return false;
    }
  }

  async function saveCurrentDocumentAs(): Promise<boolean> {
    const currentFile = fileStore.currentFile;
    const defaultPath = currentFile.path
      ? dirname(currentFile.path)
      : fileStore.suggestedDir ?? undefined;
    const selected = await save({
      defaultPath,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (!selected) {
      return false;
    }

    try {
      const result = await persistDocument(selected, true, null);
      fileStore.setFile(fileStore.currentFile.content, result.path, result.lastModifiedMs);
      fileStore.markSaved(result.lastModifiedMs);
      clearExternalWarning();
      // 另存为后新路径记入历史
      recordRecentFile(result.path);
      return true;
    } catch (error) {
      const appError = normalizeTauriError(error);
      console.error('Failed to save document:', appError.message);
      await message(`保存失败: ${appError.message}`, { title: '错误', kind: 'error' });
      return false;
    }
  }

  function clearExternalWarning() {
    if (externalWarningTimer) {
      clearTimeout(externalWarningTimer);
      externalWarningTimer = null;
    }
    externalFileWarning.value = null;
  }

  function showExternalWarning(messageText: string) {
    clearExternalWarning();
    externalFileWarning.value = messageText;
    externalWarningTimer = setTimeout(() => {
      externalFileWarning.value = null;
      externalWarningTimer = null;
    }, 4000);
  }

  async function handleWorkspaceChange(payload: WorkspaceChangedPayload) {
    const currentPath = fileStore.currentFile.path;
    if (!currentPath || !payload.paths.includes(currentPath)) {
      return;
    }

    if (payload.kind === 'remove') {
      fileStore.reset();
      options.resetViewMode();
      showExternalWarning('当前文件已在外部被删除');
      return;
    }

    if (payload.kind !== 'modify' && payload.kind !== 'create') {
      return;
    }

    if (fileStore.currentFile.isDirty) {
      showExternalWarning('检测到外部修改，保存时会再次确认');
      return;
    }

    const loaded = await loadDocumentFromPath(currentPath, false);
    if (loaded) {
      showExternalWarning('已同步外部修改');
    }
  }

  function updateAutoSaveStatus(messageText: string) {
    if (autoSaveStatusTimer) {
      clearTimeout(autoSaveStatusTimer);
    }

    const timestamp = Date.now();
    autoSaveStatus.value = {
      message: messageText,
      timestamp,
    };
    autoSaveStatusTimer = setTimeout(() => {
      if (autoSaveStatus.value?.timestamp === timestamp) {
        autoSaveStatus.value = null;
      }
    }, 2000);
  }

  function stopAutoSave() {
    if (autoSaveIntervalId) {
      clearInterval(autoSaveIntervalId);
      autoSaveIntervalId = null;
    }
  }

  watch(
    () => [settingsStore.settings.autoSave, settingsStore.settings.autoSaveInterval] as const,
    ([enabled, intervalSeconds]) => {
      stopAutoSave();
      if (!enabled) {
        return;
      }

      autoSaveIntervalId = setInterval(async () => {
        if (!fileStore.currentFile.isDirty || !fileStore.currentFile.path) {
          return;
        }

        const saved = await saveCurrentDocument();
        if (saved) {
          updateAutoSaveStatus('已自动保存');
        }
      }, intervalSeconds * 1000);
    },
    { immediate: true },
  );

  onUnmounted(() => {
    stopAutoSave();
    if (autoSaveStatusTimer) {
      clearTimeout(autoSaveStatusTimer);
    }
    clearExternalWarning();
  });

  return {
    autoSaveStatus,
    externalFileWarning,
    loadDocumentFromPath,
    openDocumentWithPrompt,
    handleNewDocument,
    createNewMarkdown,
    handleOpenDocument,
    saveCurrentDocument,
    saveCurrentDocumentAs,
    handleWorkspaceChange,
  };
}
