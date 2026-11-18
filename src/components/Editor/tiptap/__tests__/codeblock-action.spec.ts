// @vitest-environment happy-dom
/**
 * 悬浮菜单「转换为代码块」动作测试。
 *
 * `runBubbleMenuAction(editor, 'codeBlock')` 依赖真实的 Editor 实例，
 * 因此这里只加载 StarterKit 并用 happy-dom 提供 DOM 环境。
 * 注：编辑器会在文档末尾自动补一个空段落（trailing node），断言时忽略它。
 */
import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import { runBubbleMenuAction } from '../editor-commands';

function makeEditor(html: string) {
  return new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit],
    content: html,
  });
}

/** 去掉末尾自动补的空段落，只看内容块 */
function contentBlocks(editor: Editor) {
  const blocks = [];
  const doc = editor.state.doc;
  for (let i = 0; i < doc.childCount; i++) {
    const child = doc.child(i);
    if (child.type.name === 'paragraph' && child.content.size === 0 && i === doc.childCount - 1) {
      continue;
    }
    blocks.push(child);
  }
  return blocks;
}

describe('runBubbleMenuAction: codeBlock', () => {
  it('多段落选择合并为单个代码块，段落间保留换行', () => {
    const editor = makeEditor('<p>a1</p><p>a2</p><p>a3</p>');
    const end = editor.state.doc.content.size - 1;
    editor.commands.setTextSelection({ from: 1, to: end });
    runBubbleMenuAction(editor, 'codeBlock');

    const blocks = contentBlocks(editor);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type.name).toBe('codeBlock');
    expect(blocks[0].textContent).toBe('a1\na2\na3');
    editor.destroy();
  });

  it('部分选中且跨块时，按各自整块合并进同一代码块', () => {
    const editor = makeEditor('<p>hello world</p><p>second line</p>');
    editor.commands.setTextSelection({ from: 3, to: 20 });
    runBubbleMenuAction(editor, 'codeBlock');

    const blocks = contentBlocks(editor);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type.name).toBe('codeBlock');
    expect(blocks[0].textContent).toBe('hello world\nsecond line');
    editor.destroy();
  });

  it('选区只落在单个块内时，只转换该块', () => {
    const editor = makeEditor('<p>hello world</p><p>second</p>');
    editor.commands.setTextSelection({ from: 3, to: 8 });
    runBubbleMenuAction(editor, 'codeBlock');

    const blocks = contentBlocks(editor);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type.name).toBe('codeBlock');
    expect(blocks[0].textContent).toBe('hello world');
    expect(blocks[1].type.name).toBe('paragraph');
    expect(blocks[1].textContent).toBe('second');
    editor.destroy();
  });

  it('已处于代码块内时还原为段落', () => {
    const editor = makeEditor('<pre><code>x</code></pre>');
    editor.commands.setTextSelection({ from: 2, to: 3 });
    runBubbleMenuAction(editor, 'codeBlock');

    const blocks = contentBlocks(editor);
    expect(blocks[0].type.name).toBe('paragraph');
    expect(blocks[0].textContent).toBe('x');
    editor.destroy();
  });
});
