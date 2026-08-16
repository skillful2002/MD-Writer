import { ref } from 'vue';

export function useAppUiState() {
  const isSidebarOpen = ref(true);
  // 面板显隐是独立手动开关；「大纲默认展开」设置控制的是大纲树层级展开程度，
  // 由 SidebarOutlinePanel 内部依据 settings.outlineExpanded 套用。
  const isOutlineOpen = ref(true);
  const isSourceMode = ref(false);

  const imagePasteWarning = ref<string | null>(null);
  const isCommandPaletteOpen = ref(false);
  const isShortcutsModalOpen = ref(false);

  function toggleSidebar() {
    isSidebarOpen.value = !isSidebarOpen.value;
  }

  function toggleOutline() {
    isOutlineOpen.value = !isOutlineOpen.value;
  }

  function toggleSourceMode() {
    isSourceMode.value = !isSourceMode.value;
  }

  function openCommandPalette() {
    isCommandPaletteOpen.value = true;
  }

  function openShortcutsModal() {
    isShortcutsModalOpen.value = true;
  }

  function showImagePasteWarning(message: string) {
    imagePasteWarning.value = message;
    setTimeout(() => {
      imagePasteWarning.value = null;
    }, 3000);
  }

  return {
    isSidebarOpen,
    isOutlineOpen,
    isSourceMode,
    imagePasteWarning,
    isCommandPaletteOpen,
    isShortcutsModalOpen,
    toggleSidebar,
    toggleOutline,
    toggleSourceMode,
    openCommandPalette,
    openShortcutsModal,
    showImagePasteWarning,
  };
}
