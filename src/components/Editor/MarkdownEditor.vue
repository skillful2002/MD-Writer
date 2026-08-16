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

    <BubbleMenuComponent ref="bubbleMenuRef" :on-action="onBubbleMenuAction" />
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
import { getSourceCursor } from './tiptap/markdown/serializer';
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

const props = defineProps<{ initialContent?: string }>();
const emit = defineEmits<{ (e: 'update', data: EditorUpdatePayload): void }>();

const fileStore = useFileStore();
const settingsStore = useSettingsStore();
const editorWrapRef = ref<HTMLElement | null>(null);
const bubbleMenuRef = ref<InstanceType<typeof BubbleMenuComponent> | null>(null);
const searchBarRef = ref<InstanceType<typeof SearchBar> | null>(null);
const slashMenuRef = ref<SlashMenuController | null>(null);
const slashMenuItems = ref<SlashCommandItem[]>([]);
const slashMenuCommand = ref<(item: SlashCommandItem) => void>(() => {});
useEditorAppearance();

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

  // 解析 markdown 并设置文档
  if (content) {
    const doc = parseMarkdown(e.schema, content);
    e.commands.setContent(doc.toJSON());
  }

  editor.value = e;

  // 同步基线：setContent + appendTransaction 完成后，序列化结果作为 store 基准
  // 避免 parser/serializer round-trip 差异导致误判 dirty
  const baseline = serializeMarkdown(e.state.doc);

  fileStore.setContent(baseline);
}

// ── 更新回调 ──────────────────────────────────────────────────

const debouncedUpdate = debounce((ed: TiptapEditor) => {
  const markdown = serializeMarkdown(ed.state.doc);
  // 规范化比较：序列化器总是追加 \n，store 初始值可能是 ''
  const normalizedStored = fileStore.currentFile.content.replace(/\n+$/, '');
  const normalizedNew = markdown.replace(/\n+$/, '');
  if (normalizedNew !== normalizedStored) {
    fileStore.markUserEdit();
    fileStore.setContent(markdown);
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
  if (empty) {
    bubbleMenuRef.value?.update(false, 0, 0, {});
    return;
  }

  // 获取选区坐标
  const coords = ed.view.coordsAtPos(from);
  const endCoords = ed.view.coordsAtPos(to);
  const left = (coords.left + endCoords.left) / 2;
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

  bubbleMenuRef.value?.update(true, left, top, marks, linkHref);
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

// ── Expose ────────────────────────────────────────────────────

defineExpose({
  scrollToPos: (pos: number) => {
    if (!editor.value) return;
    const docSize = editor.value.state.doc.content.size;
    const target = Math.max(0, Math.min(pos, docSize));
    const view = editor.value.view;
    const wrap = editorWrapRef.value;
    if (!wrap) return;

    // 计算标题末尾位置，让光标停在「行尾」而不是行首
    const heading = editor.value.state.doc.resolve(target).nodeAfter;
    const endPos = heading ? Math.min(target + heading.nodeSize - 1, docSize) : target;

    // 1) 光标放到行尾；2) 聚焦中间编辑区。
    // 用 view.dom.focus({ preventScroll: true }) 直接聚焦且不触发浏览器/PM 的自动滚动，
    // 避免与下面「手动居中滚动」打架（Tiptap 的 focus 命令内部自带 rAF 滚动，会覆盖我们的居中）。
    editor.value.commands.setTextSelection(endPos);
    view.dom.focus({ preventScroll: true });

    // 下一帧：等选区/聚焦后的布局真正稳定，再把标题滚到编辑区靠顶部位置（上方保留约 3-4 行空间）。
    // 直接设置滚动容器 wrap.scrollTop（用正文字高计算顶部留白、并夹紧到可滚动范围），
    // 只动编辑器容器，不会误滚外层祖先。
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
      // 上方保留约 3-4 行：用编辑区正文字高 × 3.5 作为顶部留白
      const lineHeight = parseFloat(getComputedStyle(view.dom).lineHeight) || nodeRect.height;
      const topMargin = lineHeight * 3.5;
      const maxScroll = Math.max(0, wrap.scrollHeight - wrap.clientHeight);
      wrap.scrollTop = Math.max(0, Math.min(wrap.scrollTop + delta - topMargin, maxScroll));
    });
  },
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
