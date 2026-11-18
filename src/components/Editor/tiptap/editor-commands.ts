import type { Editor as TiptapEditor } from '@tiptap/vue-3';

export interface BubbleMenuActionData {
  href?: string;
}

/**
 * 把当前选区转换为一个围栏代码块。
 *
 * 跨多个段落选择时，各段落按换行合并进同一个代码块，而不是拆成多个代码块，
 * 因此这里直接构造 codeBlock 节点替换整块区间，而不走 toggleCodeBlock()。
 * 选区位于列表、引用等嵌套结构内时，退回内置的 toggleCodeBlock()。
 */
function convertSelectionToCodeBlock(editor: TiptapEditor): boolean {
  const { state } = editor;
  const { from, to, empty } = state.selection;
  const codeBlockType = state.schema.nodes.codeBlock;

  if (!codeBlockType) return false;
  if (empty) return editor.chain().focus().toggleCodeBlock().run();

  const $from = state.doc.resolve(from);
  const $to = state.doc.resolve(to);

  // 只处理顶层块内的选区；嵌套结构交给内置命令
  if ($from.depth !== 1 || $to.depth !== 1) {
    return editor.chain().focus().toggleCodeBlock().run();
  }

  // 选区扩展到首尾所在整块，块间文本以换行分隔后写进单个代码块
  const blockStart = $from.before(1);
  const blockEnd = $to.after(1);
  const text = state.doc.textBetween(blockStart, blockEnd, '\n', ' ');
  const codeBlock = codeBlockType.create(
    null,
    text ? state.schema.text(text) : null,
  );

  editor.view.dispatch(state.tr.replaceWith(blockStart, blockEnd, codeBlock).scrollIntoView());
  return true;
}

export function runBubbleMenuAction(
  editor: TiptapEditor | null,
  type: string,
  data?: BubbleMenuActionData,
) {
  if (!editor) return;
  const chain = editor.chain().focus();

  switch (type) {
    case 'bold':
      chain.toggleBold().run();
      break;
    case 'italic':
      chain.toggleItalic().run();
      break;
    case 'code':
      chain.toggleCode().run();
      break;
    case 'link':
      if (data?.href) {
        chain.setLink({ href: data.href }).run();
      }
      break;
    case 'unlink':
      chain.unsetLink().run();
      break;
    case 'h1':
      chain.toggleHeading({ level: 1 }).run();
      break;
    case 'h2':
      chain.toggleHeading({ level: 2 }).run();
      break;
    case 'h3':
      chain.toggleHeading({ level: 3 }).run();
      break;
    case 'h4':
      chain.toggleHeading({ level: 4 }).run();
      break;
    case 'paragraph':
      chain.setParagraph().run();
      break;
    // 转换为代码块：已在代码块内则还原为段落
    case 'codeBlock':
      if (editor.isActive('codeBlock')) {
        chain.setParagraph().run();
      } else {
        convertSelectionToCodeBlock(editor);
      }
      break;
    // ── 表格列/行操作 ──
    case 'table.addColumnBefore':
      chain.addColumnBefore().run();
      break;
    case 'table.addColumnAfter':
      chain.addColumnAfter().run();
      break;
    case 'table.deleteColumn':
      chain.deleteColumn().run();
      break;
    case 'table.addRowBefore':
      chain.addRowBefore().run();
      break;
    case 'table.addRowAfter':
      chain.addRowAfter().run();
      break;
    case 'table.deleteRow':
      chain.deleteRow().run();
      break;
    case 'table.toggleHeaderColumn':
      chain.toggleHeaderColumn().run();
      break;
    case 'table.toggleHeaderRow':
      chain.toggleHeaderRow().run();
      break;
  }
}

/**
 * 查询某个表格命令当前是否可执行（光标需位于表格单元格内）。
 * 用于在表格工具条上禁用不可用的按钮。
 */
export function canRunTableCommand(editor: TiptapEditor | null, commandId: string): boolean {
  if (!editor) return false;
  switch (commandId) {
    case 'table.addColumnBefore':
      return editor.can().addColumnBefore();
    case 'table.addColumnAfter':
      return editor.can().addColumnAfter();
    case 'table.deleteColumn':
      return editor.can().deleteColumn();
    case 'table.addRowBefore':
      return editor.can().addRowBefore();
    case 'table.addRowAfter':
      return editor.can().addRowAfter();
    case 'table.deleteRow':
      return editor.can().deleteRow();
    case 'table.toggleHeaderColumn':
      return editor.can().toggleHeaderColumn();
    case 'table.toggleHeaderRow':
      return editor.can().toggleHeaderRow();
    default:
      return false;
  }
}

export function executeEditorCommand(editor: TiptapEditor | null, commandId: string): boolean {
  if (!editor) {
    return false;
  }

  const chain = editor.chain().focus();

  switch (commandId) {
    case 'editor.undo':
      return editor.commands.undo();
    case 'editor.redo':
      return editor.commands.redo();
    case 'editor.bold':
      return chain.toggleBold().run();
    case 'editor.italic':
      return chain.toggleItalic().run();
    case 'editor.strike':
      return chain.toggleStrike().run();
    case 'editor.highlight':
      return chain.toggleHighlight().run();
    case 'editor.code':
      return chain.toggleCode().run();
    case 'editor.heading1':
      return chain.toggleHeading({ level: 1 }).run();
    case 'editor.heading2':
      return chain.toggleHeading({ level: 2 }).run();
    case 'editor.heading3':
      return chain.toggleHeading({ level: 3 }).run();
    case 'editor.heading4':
      return chain.toggleHeading({ level: 4 }).run();
    case 'editor.heading5':
      return chain.toggleHeading({ level: 5 }).run();
    case 'editor.heading6':
      return chain.toggleHeading({ level: 6 }).run();
    case 'editor.paragraph':
      return chain.setParagraph().run();
    case 'editor.bulletList':
      return chain.toggleBulletList().run();
    case 'editor.orderedList':
      return chain.toggleOrderedList().run();
    case 'editor.taskList':
      return chain.toggleTaskList().run();
    case 'editor.blockquote':
      return chain.toggleBlockquote().run();
    case 'editor.codeBlock':
      return chain.toggleCodeBlock().run();
    default:
      return false;
  }
}
