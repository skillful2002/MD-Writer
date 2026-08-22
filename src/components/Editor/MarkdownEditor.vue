<template>
  <div
    class="editor-shell h-full w-full cursor-text transition-colors"
    :class="{ 'editor-line-numbers': settingsStore.settings.showLineNumbers }"
    style="background-color: var(--bg-color)"
    @click="handleContainerClick"
  >
    <div ref="editorWrapRef" class="mk-editor h-full px-6 py-8 overflow-y-auto outline-none">
      <EditorContent v-if="editor" :editor="editor" />
    </div>

    <BubbleMenuComponent ref="bubbleMenuRef" :editor="editor" :on-action="onBubbleMenuAction" />
    <SlashMenu ref="slashMenuRef" :items="slashMenuItems" :command="slashMenuCommand" />
    <SearchBar
      ref="searchBarRef"
      :visible="isSearchVisible"
      :match-count="searchMatchCount"
      :current-index="searchCurrentIndex"
      @query="onSearchQuery"
      @case-sensitive="onSearchCaseSensitive"
      @next="onSearchNext"
      @prev="onSearchPrev"
      @replace="onSearchReplace"
      @replace-all="onSearchReplaceAll"
      @close="closeSearch"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, shallowRef, onBeforeUnmount } from 'vue';
import { debounce } from 'lodash-es';
import { Editor as TiptapEditor, EditorContent } from '@tiptap/vue-3';

import { useFileStore } from '../../stores/file';
import { parseMarkdown } from './tiptap/markdown/parser';
import { serializeMarkdown } from './tiptap/markdown/serializer';
import type { SlashCommandItem } from './tiptap/extensions/slash-commands';
import {
  executeEditorCommand,
  runBubbleMenuAction,
  type BubbleMenuActionData,
} from './tiptap/editor-commands';
import { createEditorExtensions, type SlashMenuController } from './tiptap/editor-extensions';
import {
  extractEditorOutline,
  getEditorWordCount,
  type EditorOutlineItem,
} from './tiptap/editor-metadata';
import { getSourceCursor, serializeWithMap, lineToPmPos } from './tiptap/markdown/serializer';
import { handleEditorImageDrop, isEditorImageDragOver } from './tiptap/editor-image-drop';
import { handleEditorImagePaste, isPastedImage } from './tiptap/editor-image-paste';
import { useEditorAppearance } from './tiptap/useEditorAppearance';
import { useEditorSearch } from './tiptap/useEditorSearch';
import { useSettingsStore } from '../../stores/settings';
import BubbleMenuComponent from './views/BubbleMenu.vue';
import SlashMenu from './views/SlashMenu.vue';
import SearchBar from './SearchBar.vue';
import './tiptap/editor.css';
import 'highlight.js/styles/github.css';
import 'katex/dist/katex.min.css';

type EditorUpdatePayload = {
  wordCount?: number;
  cursor?: { line: number; col: number };
  selectionText?: string;
  outline?: EditorOutlineItem[];
};

const props = defineProps<{ initialContent?: string; initialLine?: number | null }>();
const emit = defineEmits<{ (e: 'update', data: EditorUpdatePayload): void }>();

const fileStore = useFileStore();
const settingsStore = useSettingsStore();
const editorWrapRef = ref<HTMLElement | null>(null);
const bubbleMenuRef = ref<InstanceType<typeof BubbleMenuComponent> | null>(null);
const searchBarRef = ref<InstanceType<typeof SearchBar> | null>(null);
const slashMenuRef = ref<SlashMenuController | null>(null);
const slashMenuItems = ref<SlashCommandItem[]>([]);
const slashMenuCommand = ref<(item: SlashCommandItem) => void>(() => {});
useEditorAppearance(editorWrapRef);

// ── 创建 TipTap Editor ────────────────────────────────────────

