import { ref, type Ref } from 'vue';
import type { Editor as TiptapEditor } from '@tiptap/vue-3';
import { setSearchDecorations, type SearchMatch } from './extensions/search-highlight';

export function useEditorSearch(editor: Ref<TiptapEditor | null>) {
  const isSearchVisible = ref(false);
  const searchMatchCount = ref(0);
  const searchCurrentIndex = ref(0);
  // 标记「查找导航中」：期间由 find 设置的非空选区不应触发编辑器悬浮工具条（BubbleMenu）
  const isSearchNavigating = ref(false);

  let searchQuery = '';
  let caseSensitive = false;
  let currentMatches: SearchMatch[] = [];

  function findMatches(query: string): SearchMatch[] {
    if (!editor.value || !query) return [];
    const doc = editor.value.state.doc;
    const results: SearchMatch[] = [];
    const searchText = caseSensitive ? query : query.toLowerCase();

    doc.descendants((node, pos) => {
      if (!node.isText || !node.text) return;
      const text = caseSensitive ? node.text : node.text.toLowerCase();
      let index = 0;
      while ((index = text.indexOf(searchText, index)) !== -1) {
        results.push({ from: pos + index, to: pos + index + query.length });
        index += 1;
      }
    });
    return results;
  }

  // 把当前匹配位置推送给编辑器，渲染常驻高亮 decoration（失焦也可见）。
  function updateDecorations() {
    const view = editor.value?.view;
    if (!view) return;
    setSearchDecorations(view, currentMatches, Math.max(0, searchCurrentIndex.value - 1));
  }

  function scrollToMatch(index: number) {
    if (!editor.value || index < 0 || index >= currentMatches.length) return;
    const match = currentMatches[index];
    // 标记导航中，抑制编辑器悬浮工具条（BubbleMenu）在非空选区上弹出
    isSearchNavigating.value = true;
    editor.value.commands.setTextSelection(match);
    isSearchNavigating.value = false;
    const dom = editor.value.view.domAtPos(match.from);
    const el = dom.node instanceof HTMLElement ? dom.node : dom.node.parentElement;
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function onSearchQuery(query: string) {
    searchQuery = query;
    currentMatches = findMatches(query);
    searchMatchCount.value = currentMatches.length;
    searchCurrentIndex.value = currentMatches.length > 0 ? 1 : 0;
    if (currentMatches.length > 0) scrollToMatch(0);
    updateDecorations();
  }

  function onSearchCaseSensitive(sensitive: boolean) {
    caseSensitive = sensitive;
    onSearchQuery(searchQuery);
  }

  function onSearchNext() {
    if (searchMatchCount.value === 0) return;
    searchCurrentIndex.value =
      searchCurrentIndex.value >= searchMatchCount.value ? 1 : searchCurrentIndex.value + 1;
    scrollToMatch(searchCurrentIndex.value - 1);
    updateDecorations();
  }

  function onSearchPrev() {
    if (searchMatchCount.value === 0) return;
    searchCurrentIndex.value =
      searchCurrentIndex.value <= 1 ? searchMatchCount.value : searchCurrentIndex.value - 1;
    scrollToMatch(searchCurrentIndex.value - 1);
    updateDecorations();
  }

  function onSearchReplace(replacement: string) {
    if (!editor.value || currentMatches.length === 0) return;
    const idx = searchCurrentIndex.value - 1;
    if (idx < 0 || idx >= currentMatches.length) return;
    const match = currentMatches[idx];

    // 去掉 .focus()：避免抢走查找框焦点，保持「回车跳下一个」的连续查找体验；
    // 同时标记导航中，抑制替换时选区变化触发的悬浮工具条
    isSearchNavigating.value = true;
    editor.value
      .chain()
      .setTextSelection(match)
      .deleteSelection()
      .insertContent(replacement)
      .run();
    isSearchNavigating.value = false;

    currentMatches = findMatches(searchQuery);
    searchMatchCount.value = currentMatches.length;
    if (searchCurrentIndex.value > currentMatches.length) {
      searchCurrentIndex.value = currentMatches.length > 0 ? 1 : 0;
    }
    if (currentMatches.length > 0) scrollToMatch(searchCurrentIndex.value - 1);
    updateDecorations();
  }

  function onSearchReplaceAll(replacement: string) {
    if (!editor.value || currentMatches.length === 0) return;
    isSearchNavigating.value = true;
    const matches = [...currentMatches].reverse();
    const chain = editor.value.chain();
    for (const match of matches) {
      chain.setTextSelection(match).deleteSelection().insertContent(replacement);
    }
    chain.run();
    isSearchNavigating.value = false;

    currentMatches = findMatches(searchQuery);
    searchMatchCount.value = currentMatches.length;
    searchCurrentIndex.value = 0;
    updateDecorations();
  }

  function openSearch() {
    isSearchVisible.value = true;
  }

  function closeSearch() {
    isSearchVisible.value = false;
    searchMatchCount.value = 0;
    searchCurrentIndex.value = 0;
    searchQuery = '';
    currentMatches = [];
    updateDecorations();
  }

  return {
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
  };
}
