/**
 * ProseMirror Document → Markdown 序列化器
 *
 * 将 ProseMirror 文档树转换为 markdown 字符串。
 * 自定义实现以精确控制输出格式，支持 GFM 表格、任务列表等扩展语法。
 */
import type { Node as PMNode, Mark } from '@tiptap/pm/model';
import { getPluginNodeSerializers } from './plugins';

// ── 序列化状态 ────────────────────────────────────���─────────────

export class MarkdownSerializerState {
  output = '';
  private closed: PMNode | null = null;
  private inTightList = false;

  // ── 源码行号 / 位置映射（供编辑器行号栏与状态栏光标使用）──
  /** 当前源码行（1-based），写入换行时自增 */
  lineCount = 1;
  /** 每个顶层块在源码中的起始行（1-based） */
  blockLineStarts: number[] = [];
  /** 当前正在序列化节点的绝对 PM 位置（顶层块从 1 开始） */
  activeAbsPos = 0;
  /** 文本字符 → 源码偏移映射：PM 位置（升序） */
  pmPositions: number[] = [];
  /** 对应的源码字符偏移 */
  srcOffsets: number[] = [];

  /** 统一追加输出并维护行计数 */
  private append(text: string) {
    this.output += text;
    if (text.length) {
      let nl = 0;
      for (let i = 0; i < text.length; i++) {
        if (text.charCodeAt(i) === 10) nl++;
      }
      this.lineCount += nl;
    }
  }

  /** 记录当前顶层块的源码起始行 */
  recordBlockStart() {
    this.blockLineStarts.push(this.lineCount);
  }

  /** 写入文本 */
  write(text: string) {
    this.flushClose();
    this.append(text);
  }

  /** 写入一行（末尾加换行） */
  writeLine(text: string) {
    this.write(text + '\n');
  }

  /** 确保输出以换行结尾 */
  ensureNewline() {
    if (this.output.length && !this.output.endsWith('\n')) {
      this.append('\n');
    }
  }

  /** 关闭段落（延迟写入换行，用于列表紧凑模式判断） */
  closeBlock(node: PMNode) {
    this.closed = node;
  }

  flushClose(extra = 0) {
    if (!this.closed) return;
    this.closed = null;
    this.ensureNewline();
    for (let i = 0; i < extra; i++) this.append('\n');
  }

  /** 增加空行分隔 */
  blankLine() {
    this.flushClose();
    this.ensureNewline();
    if (!this.output.endsWith('\n\n')) {
      this.append('\n');
    }
  }

  /** 序列化 inline 内容（position 映射基于当前节点的 activeAbsPos） */
  renderInline(parent: PMNode) {
    const parentContentStart = this.activeAbsPos + 1;
    parent.forEach((child, offset, index) => {
      if (child.isText) {
        this.renderMarks(child, parent, index, true);
        const hasCodeMark = child.marks.some((mark) => mark.type.name === 'code');
        const text = hasCodeMark ? (child.text ?? '') : this.escapeInline(child.text ?? '');
        // 逐字符记录 PM 位置 → 源码偏移
        const base = parentContentStart + offset;
        for (let i = 0; i < text.length; i++) {
          this.pmPositions.push(base + i);
          this.srcOffsets.push(this.output.length);
          this.append(text[i]);
        }
        this.renderMarks(child, parent, index, false);
      } else {
        this.renderMarks(child, parent, index, true);
        this.renderNode(child);
        this.renderMarks(child, parent, index, false);
      }
    });
  }

  private activeMarks: readonly Mark[] = [];

  /** 开启/关闭 marks */
  private renderMarks(node: PMNode, parent: PMNode, index: number, opening: boolean) {
    const marks = node.marks;
    if (opening) {
      // 开启新 marks
      for (const mark of marks) {
        if (!mark.isInSet(this.activeMarks)) {
          this.activeMarks = mark.addToSet(this.activeMarks);
          this.write(this.markDelimiter(mark, true));
        }
      }
    } else {
      const next = this.findNextNonToken(parent, index);
      for (let i = marks.length - 1; i >= 0; i--) {
        const mark = marks[i];
        if (!next || !mark.isInSet(next.marks)) {
          this.activeMarks = mark.removeFromSet(this.activeMarks);
          this.write(this.markDelimiter(mark, false));
        }
      }
    }
  }

  private markDelimiter(mark: Mark, _opening: boolean): string {
    switch (mark.type.name) {
      case 'bold': return '**';
      case 'italic': return '*';
      case 'strike': return '~~';
      case 'code': return '`';
      case 'highlight': return '==';
      case 'superscript': return '^';
      case 'subscript': return '~';
      case 'link':
        if (_opening) return '[';
        return `](${mark.attrs.href}${mark.attrs.title ? ` "${escapeLinkTitle(mark.attrs.title as string)}"` : ''})`;
      default: return '';
    }
  }

  private findNextNonToken(parent: PMNode, index: number): PMNode | null {
    for (let i = index + 1; i < parent.childCount; i++) {
      const child = parent.child(i);
      return child;
    }
    return null;
  }