const editor = shallowRef<TiptapEditor | null>(null);
const {
  isSearchVisible,
  searchMatchCount,
  searchCurrentIndex,
  isSearchNavigating,
  onSearchQuery,
  onSearchCaseSensitive,
  onSearchNext,
  onSearchPrev,
  onSearchReplace,
  onSearchReplaceAll,
  openSearch,
  closeSearch,
} = useEditorSearch(editor);

function createEditor(content: string) {
  if (editor.value) {
    editor.value.destroy();
  }

  const e = new TiptapEditor({
    extensions: createEditorExtensions({
      slashMenuRef,
      slashMenuItems,
      slashMenuCommand,
    }),
    editorProps: {
      attributes: {
        class: 'tiptap-editor',
      },
      handlePaste: (view, event) => {
        if (!isPastedImage(event)) return false;
        void handleEditorImagePaste(view, event);
        return true;
      },
    },
    onUpdate: ({ editor: ed }) => {
      debouncedUpdate(ed as unknown as TiptapEditor);
    },
    onSelectionUpdate: ({ editor: ed }) => {
      updateBubbleMenu(ed as unknown as TiptapEditor);
      emitCursorInfo(ed as unknown as TiptapEditor);
    },
  });

  // 代码模式判断：当前文件是代码文件（language 非空）时，整篇作为单个带语言标识的 code block，
  // 复用 CustomCodeBlock 的 lowlight 高亮与语言切换 UI；否则按 Markdown 解析。
  const codeLanguage = fileStore.currentFile.language;

  if (content) {
    if (codeLanguage) {
      e.commands.setContent({
        type: 'doc',
        content: [
          {
            type: 'codeBlock',
            attrs: { language: codeLanguage },
            content: [{ type: 'text', text: content }],
          },
        ],
      });
    } else {
      const doc = parseMarkdown(e.schema, content);
      e.commands.setContent(doc.toJSON());
    }
  }

  editor.value = e;

  // 同步基线：setContent + appendTransaction 完成后，序列化结果作为 store 基准
  // 避免 parser/serializer round-trip 差异导致误判 dirty
  const baseline = codeLanguage ? e.state.doc.textContent : serializeMarkdown(e.state.doc);

  fileStore.setContent(baseline);
}

// ── 更新回调 ──────────────────────────────────────────────────

const debouncedUpdate = debounce((ed: TiptapEditor) => {
  // 代码模式：整篇即单个 code block，直接用 textContent 作为纯文本写回。
  // 不走 serializeMarkdown（那会把 code block 包成 ``` ``` ``` 围栏，破坏源码）。
  const isCode = !!fileStore.currentFile.language;
  const nextContent = isCode ? ed.state.doc.textContent : serializeMarkdown(ed.state.doc);
  // 规范化比较：序列化器总是追加 \n，store 初始值可能是 ''
  const normalizedStored = fileStore.currentFile.content.replace(/\n+$/, '');
  const normalizedNew = nextContent.replace(/\n+$/, '');
  if (normalizedNew !== normalizedStored) {
    fileStore.markUserEdit();
    fileStore.setContent(nextContent);
  }

  const wordCount = getEditorWordCount(ed);
  const outline = extractEditorOutline(ed);

  emit('update', { wordCount, outline });
}, 300);

function emitCursorInfo(ed: TiptapEditor) {
  const { from } = ed.state.selection;
  const { line, col } = getSourceCursor(ed.state.doc, from);
  const selection = ed.state.selection;
  const selectionText = selection.empty
    ? ''
    : ed.state.doc.textBetween(selection.from, selection.to, '\n');
  emit('update', { cursor: { line, col }, selectionText });
}

// ── BubbleMenu ────────────────────────────────────────────────

