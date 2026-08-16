import type { Ref } from 'vue';
import { onUnmounted, watch } from 'vue';
import { message } from '../services/tauri/dialog';
import type { AppOpenPathsPayload } from '../services/tauri/events';
import { listenAppOpenPaths, listenWindowCloseRequested } from '../services/tauri/events';
import { listenCurrentWebviewDragDrop } from '../services/tauri/webview';
import {
  consumeStartupOpenRequest,
  consumeWindowOpenRequest,
  destroyCurrentWindow,
  isCurrentWindowFullscreen,
  notifyFrontendReady,
  openEditorWindow,
  setCurrentWindowFullscreen,
  setCurrentWindowTitle,
} from '../services/tauri/window';
import { saveAllWindowState } from '../services/tauri/window-state';

interface AppWindowSessionOptions {
  openDocument: (path: string) => void | Promise<void>;
  saveDocument: () => Promise<boolean>;
  isDirty: () => boolean;
  windowTitle: Ref<string>;
}

const SAVE_LABEL = '保存';
const DISCARD_LABEL = '不保存';
const CANCEL_LABEL = '取消';

export async function confirmUnsavedChanges(): Promise<'save' | 'discard' | 'cancel'> {
  // 单个三按钮对话框（保存 / 不保存 / 取消），避免两段式确认弹出两个对话框。
  // 注意：tauri-plugin-dialog 对自定义按钮返回的是「被点按钮的标签文本」
  // （desktop.rs 将 rfd 结果映射为 Custom(label)），因此按标签比较；
  // 同时保留 'yes'/'no' 等 key 形式作为防御。
  const result = await message(
    '文件未保存，是否保存后再继续？\n\n选择"保存"保存文件，选择"不保存"放弃更改，选择"取消"返回编辑。',
    {
      title: '未保存的更改',
      kind: 'warning',
      buttons: { yes: SAVE_LABEL, no: DISCARD_LABEL, cancel: CANCEL_LABEL },
    },
  );
  if (result === SAVE_LABEL || result === 'yes' || result === 'Yes') {
    return 'save';
  }
  if (result === DISCARD_LABEL || result === 'no' || result === 'No') {
    return 'discard';
  }
  return 'cancel';
}

export function useAppWindowSession(options: AppWindowSessionOptions) {
  let unlistenAppOpenPaths: (() => void) | null = null;
  let unlistenCloseRequest: (() => void) | null = null;
  let unlistenDragDrop: (() => void) | null = null;
  let removeDragOverListener: (() => void) | null = null;
  let removeDropListener: (() => void) | null = null;
  let stopTitleWatcher: (() => void) | null = null;

  // Cmd+Q 会同时触发「菜单 app.quit」和「窗口 CloseRequested」两条路径，
  // 二者都会走到 handleCloseRequest。用互斥标记让并发调用合并为一次，
  // 避免弹出重复的"未保存的更改/确认放弃更改"对话框。
  let closeInProgress = false;

  async function handleOpenPayload(payload: AppOpenPathsPayload | null | undefined) {
    const firstPath = payload?.paths[0];
    if (!firstPath) {
      return;
    }
    await options.openDocument(firstPath);
  }

  async function handleCloseRequest() {
    if (closeInProgress) {
      return;
    }
    closeInProgress = true;
    try {
      if (options.isDirty()) {
        const result = await confirmUnsavedChanges();
        if (result === 'cancel') {
          return;
        }
        if (result === 'save') {
          const saved = await options.saveDocument();
          if (!saved) {
            return;
          }
        }
      }

      await saveAllWindowState().catch(() => undefined);
      await destroyCurrentWindow();
    } finally {
      closeInProgress = false;
    }
  }

  async function setupDragDrop() {
    const preventNavigation = (event: DragEvent) => {
      event.preventDefault();
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('dragover', preventNavigation);
      document.addEventListener('drop', preventNavigation);
      removeDragOverListener = () => {
        document.removeEventListener('dragover', preventNavigation);
      };
      removeDropListener = () => {
        document.removeEventListener('drop', preventNavigation);
      };
    }

    unlistenDragDrop = await listenCurrentWebviewDragDrop(async (event) => {
      if (event.payload.type !== 'drop') {
        return;
      }
      const documentPath = event.payload.paths.find((path) => /\.(md|markdown|txt)$/i.test(path));
      if (documentPath) {
        await options.openDocument(documentPath);
      }
    });
  }

  async function setup() {
    stopTitleWatcher = watch(
      options.windowTitle,
      (title) => {
        setCurrentWindowTitle(title).catch((error: string) => {
          if (!String(error).includes('window.set_title not allowed')) {
            console.error('Failed to set window title:', error);
          }
        });
      },
      { immediate: true },
    );

    unlistenAppOpenPaths = await listenAppOpenPaths(handleOpenPayload);
    unlistenCloseRequest = await listenWindowCloseRequested(async () => {
      await handleCloseRequest();
    });

    await handleOpenPayload(await consumeStartupOpenRequest());
    await handleOpenPayload(await consumeWindowOpenRequest());
    await setupDragDrop();
    await handleOpenPayload(await notifyFrontendReady());
  }

  function cleanup() {
    unlistenAppOpenPaths?.();
    unlistenAppOpenPaths = null;
    unlistenCloseRequest?.();
    unlistenCloseRequest = null;
    unlistenDragDrop?.();
    unlistenDragDrop = null;
    removeDragOverListener?.();
    removeDragOverListener = null;
    removeDropListener?.();
    removeDropListener = null;
    stopTitleWatcher?.();
    stopTitleWatcher = null;
  }

  async function handleOpenEditorWindow(path?: string) {
    await openEditorWindow(path);
  }

  async function toggleFullscreen() {
    await setCurrentWindowFullscreen(!(await isCurrentWindowFullscreen()));
  }

  async function handleQuit() {
    await handleCloseRequest();
  }

  onUnmounted(cleanup);

  return {
    setup,
    cleanup,
    handleOpenEditorWindow,
    toggleFullscreen,
    handleQuit,
  };
}
