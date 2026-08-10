import type { EditorView } from '@tiptap/pm/view';

import { useFileStore } from '../../../stores/file';
import { saveDocumentImage } from '../../../services/tauri/document';
import { arrayBufferToBase64, emitImagePasteWarning } from './editor-image-paste';
import {
  handleEditorTreeImageDrop,
  insertImageAtCoords,
  isTreeImageDrag,
} from './editor-image-tree-drop';

const OS_IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'svg',
  'webp',
  'bmp',
]);

function isOsImageFile(file: File): boolean {
  if (file.type?.startsWith('image/')) return true;
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  return OS_IMAGE_EXTENSIONS.has(ext);
}

function baseNameNoExt(path: string): string {
  const name = path.split(/[\\/]/).pop() || 'image';
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/**
 * 同步判断拖拽悬停时是否需要允许 drop（阻止默认行为，显示放置光标）。
 * 文件树图片拖拽与 OS 文件拖拽都需要拦截。
 */
export function isEditorImageDragOver(event: DragEvent): boolean {
  if (isTreeImageDrag(event)) return true;
  const types = event.dataTransfer?.types;
  if (types && Array.from(types).includes('Files')) return true;
  return false;
}

/**
 * 统一处理编辑器内的拖放：
 *   1. 文件树图片拖入 —— 引用已有文件，写入相对路径，不复制到 .images/；
 *   2. OS 文件拖入 —— 读取图片字节落盘到文档同级 .images/，插入相对路径。
 * 返回 true 表示已处理（阻止 ProseMirror 默认处理）。异步落盘在后台执行。
 */
export function handleEditorImageDrop(view: EditorView, event: DragEvent): boolean {
  // 1. 文件树拖入（引用已有文件）
  if (handleEditorTreeImageDrop(view, event)) return true;

  // 2. OS 文件拖入（落盘到 .images/）
  const files = event.dataTransfer?.files;
  if (!files || files.length === 0) return false;

  const documentPath = useFileStore().currentFile.path;
  if (!documentPath) {
    event.preventDefault();
    emitImagePasteWarning('请先保存文档后再拖入图片，未保存的文档无法将图片保存到本地。');
    return true;
  }

  event.preventDefault();
  void handleOsImageFilesDrop(view, event, documentPath);
  return true;
}

async function handleOsImageFilesDrop(
  view: EditorView,
  event: DragEvent,
  documentPath: string,
): Promise<void> {
  const files = Array.from(event.dataTransfer?.files ?? []);
  for (const file of files) {
    if (!isOsImageFile(file)) continue;

    try {
      const buffer = await file.arrayBuffer();
      const base64 = arrayBufferToBase64(buffer);
      const fileName = file.name?.trim() || `dropped-${Date.now()}.png`;
      const saved = await saveDocumentImage(documentPath, fileName, base64);
      insertImageAtCoords(view, event, saved.relativePath, baseNameNoExt(fileName));
    } catch (err) {
      console.error('Failed to handle dropped image:', err);
      emitImagePasteWarning('图片拖入失败，请重试。');
    }
  }
}