function updateBubbleMenu(ed: TiptapEditor) {
  // 查找导航（程序化设置选区）期间不弹出悬浮工具条（BubbleMenu）
  if (isSearchNavigating.value) {
    bubbleMenuRef.value?.update(false, 0, 0, {});
    return;
  }
  const { from, to, empty } = ed.state.selection;

  // 表格内（光标位于单元格中）：即使选区为空也弹出表格工具条
  const inTable = ed.isActive('tableCell') || ed.isActive('tableHeader');
  if (empty && !inTable) {
    bubbleMenuRef.value?.update(false, 0, 0, {});
    return;
  }

  // 获取选区坐标（表格内用光标位置；文本选区用起止中点）
  const coords = ed.view.coordsAtPos(from);
  const left = empty
    ? coords.left
    : (coords.left + ed.view.coordsAtPos(to).left) / 2;
  const top = coords.top;

  // 检测当前 marks
  const marks = {
    bold: ed.isActive('bold'),
    italic: ed.isActive('italic'),
    code: ed.isActive('code'),
    link: ed.isActive('link'),
  };

  const linkAttributes = ed.getAttributes('link') as { href?: unknown };
  const linkHref = typeof linkAttributes.href === 'string' ? linkAttributes.href : undefined;

  bubbleMenuRef.value?.update(true, left, top, marks, linkHref, inTable);
}

function onBubbleMenuAction(type: string, data?: BubbleMenuActionData) {
  runBubbleMenuAction(editor.value, type, data);
}

// ── 容器点击 ──────────────────────────────────────────────────

function handleContainerClick(event: MouseEvent) {
  // 点击编辑器空白区域时聚焦到编辑器末尾
  const target = event.target as HTMLElement;
  if (target === editorWrapRef.value) {
    editor.value?.commands.focus('end');
  }
}

// ── 图片拖拽上传 ──────────────────────────────────────────────
// 拖放监听挂在编辑区整个包裹层（含内容下方空白）上，而不是 ProseMirror 的内容
// DOM，这样无论是否先点过编辑器、拖到哪个位置都能接收图片：
//   - 文件树图片拖入 —— 引用已有文件，写入相对路径，不复制到 .images/；
//   - OS 文件拖入 —— 读取图片字节落盘到文档同级 .images/，插入相对路径。
// 非图片拖拽（如编辑器内文本拖动）不拦截，交由 ProseMirror 默认逻辑处理。

function onEditorDragOver(event: DragEvent) {
  if (isEditorImageDragOver(event)) {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }
}

function onEditorDrop(event: DragEvent) {
  const view = editor.value?.view;
  if (!view || !isEditorImageDragOver(event)) return;
  // 按鼠标放开位置插入，并阻止 ProseMirror 默认处理，避免重复插入
  handleEditorImageDrop(view, event);
  event.stopPropagation();
}

// ── 生命周期 ──────────────────────────────────────────────────

onMounted(() => {
  createEditor(props.initialContent || '');
  const wrap = editorWrapRef.value;
  if (wrap) {
    // 捕获阶段监听，先于 ProseMirror 内层监听处理图片拖放
    wrap.addEventListener('dragover', onEditorDragOver, true);
    wrap.addEventListener('drop', onEditorDrop, true);
  }
  // 源码/编辑模式切换后，把光标恢复到切换前所在的源码行
  // 同步调用：editor 已在本 onMounted 创建完成，滚动在 scrollToPosition 内部 rAF 异步完成，
  // 避免在 App 端的 nextTick 清空 pendingCursorLine 之后才读取 props.initialLine。
  const initialLine = props.initialLine;
  if (initialLine && initialLine > 0) {
    scrollToLine(initialLine);
  }
});

onBeforeUnmount(() => {
  const wrap = editorWrapRef.value;
  if (wrap) {
    wrap.removeEventListener('dragover', onEditorDragOver, true);
    wrap.removeEventListener('drop', onEditorDrop, true);
  }
  debouncedUpdate.cancel();
  editor.value?.destroy();
  editor.value = null;
});

// ── 位置/滚动辅助 ────────────────────────────────────────────

