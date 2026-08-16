import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { getBlockLineStarts } from '../markdown/serializer';

const sourceLineNumberKey = new PluginKey('sourceLineNumbers');

/**
 * 让编辑器左侧行号栏显示「源码（.md 文件）真实行号」而非按顶层块计数。
 *
 * 原理：复用现有 CSS 计数器（counter-reset 在 .tiptap-editor，counter-increment
 * 在每个顶层块）。本扩展通过 Decoration 给每个顶层块设置与其源码起始行相匹配的
 * counter-increment 增量，使计数器最终等于该块在 .md 中的真实行号。
 */
export const SourceLineNumbers = Extension.create({
  name: 'sourceLineNumbers',

  addProseMirrorPlugins() {
    let cachedDoc: unknown = null;
    let cachedSet: DecorationSet | null = null;

    return [
      new Plugin({
        key: sourceLineNumberKey,
        props: {
          decorations(state) {
            if (cachedDoc === state.doc && cachedSet) {
              return cachedSet;
            }

            const starts = getBlockLineStarts(state.doc);
            const decorations: Decoration[] = [];
            let prev = 0;

            state.doc.forEach((node, offset, index) => {
              const line = starts[index] ?? prev + 1;
              const inc = Math.max(1, line - prev);
              decorations.push(
                Decoration.node(offset, offset + node.nodeSize, {
                  style: `counter-increment: linenumber ${inc}`,
                }),
              );
              prev = line;
            });

            const set = DecorationSet.create(state.doc, decorations);
            cachedDoc = state.doc;
            cachedSet = set;
            return set;
          },
        },
      }),
    ];
  },
});
