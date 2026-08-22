// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, defineComponent, h, ref, nextTick, type Ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';

import { useSettingsStore } from '../../../../stores/settings';
import { useEditorAppearance } from '../useEditorAppearance';

describe('useEditorAppearance typography vars', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('injects --mk-font-* into editor wrap and reacts to settings changes', async () => {
    const settingsStore = useSettingsStore();
    settingsStore.settings.fontFamily = 'Inter';
    settingsStore.settings.fontSize = 18;
    settingsStore.settings.lineHeight = 1.8;

    let capturedRef: Ref<HTMLElement | null> | null = null;
    const Comp = defineComponent({
      setup() {
        const editorWrapRef = ref<HTMLElement | null>(null);
        capturedRef = editorWrapRef;
        useEditorAppearance(editorWrapRef);
        return () =>
          h('div', { ref: editorWrapRef, class: 'mk-editor' }, [h('div', { class: 'tiptap-editor' })]);
      },
    });

    const root = document.createElement('div');
    document.body.appendChild(root);
    const app = createApp(Comp);
    app.mount(root);
    await nextTick();

    const wrap = capturedRef!.value as HTMLElement;
    expect(wrap).toBeTruthy();
    expect(wrap.style.getPropertyValue('--mk-font-family')).toBe('Inter');
    expect(wrap.style.getPropertyValue('--mk-font-size')).toBe('18px');
    expect(wrap.style.getPropertyValue('--mk-line-height')).toBe('1.8');

    // 改变设置，验证 watch 实时生效
    settingsStore.settings.fontFamily = 'Menlo';
    settingsStore.settings.fontSize = 22;
    settingsStore.settings.lineHeight = 2.0;
    await nextTick();

    expect(wrap.style.getPropertyValue('--mk-font-family')).toBe('Menlo');
    expect(wrap.style.getPropertyValue('--mk-font-size')).toBe('22px');
    expect(wrap.style.getPropertyValue('--mk-line-height')).toBe('2');

    app.unmount();
  });
});
