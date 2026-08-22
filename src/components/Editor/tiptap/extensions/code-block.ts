/**
 * 代码块扩展 — 基于 CodeBlockLowlight
 *
 * 特性：
 * - 语法高亮（lowlight + highlight.js）
 * - 直接在渲染态编辑代码
 * - 支持语言标识
 */
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import { common, createLowlight } from 'lowlight';

// 补充 lowlight `common` 未携带、但本项目需要支持的常见语言 grammar。
// 这些均来自 highlight.js 全量包（highlight.js/lib/languages/*），本机实测存在。
import dart from 'highlight.js/lib/languages/dart';
import scala from 'highlight.js/lib/languages/scala';
import clojure from 'highlight.js/lib/languages/clojure';
import elixir from 'highlight.js/lib/languages/elixir';
import erlang from 'highlight.js/lib/languages/erlang';
import haskell from 'highlight.js/lib/languages/haskell';
import ocaml from 'highlight.js/lib/languages/ocaml';
import fortran from 'highlight.js/lib/languages/fortran';
import matlab from 'highlight.js/lib/languages/matlab';
import groovy from 'highlight.js/lib/languages/groovy';
import nginx from 'highlight.js/lib/languages/nginx';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import cmake from 'highlight.js/lib/languages/cmake';
import properties from 'highlight.js/lib/languages/properties';
import protobuf from 'highlight.js/lib/languages/protobuf';
import nim from 'highlight.js/lib/languages/nim';
import crystal from 'highlight.js/lib/languages/crystal';
import fsharp from 'highlight.js/lib/languages/fsharp';
import lisp from 'highlight.js/lib/languages/lisp';
import julia from 'highlight.js/lib/languages/julia';
import powershell from 'highlight.js/lib/languages/powershell';
import tcl from 'highlight.js/lib/languages/tcl';
import verilog from 'highlight.js/lib/languages/verilog';
import vhdl from 'highlight.js/lib/languages/vhdl';
import coffeescript from 'highlight.js/lib/languages/coffeescript';
import actionscript from 'highlight.js/lib/languages/actionscript';
import stan from 'highlight.js/lib/languages/stan';
import mercury from 'highlight.js/lib/languages/mercury';
import smalltalk from 'highlight.js/lib/languages/smalltalk';
import x86asm from 'highlight.js/lib/languages/x86asm';
import inform7 from 'highlight.js/lib/languages/inform7';
import ebnf from 'highlight.js/lib/languages/ebnf';
import gams from 'highlight.js/lib/languages/gams';
import llvm from 'highlight.js/lib/languages/llvm';
import qml from 'highlight.js/lib/languages/qml';
import vala from 'highlight.js/lib/languages/vala';
import ada from 'highlight.js/lib/languages/ada';
import sas from 'highlight.js/lib/languages/sas';
import stata from 'highlight.js/lib/languages/stata';
import pgsql from 'highlight.js/lib/languages/pgsql';
import basic from 'highlight.js/lib/languages/basic';
import makefile from 'highlight.js/lib/languages/makefile';
import dos from 'highlight.js/lib/languages/dos';

const lowlight = createLowlight(common);

lowlight.register({
  dart,
  scala,
  clojure,
  elixir,
  erlang,
  haskell,
  ocaml,
  fortran,
  matlab,
  groovy,
  nginx,
  dockerfile,
  cmake,
  properties,
  protobuf,
  nim,
  crystal,
  fsharp,
  lisp,
  julia,
  powershell,
  tcl,
  verilog,
  vhdl,
  coffeescript,
  actionscript,
  stan,
  mercury,
  smalltalk,
  x86asm,
  inform7,
  ebnf,
  gams,
  llvm,
  qml,
  vala,
  ada,
  sas,
  stata,
  pgsql,
  basic,
  makefile,
  dos,
});

export function normalizeCodeBlockLanguage(language: string | null | undefined): string | null {
  const normalized = language?.trim().toLowerCase() ?? '';
  return normalized || null;
}

export function getCodeBlockLanguageLabel(language: string | null | undefined): string {
  return normalizeCodeBlockLanguage(language) || 'plain text';
}

