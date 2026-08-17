<template>
  <div class="panel-toggle-group flex items-center h-full gap-0.5" data-tauri-no-drag>
    <!-- 源码显示切换 -->
    <button
      type="button"
      class="title-toggle title-toggle--source"
      data-tauri-no-drag
      :class="isSourceMode ? 'title-toggle--on' : 'title-toggle--source-off'"
      :title="isSourceMode ? '隐藏源码' : '显示源码'"
      @click="$emit('toggle-source')"
    >
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="w-4 h-4"
      >
        <polyline points="7 5 3 10 7 15" />
        <polyline points="13 5 17 10 13 15" />
      </svg>
    </button>

    <!-- 与切换文件按钮拉开距离 -->
    <span class="panel-toggle-spacer"></span>

    <!-- 文件列表（侧边栏）显隐切换 -->
    <button
      type="button"
      class="title-toggle"
      data-tauri-no-drag
      :class="isSidebarOpen ? 'title-toggle--on' : 'title-toggle--off'"
      :title="isSidebarOpen ? '隐藏文件列表' : '显示文件列表'"
      @click="$emit('toggle-sidebar')"
    >
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="w-4 h-4"
      >
        <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
        <line x1="8" y1="3.5" x2="8" y2="16.5" />
        <line v-if="!isSidebarOpen" x1="3" y1="3" x2="17" y2="17" />
      </svg>
    </button>

    <!-- 大纲列表显隐切换 -->
    <button
      type="button"
      class="title-toggle"
      data-tauri-no-drag
      :class="isOutlineOpen ? 'title-toggle--on' : 'title-toggle--off'"
      :title="isOutlineOpen ? '隐藏大纲' : '显示大纲'"
      @click="$emit('toggle-outline')"
    >
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="w-4 h-4"
      >
        <line x1="4" y1="6" x2="16" y2="6" />
        <line x1="4" y1="10" x2="16" y2="10" />
        <line x1="4" y1="14" x2="16" y2="14" />
        <line v-if="!isOutlineOpen" x1="3" y1="3" x2="17" y2="17" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  isSidebarOpen: boolean;
  isOutlineOpen: boolean;
  isSourceMode: boolean;
}>();

defineEmits<{
  (e: 'toggle-sidebar'): void;
  (e: 'toggle-outline'): void;
  (e: 'toggle-source'): void;
}>();
</script>

<style scoped>
@reference "../../assets/styles/main.css";

.title-toggle {
  @apply w-9 h-full flex items-center justify-center transition-all duration-150 text-zinc-600 cursor-pointer;
}

.title-toggle:hover {
  @apply bg-black/5;
}

/* 源码按钮与文件列表按钮之间的间隔 */
.panel-toggle-spacer {
  width: 10px;
  height: 1px;
}

/* 面板显示中：按钮高亮，图标实心感 */
.title-toggle--on {
  background-color: color-mix(in srgb, var(--primary-color) 14%, transparent);
  color: var(--primary-color);
}

/* 面板已隐藏：图标淡化并叠加斜划线 */
.title-toggle--off {
  opacity: 0.45;
}

/* 源码按钮在非源码模式下始终清晰可见，点击进入源码模式 */
.title-toggle--source-off {
  opacity: 1;
}
</style>
