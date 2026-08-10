import { ref } from 'vue';

export function useAppUiState() {
  const isSidebarOpen = ref(true);
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