function updateCodeBlockLanguage(
  editor: Editor,
  node: PMNode,
  getPos: (() => number | undefined) | boolean,
  language: string | null,
) {
  if (typeof getPos !== 'function') return;

  const pos = getPos();
  if (typeof pos !== 'number') return;
  const tr = editor.view.state.tr.setNodeMarkup(pos, undefined, {
    ...node.attrs,
    language,
  });
  // 切换语言后把光标移到代码块内容第一行开头
  tr.setSelection(TextSelection.create(tr.doc, pos + 1));
  editor.view.dispatch(tr);
  editor.commands.focus();
}

export const CustomCodeBlock = CodeBlockLowlight.extend({
  addAttributes() {
    const parent = this.parent?.() ?? {};

    return {
      ...parent,
      languageLabel: {
        default: null,
        parseHTML: () => null,
        renderHTML: (attributes) => ({
          'data-language': getCodeBlockLanguageLabel(
            typeof attributes.language === 'string' ? attributes.language : null,
          ),
        }),
      },
    };
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('div');
      dom.className = 'mk-code-block-shell';

      const header = document.createElement('div');
      header.className = 'mk-code-block-header';
      dom.appendChild(header);

      const languageButton = document.createElement('button');
      languageButton.type = 'button';
      languageButton.className = 'mk-code-block-language-button';
      header.appendChild(languageButton);

      const languageInput = document.createElement('input');
      languageInput.className = 'mk-code-block-language-input';
      languageInput.placeholder = '输入语言';
      languageInput.style.display = 'none';
      header.appendChild(languageInput);

      const pre = document.createElement('pre');
      pre.className = 'mk-code-block';
      dom.appendChild(pre);

      const code = document.createElement('code');
      pre.appendChild(code);

      let isEditingLanguage = false;

      function syncLanguageUI() {
        if (isEditingLanguage) return;
        const currentLanguage = typeof node.attrs.language === 'string' ? node.attrs.language : null;
        const label = getCodeBlockLanguageLabel(currentLanguage);
        languageButton.textContent = label;
        pre.dataset.language = label;
      }

      function enterLanguageEdit() {
        if (isEditingLanguage) return;
        isEditingLanguage = true;
        languageButton.style.display = 'none';
        languageInput.style.display = 'block';
        languageInput.value = typeof node.attrs.language === 'string' ? node.attrs.language : '';
        languageInput.focus();
        languageInput.select();
      }

      function exitLanguageEdit() {
        isEditingLanguage = false;
        languageInput.style.display = 'none';
        languageButton.style.display = 'inline-flex';
        syncLanguageUI();
      }

      function commitLanguage() {
        const nextLanguage = normalizeCodeBlockLanguage(languageInput.value);
        const currentLanguage = normalizeCodeBlockLanguage(
          typeof node.attrs.language === 'string' ? node.attrs.language : null,
        );

        exitLanguageEdit();

        if (nextLanguage === currentLanguage) return;
        updateCodeBlockLanguage(editor, node, getPos, nextLanguage);
      }

      function cancelLanguageEdit() {
        exitLanguageEdit();
      }

      languageButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        enterLanguageEdit();
      });

      languageInput.addEventListener('blur', () => {
        commitLanguage();
      });

      languageInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commitLanguage();
          editor.commands.focus();
          return;
        }

        if (event.key === 'Escape') {
          event.preventDefault();
          cancelLanguageEdit();
          editor.commands.focus();
        }
      });

      syncLanguageUI();

      return {
        dom,
        contentDOM: code,
        update(updatedNode: PMNode) {
          if (updatedNode.type.name !== 'codeBlock') return false;
          node = updatedNode;
          syncLanguageUI();
          return true;
        },
        stopEvent(event: Event) {
          return event.target instanceof Node && header.contains(event.target);
        },
        ignoreMutation(mutation: MutationRecord | { type: 'selection'; target: Node }) {
          return mutation.target instanceof Node && header.contains(mutation.target);
        },
      };
    };
  },
}).configure({
  lowlight,
  // 未指定语言时固定使用 plaintext，防止 lowlight 自动检测把 key:value 文本渲染成带颜色高亮
  defaultLanguage: 'plaintext',
  HTMLAttributes: {
    class: 'mk-code-block',
  },
});
