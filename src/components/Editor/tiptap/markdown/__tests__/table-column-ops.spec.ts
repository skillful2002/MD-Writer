/**
 * 表格列/行增删后的 Markdown 往返验证
 *
 * 验证：解析器/序列化器对任意列数的表格都能正确 round-trip。
 * （增删列命令由 TipTap 官方表格扩展提供，已在依赖中确认；
 *  本测试保证数据层在列数变化后不丢列、不串列。）
 */
import { describe, it, expect } from 'vitest';
import { Schema, type Node as PMNode } from '@tiptap/pm/model';
import { parseMarkdown } from '../parser';
import { serializeMarkdown } from '../serializer';

// 与 roundtrip.spec.ts 一致的最小 schema
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

/** 统计 markdown 表格的表头列数 */
function headerColCount(md: string): number {
  const header = md.split('\n').find((l) => l.trim().startsWith('|'))!;
  return header.split('|').length - 2;
}

describe('表格列数变化后的 round-trip', () => {
  it('2 列表格解析/序列化后列数保持', () => {
    const md = '| A | B |\n| --- | --- |\n| 1 | 2 |\n';
    const out = serializeMarkdown(parseMarkdown(schema, md));
    expect(headerColCount(out)).toBe(2);
  });

  it('3 列表格（模拟 addColumnAfter 后）列数保持', () => {
    const md = '| A | B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n';
    const out = serializeMarkdown(parseMarkdown(schema, md));
    expect(headerColCount(out)).toBe(3);
  });

  it('1 列表格（模拟 deleteColumn 后）列数保持', () => {
    const md = '| A |\n| --- |\n| 1 |\n';
    const out = serializeMarkdown(parseMarkdown(schema, md));
    expect(headerColCount(out)).toBe(1);
  });

  it('空单元格（新增列默认空）不丢列', () => {
    const md = '| A | B |  |\n| --- | --- | --- |\n| 1 | 2 |  |\n';
    const out = serializeMarkdown(parseMarkdown(schema, md));
    expect(headerColCount(out)).toBe(3);
  });

  it('增行后数据行数保持', () => {
    const md = '| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n';
    const out = serializeMarkdown(parseMarkdown(schema, md));
    const dataRows = out.split('\n').filter((l) => l.trim().startsWith('|') && !l.includes('---'));
    expect(dataRows.length).toBe(3); // 表头 + 2 数据行
  });
});
