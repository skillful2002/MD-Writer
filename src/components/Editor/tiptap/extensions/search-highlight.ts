import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';

export interface SearchMatch {
  from: number;
  to: number;
}

// 唯一 key：搜索模块通过该 key 向插件推送最新的匹配位置。
export const searchHighlightKey = new PluginKey<DecorationSet>('searchHighlight');

function buildDecorations(
  doc: import('@tiptap/pm/model').Node,
  matches: SearchMatch[],
  currentIndex: number,
): DecorationSet {
  const decorations = matches.map((m, i) =>
    Decoration.inline(m.from, m.to, {
      class: i === currentIndex ? 'search-match-current' : 'search-match',
    }),
  );
  return DecorationSet.create(doc, decorations);
}

/**
 * 把当前查找匹配位置推送给编辑器，以常驻 decoration 形式渲染高亮。
 * 传入空数组即可清除全部高亮。
 */
export function setSearchDecorations(
  view: EditorView,
  matches: SearchMatch[],
  currentIndex: number,
): void {
  const decorations = buildDecorations(view.state.doc, matches, currentIndex);
  const tr = view.state.tr.setMeta(searchHighlightKey, decorations);
  view.dispatch(tr);
}

/**
 * 查找高亮扩展：在编辑器内以 inline decoration 渲染所有匹配（失焦也常驻可见），
 * 当前匹配用更醒目的样式区分。匹配位置仅在搜索模块显式推送时刷新，
 * 文档被编辑时由 mapping 跟随，避免错位。
 */
export const SearchHighlight = Extension.create({
  name: 'searchHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: searchHighlightKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, old) => {
            const meta = tr.getMeta(searchHighlightKey) as DecorationSet | undefined;
            if (meta) return meta;
            if (tr.docChanged) return old.map(tr.mapping, tr.doc);
            return old;
          },
        },
        props: {
          decorations(state) {
            return searchHighlightKey.getState(state);
          },
        },
      }),
    ];
  },
});
