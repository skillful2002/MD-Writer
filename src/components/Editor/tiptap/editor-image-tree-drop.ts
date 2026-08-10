import type { EditorView } from '@tiptap/pm/view';

import { useFileStore } from '../../../stores/file';
import { emitImagePasteWarning } from './editor-image-paste';

/** 应用内文件树拖拽图片时使用的自定义 MIME，值为图片文件的绝对路径。 */
export const TREE_IMAGE_MIME = 'application/x-markdowned-tree-image';

/**
 * 同源拖拽（文件树 -> 编辑器）时，Tauri/macOS 的 WKWebView 常在 drop 阶段把
 * dataTransfer 清空，导致 drop 事件里读不到路径。由于拖拽两端都在本应用内，
 * 这里在 dragstart 时把路径暂存到模块级变量，drop 时直接读取，绕开 dataTransfer。
 */
let pendingTreeImagePath: string | null = null;

/** 文件树节点拖拽开始时，把图片的绝对路径写入 dataTransfer 并暂存。 */
export function setTreeImageDragData(event: DragEvent, imagePath: string) {
  const dataTransfer = event.dataTransfer;
  if (dataTransfer) {
    dataTransfer.effectAllowed = 'copy';
    dataTransfer.setData(TREE_IMAGE_MIME, imagePath);
    dataTransfer.setData('text/plain', imagePath);
  }
  pendingTreeImagePath = imagePath;
}

/** 拖拽结束（含取消）时清理暂存，避免影响后续拖拽。 */
export function clearTreeImageDragData() {
  pendingTreeImagePath = null;
}

/** dragover 阶段仅能读到类型，用来判断是否是我们自己的图片拖拽。 */
export function isTreeImageDrag(event: DragEvent): boolean {
  if (pendingTreeImagePath) return true;
  const dataTransfer = event.dataTransfer;
  if (!dataTransfer) return false;
  return (
    dataTransfer.types.includes(TREE_IMAGE_MIME) ||
    dataTransfer.types.includes('text/plain')
  );
}

/**
 * 从 drop 事件中取出图片绝对路径。只认模块级暂存值（dragstart 时写入），
 * 不回退到 dataTransfer，避免与 OS 文件拖入（handleEditorImageDrop）误判重复。
 */
export function getTreeImageDropPath(_event: DragEvent): string | null {
  if (!pendingTreeImagePath) return null;
  const path = pendingTreeImagePath;
  pendingTreeImagePath = null;
  return path;
}

function dirname(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  return index <= 0 ? '' : normalized.slice(0, index);
}

function baseNameNoExt(path: string): string {
  const name = path.split(/[\\/]/).pop() || 'image';
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/** 计算从 baseDir 到 target 文件的相对路径（跨盘符时退回绝对路径）。 */
export function relativePathFrom(baseDir: string, target: string): string {
  const split = (value: string) => value.replace(/\\/g, '/').split('/').filter(Boolean);
  const base = split(baseDir);
  const targetParts = split(target);

  if (base[0]?.toLowerCase() !== targetParts[0]?.toLowerCase()) {
    return target;
  }

  let shared = 0;
  while (
    shared < base.length &&
    shared < targetParts.length &&
    base[shared].toLowerCase() === targetParts[shared].toLowerCase()
  ) {
    shared += 1;
  }

  const up = base.length - shared;
  const relative = [...Array<string>(up).fill('..'), ...targetParts.slice(shared)];
  return relative.join('/');
}

/**
 * 在光标（或落点坐标）处插入一张图片节点。返回是否成功插入。
 * 优先使用鼠标放开时的坐标；坐标落在非文本块时退到该块内部位置；
 * 仍不可用时才回退到当前选区，确保总是尽量贴近用户松手的位置。
 */
export function insertImageAtCoords(
  view: EditorView,
  event: DragEvent | null,
  src: string,
  alt: string,
): boolean {
  const imageType = view.state.schema.nodes.image;
  if (!imageType) return false;
  const node = imageType.create({ src, alt });

  const isUsableTextblock = (pos: number): boolean => {
    const $pos = view.state.doc.resolve(pos);
    return $pos.parent.isTextblock && !$pos.parent.type.spec.code;
  };

  let position = view.state.selection.from;
  if (event) {
    const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
    if (coords) {
      if (isUsableTextblock(coords.pos)) {
        position = coords.pos;
      } else if (coords.inside >= 0 && isUsableTextblock(coords.inside)) {
        position = coords.inside;
      }
    }
  }

  try {
    view.dispatch(view.state.tr.insert(position, node).scrollIntoView());
  } catch {
    view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView());
  }

  return true;
}

/**
 * 编辑器内 drop 来自文件树的图片时：复用已有文件，写入相对路径引用，
 * 不复制到 .images/。返回 true 表示已处理（阻止默认/OS 落盘逻辑）。
 */
export function handleEditorTreeImageDrop(view: EditorView, event: DragEvent): boolean {
  const imagePath = getTreeImageDropPath(event);
  if (!imagePath) return false;

  const documentPath = useFileStore().currentFile.path;
  if (!documentPath) {
    event.preventDefault();
    emitImagePasteWarning('请先保存文档后再插入图片引用。');
    return true;
  }

  event.preventDefault();

  const relativePath = relativePathFrom(dirname(documentPath), imagePath);
  insertImageAtCoords(view, event, relativePath, baseNameNoExt(imagePath));
  return true;
}