// 在 doc 中设置光标并滚动到目标位置（靠顶部留 3-4 行）
function scrollToPosition(pos: number) {
  if (!editor.value) return;
  const docSize = editor.value.state.doc.content.size;
  const target = Math.max(0, Math.min(pos, docSize));
  const view = editor.value.view;
  const wrap = editorWrapRef.value;
  if (!wrap) return;

  // 计算标题末尾位置，让光标停在「行尾」而不是行首
  const heading = editor.value.state.doc.resolve(target).nodeAfter;
  const endPos = heading ? Math.min(target + heading.nodeSize - 1, docSize) : target;

  editor.value.commands.setTextSelection(endPos);
  view.dom.focus({ preventScroll: true });

  requestAnimationFrame(() => {
    let node: HTMLElement | null = view.nodeDOM(target) as HTMLElement | null;
    if (!(node instanceof HTMLElement)) {
      const d = view.domAtPos(target);
      node = d.node instanceof HTMLElement ? d.node : d.node.parentElement;
      while (node && node !== view.dom && !/^H[1-6]$/i.test(node.tagName)) {
        node = node.parentElement;
      }
    }
    if (!(node instanceof HTMLElement) || node === view.dom) return;
    const nodeRect = node.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const delta = nodeRect.top - wrapRect.top;
    const lineHeight = parseFloat(getComputedStyle(view.dom).lineHeight) || nodeRect.height;
    const topMargin = lineHeight * 3.5;
    const maxScroll = Math.max(0, wrap.scrollHeight - wrap.clientHeight);
    wrap.scrollTop = Math.max(0, Math.min(wrap.scrollTop + delta - topMargin, maxScroll));
  });
}

// 把光标定位到「第 line 行」（源码行号），用于源码/编辑模式切换后保持视线
function scrollToLine(line: number) {
  if (!editor.value || !line || line < 1) return;
  const doc = editor.value.state.doc;
  const map = serializeWithMap(doc);
  const pos = lineToPmPos(map, line);
  const view = editor.value.view;
  const wrap = editorWrapRef.value;
  if (!wrap) return;

  // 光标放在该行首个文本字符处（行首内容位置），而非块末尾
  editor.value.commands.setTextSelection(pos);
  view.dom.focus({ preventScroll: true });

  requestAnimationFrame(() => {
    // 找到 pos 所在的顶层块级 DOM 元素（其父即为 .ProseMirror）
    const d = view.domAtPos(pos);
    let node: Node | null = d.node;
    if (!(node instanceof HTMLElement)) node = node.parentElement;
    while (node && node.parentElement && node.parentElement !== view.dom) {
      node = node.parentElement;
    }
    if (!(node instanceof HTMLElement) || node.parentElement !== view.dom) return;

    const nodeRect = node.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const delta = nodeRect.top - wrapRect.top;
    const lineHeight = parseFloat(getComputedStyle(view.dom).lineHeight) || nodeRect.height;
    const topMargin = lineHeight * 2.5; // 顶部保留约 2-3 行
    const maxScroll = Math.max(0, wrap.scrollHeight - wrap.clientHeight);
    wrap.scrollTop = Math.max(0, Math.min(wrap.scrollTop + delta - topMargin, maxScroll));
  });
}

// ── Expose ────────────────────────────────────────────────────

defineExpose({
  scrollToPos: (pos: number) => scrollToPosition(pos),
  scrollToLine: (line: number) => scrollToLine(line),
  getContent: () => {
    if (!editor.value) return '';
    return serializeMarkdown(editor.value.state.doc);
  },
  getDoc: () => editor.value?.state.doc ?? null,
  getSelectionMarkdown: () => {
    if (!editor.value) return '';
    const { from, to, empty } = editor.value.state.selection;
    if (empty) return '';
    return editor.value.state.doc.textBetween(from, to, '\n');
  },
  getEditorView: () => editor.value?.view ?? null,
  hasFocus: () => editor.value?.isFocused ?? false,
  focus: () => {
    editor.value?.commands.focus('end');
  },
  executeCommand: (commandId: string) => executeEditorCommand(editor.value, commandId),
  undo: () => editor.value?.commands.undo(),
  redo: () => editor.value?.commands.redo(),
  openSearch: (_showReplace = false) => {
    openSearch();
    searchBarRef.value?.setShowReplace(_showReplace);
  },
  closeSearch,
});
</script>
