/**
 * 源码行号 ↔ pm doc 位置 往返验证（支撑「源码/编辑模式切换后保持光标所在行」）
 *
 * 关键链路：
 *   line ──(lineToPmPos)──▶ pmPos ──(getSourceCursor)──▶ line
 *
 * 纯 schema 测试，不依赖 DOM/Editor。
 */
import { describe, it, expect } from 'vitest';
import { Schema, type Node as PMNode } from '@tiptap/pm/model';
import { parseMarkdown } from '../parser';
import { serializeWithMap, getSourceCursor, lineToPmPos, type SourceMap } from '../serializer';

function createTestSchema(): Schema {
  return new Schema({
    nodes: {
      doc: { content: 'block+' },
      paragraph: { group: 'block', content: 'inline*', parseDOM: [{ tag: 'p' }], toDOM: () => ['p', 0] },
      heading: {
        group: 'block', content: 'inline*', attrs: { level: { default: 1 } }, defining: true,
        parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${level}`, attrs: { level } })),
        toDOM: (node: PMNode) => [`h${node.attrs.level}`, 0],
      },
      blockquote: { group: 'block', content: 'block+', parseDOM: [{ tag: 'blockquote' }], toDOM: () => ['blockquote', 0] },
      bulletList: { group: 'block', content: 'listItem+', parseDOM: [{ tag: 'ul' }], toDOM: () => ['ul', 0] },
      orderedList: { group: 'block', content: 'listItem+', attrs: { start: { default: 1 } }, parseDOM: [{ tag: 'ol' }], toDOM: () => ['ol', 0] },
      listItem: { content: 'block+', parseDOM: [{ tag: 'li' }], toDOM: () => ['li', 0] },
      codeBlock: {
        group: 'block', content: 'text*', marks: '', code: true, attrs: { language: { default: null } },
        parseDOM: [{ tag: 'pre' }], toDOM: () => ['pre', ['code', 0]],
      },
      hardBreak: { inline: true, group: 'inline', selectable: false, parseDOM: [{ tag: 'br' }], toDOM: () => ['br'] },
      horizontalRule: { group: 'block', parseDOM: [{ tag: 'hr' }], toDOM: () => ['hr'] },
      table: {
        group: 'block', content: 'tableRow+', tableRole: 'table',
        parseDOM: [{ tag: 'table' }], toDOM: () => ['table', ['tbody', 0]],
      },
      tableRow: {
        content: '(tableHeader | tableCell)+', tableRole: 'row',
        parseDOM: [{ tag: 'tr' }], toDOM: () => ['tr', 0],
      },
      tableHeader: {
        content: 'paragraph+', tableRole: 'header_cell', isolating: true,
        parseDOM: [{ tag: 'th' }], toDOM: () => ['th', 0],
      },
      tableCell: {
        content: 'paragraph+', tableRole: 'cell', isolating: true,
        parseDOM: [{ tag: 'td' }], toDOM: () => ['td', 0],
      },
      text: { group: 'inline' },
    },
    marks: {},
  });
}

const schema = createTestSchema();

describe('lineToPmPos 行号→位置', () => {
  // 模拟序列化结果：第 1 行是标题（文本从偏移 2 起，前缀 # 占 0-1），第 3 行是段落（偏移 10 起）
  const map: SourceMap = {
    markdown: '# 标题\n\n段落文字\n',
    srcOffsets: [2, 3, 4, 10, 11, 12],
    pmPositions: [1, 2, 3, 8, 9, 10],
    blockLineStarts: [1, 3],
    blockPmStarts: [1, 7],
  };

  it('目标行落在带前缀块 → 返回该块首个文本字符的 pm 位置（不走上一块）', () => {
    expect(lineToPmPos(map, 1)).toBe(1);
  });

  it('目标行在普通段落 → 返回该行首个文本字符的 pm 位置', () => {
    expect(lineToPmPos(map, 3)).toBe(8);
  });

  it('目标行超过最大映射 → 回退到末尾块的 PM 起始位置', () => {
    expect(lineToPmPos(map, 99)).toBe(7);
  });

  it('目标行在无文本映射的块（引用/表格）→ 回退到该块的 PM 起始位置', () => {
    const m: SourceMap = {
      markdown: '段落一\n\n> 引用文字\n',
      srcOffsets: [0, 1, 2], // 仅「段落一」有文本映射
      pmPositions: [1, 2, 3],
      blockLineStarts: [1, 3],
      blockPmStarts: [1, 7], // 引用块第 2 个顶层块，PM 起始 7
    };
    // 第 3 行是引用块，无文本映射点 → 回退到 blockPmStarts[1]=7
    expect(lineToPmPos(m, 3)).toBe(7);
  });

  it('空映射表 → 返回 0', () => {
    expect(lineToPmPos({ markdown: '', srcOffsets: [], pmPositions: [], blockLineStarts: [], blockPmStarts: [] }, 5)).toBe(0);
  });
});

describe('源码行号 → pm 位置 → 行号 往返', () => {
  const md = [
    '# 标题一',
    '',
    '第一段文字。',
    '',
    '## 标题二',
    '第二段文字，含强调与加粗。',
    '',
    '- 列表项一',
    '- 列表项二',
    '',
    '> 引用一段',
  ].join('\n');

  const doc = parseMarkdown(schema, md);
  const map = serializeWithMap(doc);
  const lines = map.markdown.split('\n');

  it('每个非空行都能通过 lineToPmPos 映射回自身行号（含引用块回退）', () => {
    // 空行无文本映射点（映射表只记录文本字符），跳过；序列化强制的尾随换行也跳过
    for (let line = 1; line < lines.length; line++) {
      if (lines[line - 1].trim() === '') continue;
      const pos = lineToPmPos(map, line);
      const got = getSourceCursor(doc, pos).line;
      expect(got, `第 ${line} 行应映射回自身，实际得到 ${got}`).toBe(line);
    }
  });

  it('首行通过 lineToPmPos 映射到自身', () => {
    const pos = lineToPmPos(map, 1);
    expect(getSourceCursor(doc, pos).line).toBe(1);
  });

  it('引用块（第 12 行）精确回退到自身行号', () => {
    const pos = lineToPmPos(map, 12);
    expect(getSourceCursor(doc, pos).line).toBe(12);
  });
});