  private escapeInline(text: string): string {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/([`[\]()*~^=!?|])/g, '\\$1');
  }

  /** 序列化节点 */
  renderNode(node: PMNode, absPos?: number) {
    if (absPos !== undefined) this.activeAbsPos = absPos;
    const handler = nodeSerializers[node.type.name];
    if (handler) {
      handler(this, node);
    } else {
      // 未知节点 → 按文本序列化
      if (node.isTextblock) {
        this.renderInline(node);
        this.closeBlock(node);
      } else {
        this.renderContent(node);
      }
    }
  }

  /** 递归序列化子节点（父子位置由 activeAbsPos 推导，无需额外参数） */
  renderContent(parent: PMNode) {
    const parentAbsPos = this.activeAbsPos;
    parent.forEach((child, offset, index) => {
      if (index > 0) {
        // 块级节点之间插入空行
        if (child.isBlock) {
          this.blankLine();
        }
      }
      const childAbsPos = parentAbsPos + 1 + offset;
      this.activeAbsPos = childAbsPos;
      this.renderNode(child, childAbsPos);
    });
  }

  /** 序列化列表 */
  renderList(node: PMNode, getDelim: (index: number, node: PMNode) => string) {
    const prevTight = this.inTightList;
    this.inTightList = true;
    const listAbsPos = this.activeAbsPos;
    node.forEach((child, offset, index) => {
      if (index > 0) this.ensureNewline();
      const delim = getDelim(index, child);
      this.write(delim);
      const childAbsPos = listAbsPos + 1 + offset;
      this.activeAbsPos = childAbsPos;
      this.renderContent(child);
    });
    this.inTightList = prevTight;
  }
}

// ── 节点序列化器 ──────────────────���─────────────────────────────

export type NodeSerializer = (state: MarkdownSerializerState, node: PMNode) => void;

const nodeSerializers: Record<string, NodeSerializer> = {
  doc(state, node) {
    state.renderContent(node);
  },

  paragraph(state, node) {
    if (node.childCount === 0) {
      state.write('\u00a0');
      state.closeBlock(node);
      return;
    }

    state.renderInline(node);
    state.closeBlock(node);
  },

  heading(state, node) {
    state.write('#'.repeat(node.attrs.level) + ' ');
    state.renderInline(node);
    state.closeBlock(node);
  },

  blockquote(state, node) {
    // 序列化引用块：逐行添加 > 前缀
    const inner = new MarkdownSerializerState();
    inner.renderContent(node);
    const text = inner.output.replace(/\n$/, '');
    const lines = text.split('\n');
    for (const line of lines) {
      state.writeLine(`> ${line}`);
    }
    state.closeBlock(node);
  },

  bulletList(state, node) {
    state.renderList(node, () => '- ');
  },

  orderedList(state, node) {
    const start = node.attrs.start ?? 1;
    state.renderList(node, (index) => `${start + index}. `);
  },

  listItem(state, node) {
    state.renderContent(node);
  },

  taskList(state, node) {
    state.renderList(node, (_index, child) => {
      const checked = child.attrs.checked;
      return checked ? '- [x] ' : '- [ ] ';
    });
  },

  taskItem(state, node) {
    state.renderContent(node);
  },

  codeBlock(state, node) {
    const lang = node.attrs.language || '';
    state.writeLine('```' + lang);
    // 记录代码内容的 PM→源码位置映射
    const code = node.textContent;
    const base = state.activeAbsPos + 1;
    for (let i = 0; i < code.length; i++) {
      state.pmPositions.push(base + i);
      state.srcOffsets.push(state.output.length);
      state.write(code[i]);
    }
    // 保证关闭围栏独占一行：若代码内容不以换行结尾，补一个换行，
    // 并将该换行映射到最后一个代码字符的 PM 位置（避免 Y.-5``` 这类畸形输出）。
    if (code.length === 0 || !code.endsWith('\n')) {
      state.pmPositions.push(base + Math.max(0, code.length - 1));
      state.srcOffsets.push(state.output.length);
      state.write('\n');
    }
    state.writeLine('```');
    state.closeBlock(node);
  },

  horizontalRule(state, node) {
    state.writeLine('---');
    state.closeBlock(node);
  },

  hardBreak(state) {
    state.write('  \n');
  },

  image(state, node) {
    const alt = node.attrs.alt || '';
    const src = node.attrs.src || '';
    const title = node.attrs.title;
    if (title) {
      state.write(`![${alt}](${src} "${escapeLinkTitle(title as string)}")`);
    } else {
      state.write(`![${alt}](${src})`);
    }
  },

  // ── 表格 ──

  table(state, node) {
    const rows: PMNode[] = [];
    node.forEach((row) => rows.push(row));
    if (rows.length === 0) return;

    // 收集列数
    const colCount = rows[0].childCount;

    // 计算每列最大宽度
    const colWidths: number[] = Array(colCount).fill(3); // 最小3（分隔行 ---）
    for (const row of rows) {
      row.forEach((cell, _offset, colIndex) => {
        const text = cellToText(cell);
        colWidths[colIndex] = Math.max(colWidths[colIndex], text.length);
      });
    }

    // 序列化每行
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const cells: string[] = [];
      row.forEach((cell, _offset, colIndex) => {
        const text = cellToText(cell);
        cells.push(text.padEnd(colWidths[colIndex]));
      });
      state.writeLine('| ' + cells.join(' | ') + ' |');

      // 在第一行（表头）后插入分隔行
      if (r === 0) {
        const sep = colWidths.map(w => '-'.repeat(w));
        state.writeLine('| ' + sep.join(' | ') + ' |');
      }
    }
    state.closeBlock(node);
  },

  tableRow() { /* handled by table */ },
  tableHeader() { /* handled by table */ },
  tableCell() { /* handled by table */ },

  // ── 插件节点 ──

  ...getPluginNodeSerializers(),

};

/** 将表格单元格节点序列化为纯文本（含 inline 标记） */
function cellToText(cell: PMNode): string {
  const s = new MarkdownSerializerState();
  cell.forEach((child) => {
    if (child.type.name === 'paragraph') {
      s.renderInline(child);
    } else {
      s.renderNode(child);
    }
  });
  return s.output.trim().replace(/ {2}\n/g, '<br>').replace(/\n/g, '<br>');
}

function escapeLinkTitle(title: string): string {
  return title.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// ── 导出 ─────────────────��────────────��───────────────────────

export interface SourceMap {
  /** 序列化后的 Markdown 原文 */
  markdown: string;
  /** 文本字符的 PM 位置（升序） */
  pmPositions: number[];
  /** 对应的源码字符偏移 */
  srcOffsets: number[];
  /** 每个顶层块在源码中的起始行（1-based） */
  blockLineStarts: number[];
}

// 按 doc 引用缓存序列化结果，避免每次选区变化都重算
let cachedDoc: PMNode | null = null;
let cachedMap: SourceMap | null = null;

export function serializeWithMap(doc: PMNode): SourceMap {
  if (cachedDoc === doc && cachedMap) return cachedMap;
  const state = new MarkdownSerializerState();
  // 顶层子节点绝对位置 = offset（doc 的有效位置为 -1，故 -1 + 1 + offset = offset）
  doc.forEach((child, offset, index) => {
    if (index > 0) state.blankLine();
    state.recordBlockStart();
    state.renderNode(child, offset);
  });
  let output = state.output;
  // 确保文件以单个换行结尾
  output = output.replace(/\n*$/, '\n');
  const result: SourceMap = {
    markdown: output,
    pmPositions: state.pmPositions,
    srcOffsets: state.srcOffsets,
    blockLineStarts: state.blockLineStarts,
  };
  cachedDoc = doc;
  cachedMap = result;
  return result;
}

export function serializeMarkdown(doc: PMNode): string {
  return serializeWithMap(doc).markdown;
}

/** 返回每个顶层块在源码中的起始行（1-based） */
export function getBlockLineStarts(doc: PMNode): number[] {
  return serializeWithMap(doc).blockLineStarts;
}

/** 二分查找：不大于 from 的最大 PM 位置对应的源码偏移；无匹配返回 -1 */
function findSrcOffset(pmPos: number[], srcOff: number[], from: number): number {
  let lo = 0;
  let hi = pmPos.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (pmPos[mid] <= from) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (ans < 0) return -1;
  return srcOff[ans] + (from - pmPos[ans]);
}

/** 由源码偏移计算 1-based 行/列 */
function offsetToLineCol(markdown: string, srcOffset: number): { line: number; col: number } {
  const before = markdown.slice(0, srcOffset);
  const line = before.split('\n').length;
  const lastNl = before.lastIndexOf('\n');
  const col = srcOffset - lastNl;
  return { line, col };
}

/**
 * 计算光标在源码（.md 文件）中的行/列。
 * 段落、标题、列表、代码块等核心块精确映射；
 * 引用块/标注/公式/表格等未逐一映射的块回退为「块起始行 + 列 1」。
 */
const MAPPED_BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'taskList',
  'codeBlock',
]);

export function getSourceCursor(
  doc: PMNode,
  from: number,
): { line: number; col: number } {
  const { markdown, pmPositions, srcOffsets, blockLineStarts } = serializeWithMap(doc);

  // 定位包含光标的顶层块及其类型
  let blockIndex = 0;
  let blockType = '';
  doc.forEach((node, offset, index) => {
    const start = 1 + offset;
    const end = start + node.nodeSize;
    if (from >= start && from <= end) {
      blockIndex = index;
      blockType = node.type.name;
    }
  });

  if (MAPPED_BLOCK_TYPES.has(blockType)) {
    const srcOffset = findSrcOffset(pmPositions, srcOffsets, from);
    if (srcOffset >= 0) {
      return offsetToLineCol(markdown, srcOffset);
    }
  }

  // 回退：使用包含光标的顶层块的源码起始行
  return { line: blockLineStarts[blockIndex] ?? 1, col: 1 };
}
