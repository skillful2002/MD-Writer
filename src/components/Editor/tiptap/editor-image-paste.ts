import type { EditorView } from '@tiptap/pm/view';

import { useFileStore } from '../../../stores/file';
import { saveDocumentImage } from '../../../services/tauri/document';

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];

function extFromMime(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    case 'image/svg+xml':
      return 'svg';
    default:
      return 'png';
  }
}

function buildImageFileName(file: File): string {
  const name = file.name?.trim() || '';
  const hasImageExt = IMAGE_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(`.${ext}`));
  if (hasImageExt) return name;
  return `pasted-${Date.now()}.${extFromMime(file.type)}`;
}

function findPastedImage(clipboard: DataTransfer): File | null {
  if (clipboard.files && clipboard.files.length > 0) {
    for (const file of Array.from(clipboard.files)) {
      if (file.type.startsWith('image/')) return file;
    }
  }

  const items = clipboard.items;
  if (items) {
    for (const item of Array.from(items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) return file;
      }
    }
  }

  return null;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    for (let j = 0; j < chunk.length; j++) {
      binary += String.fromCharCode(chunk[j]);
    }
  }
  return btoa(binary);
}

export function emitImagePasteWarning(message: string) {
  window.dispatchEvent(new CustomEvent('image-paste-warning', { detail: message }));
}

/**
 * 同步判断剪贴板中是否包含可被落盘处理的图片文件。
 * 用于在 editorProps.handlePaste 中返回 boolean（ProseMirror 不允许异步返回值）。
 */
export function isPastedImage(event: ClipboardEvent): boolean {
  const clipboard = event.clipboardData;
  if (!clipboard) return false;
  return findPastedImage(clipboard) !== null;
}

/**
 * 把剪贴板中的图片落盘到文档同级的 .images/ 文件夹，并插入为相对路径图片节点。
 * 调用方需先用 isPastedImage 判定为图片粘贴，并以同步方式返回 true 阻止默认处理。
 */
export async function handleEditorImagePaste(
  view: EditorView,
  event: ClipboardEvent,
): Promise<void> {
  const clipboard = event.clipboardData;
  if (!clipboard) return;

  const file = findPastedImage(clipboard);
  if (!file) return;

  const documentPath = useFileStore().currentFile.path;
  if (!documentPath) {
    event.preventDefault();
    emitImagePasteWarning('请先保存文档后再粘贴图片，未保存的文档无法将图片保存到本地。');
    return;
  }

  event.preventDefault();

  try {
    const buffer = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);
    const fileName = buildImageFileName(file);
    const saved = await saveDocumentImage(documentPath, fileName, base64);

    const imageType = view.state.schema.nodes.image;
    const node = imageType.create({ src: saved.relativePath, alt: '' });
    const tr = view.state.tr.replaceSelectionWith(node).scrollIntoView();
    view.dispatch(tr);
  } catch (err) {
    console.error('Failed to handle pasted image:', err);
    emitImagePasteWarning('图片粘贴失败，请重试或将图片保存到本地后拖拽插入。');
  }
}
