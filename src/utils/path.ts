/**
 * 跨平台路径工具（仅处理正斜杠与反斜杠，不依赖 Node 运行时）。
 */

/** 返回路径的目录部分。无分隔符时返回空字符串（表示当前/根目录）。 */
export function dirname(path: string): string {
  const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return idx <= 0 ? '' : path.slice(0, idx);
}

/** 返回路径的最后一段（文件名/目录名）。 */
export function basename(path: string): string {
  const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return idx === -1 ? path : path.slice(idx + 1);
}
