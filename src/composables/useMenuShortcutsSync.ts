import { watch, type Ref } from 'vue';
import { refreshNativeMenuShortcuts } from '../services/tauri/window';
import { getMenuShortcuts } from '../utils/shortcuts';
import { isMac } from '../utils/platform';

export interface MenuShortcutSyncOptions {
  customShortcuts: Ref<Record<string, string>>;
  isLoaded: Ref<boolean>;
}

export function useMenuShortcutsSync(options: MenuShortcutSyncOptions) {
  async function syncMenuShortcuts() {
    // 仅 macOS 使用原生菜单栏，需要通过该命令按自定义快捷键重建。
    // Windows/Linux 使用自定义 TitleBar 中的 HTML 菜单（直接读取设置中的快捷键），无需此调用。
    if (!isMac) {
      return;
    }
    await refreshNativeMenuShortcuts(getMenuShortcuts(options.customShortcuts.value));
  }

  const stopWatching = watch(
    options.customShortcuts,
    () => {
      if (!options.isLoaded.value) {
        return;
      }
      void syncMenuShortcuts();
    },
    { deep: true },
  );

  return {
    syncMenuShortcuts,
    stopWatching,
  };
}
