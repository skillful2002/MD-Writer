import { onBeforeUnmount, onMounted, watch } from 'vue';
import type { Ref } from 'vue';

import { useSettingsStore } from '../../../stores/settings';

const customCssId = 'markdown-ed-custom-editor-css';
const hljsDarkCssId = 'hljs-dark-theme';

function injectCustomCSS(css: string) {
  let el = document.getElementById(customCssId) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = customCssId;
    document.head.appendChild(el);
  }
  el.textContent = css;
}

function syncHljsTheme() {
  const isDark = document.documentElement.classList.contains('dark');
  let el = document.getElementById(hljsDarkCssId) as HTMLLinkElement | null;
  if (isDark) {
    if (!el) {
      el = document.createElement('link');
      el.id = hljsDarkCssId;
      el.rel = 'stylesheet';
      el.href = new URL('highlight.js/styles/github-dark.css', import.meta.url).href;
      document.head.appendChild(el);
    }
  } else {
    el?.remove();
  }
}

function applyTypographyVars(wrap: HTMLElement | null, settings: {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
}) {
  if (!wrap) return;
  wrap.style.setProperty('--mk-font-size', `${settings.fontSize}px`);
  wrap.style.setProperty('--mk-font-family', settings.fontFamily);
  wrap.style.setProperty('--mk-line-height', String(settings.lineHeight));
}

export function useEditorAppearance(editorWrapRef?: Ref<HTMLElement | null>) {
  const settingsStore = useSettingsStore();
  const themeObserver = new MutationObserver(syncHljsTheme);

  // 排版与阅读：字体大小 / 字体 / 行高 实时写入编辑器根 DOM 的 CSS 变量，
  // editor.css 的 .tiptap-editor 引用这些变量（缺失时回退原默认值）。
  watch(
    () => [
      settingsStore.settings.fontSize,
      settingsStore.settings.fontFamily,
      settingsStore.settings.lineHeight,
    ],
    () => {
      applyTypographyVars(editorWrapRef?.value ?? null, settingsStore.settings);
    },
    { immediate: true },
  );

  watch(() => settingsStore.settings.customEditorCSS, injectCustomCSS, { immediate: true });

  onMounted(() => {
    syncHljsTheme();
    // 初次挂载后立即写入一次，确保 onMounted 后才拿到 DOM 时不漏掉
    applyTypographyVars(editorWrapRef?.value ?? null, settingsStore.settings);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
  });

  onBeforeUnmount(() => {
    themeObserver.disconnect();
  });
}
