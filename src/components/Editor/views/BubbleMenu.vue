<template>
  <div
    v-show="visible"
    ref="menuRef"
    class="bubble-menu"
    :style="{ left: `${pos.left}px`, top: `${pos.top}px`, transform: 'translate(-50%, -120%)' }"
    @mousedown.prevent
    @click.stop
  >
    <!-- 主工具栏 -->
    <div class="bubble-menu-toolbar">
      <button :class="btnClass(activeMarks.bold)" title="加粗" @click="exec('bold')">
        <span class="font-bold text-lg">B</span>
      </button>
      <button :class="btnClass(activeMarks.italic)" title="斜体" @click="exec('italic')">
        <span class="italic text-lg">I</span>
      </button>
      <button :class="btnClass(activeMarks.code)" title="行内代码" @click="exec('code')">
        <span class="font-mono text-sm">&lt;/&gt;</span>
      </button>
      <button :class="btnClass(activeMarks.link)" title="链接" @click="toggleLinkInput">
        <span>🔗</span>
      </button>
      <div class="bubble-menu-divider"></div>
      <button class="bubble-menu-heading-btn" title="正文" @click="exec('paragraph')">T</button>
      <button class="bubble-menu-heading-btn" @click="exec('h1')">H1</button>
      <button class="bubble-menu-heading-btn" @click="exec('h2')">H2</button>
      <button class="bubble-menu-heading-btn" @click="exec('h3')">H3</button>
      <button class="bubble-menu-heading-btn" @click="exec('h4')">H4</button>
    </div>

    <!-- 表格工具条（光标位于表格内时显示） -->
    <div v-if="inTable" class="bubble-menu-toolbar bubble-menu-table-bar">
      <button class="bubble-menu-btn" title="在左侧插入列" :disabled="!can('table.addColumnBefore')" @click="exec('table.addColumnBefore')">⇤∣</button>
      <button class="bubble-menu-btn" title="在右侧插入列" :disabled="!can('table.addColumnAfter')" @click="exec('table.addColumnAfter')">∣⇥</button>
      <button class="bubble-menu-btn bubble-menu-btn--danger" title="删除当前列" :disabled="!can('table.deleteColumn')" @click="exec('table.deleteColumn')">✕列</button>
      <div class="bubble-menu-divider"></div>
      <button class="bubble-menu-btn" title="在上方插入行" :disabled="!can('table.addRowBefore')" @click="exec('table.addRowBefore')">↑行</button>
      <button class="bubble-menu-btn" title="在下方插入行" :disabled="!can('table.addRowAfter')" @click="exec('table.addRowAfter')">↓行</button>
      <button class="bubble-menu-btn bubble-menu-btn--danger" title="删除当前行" :disabled="!can('table.deleteRow')" @click="exec('table.deleteRow')">✕行</button>
      <div class="bubble-menu-divider"></div>
      <button class="bubble-menu-btn" title="切换表头列" :disabled="!can('table.toggleHeaderColumn')" @click="exec('table.toggleHeaderColumn')">⤓头列</button>
      <button class="bubble-menu-btn" title="切换表头行" :disabled="!can('table.toggleHeaderRow')" @click="exec('table.toggleHeaderRow')">⤓头行</button>
    </div>

    <!-- 链接输入区 -->
    <div v-if="showLinkInput" class="bubble-menu-link-section">
      <input
        ref="linkInputRef"
        v-model="linkUrl"
        type="url"
        placeholder="输入链接地址..."
        class="bubble-menu-input"
        @keydown.enter="applyLink"
        @keydown.escape="cancelLink"
      />
      <button class="bubble-menu-btn-primary" @click="applyLink">
        确定
      </button>
      <button v-if="activeMarks.link" class="bubble-menu-btn-danger" @click="removeLink">
        移除
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, nextTick } from 'vue';
import type { Editor as TiptapEditor } from '@tiptap/vue-3';
import { canRunTableCommand } from '../tiptap/editor-commands';

type BubbleMenuActionData = {
  href?: string;
};

type ActiveMarks = {
  bold: boolean;
  italic: boolean;
  code: boolean;
  link: boolean;
};

const props = defineProps<{
  editor: TiptapEditor | null;
  onAction: (type: string, data?: BubbleMenuActionData) => void;
}>();

const visible = ref(false);
const pos = reactive({ left: 0, top: 0 });
const inTable = ref(false);
const activeMarks = reactive({
  bold: false,
  italic: false,
  code: false,
  link: false,
});

// 表格命令可用性判断（依赖光标位于单元格内）
const can = (commandId: string): boolean => canRunTableCommand(props.editor, commandId);

// 链接输入相关
const showLinkInput = ref(false);
const linkUrl = ref('');
const linkInputRef = ref<HTMLInputElement | null>(null);

const btnClass = (active: boolean) => [
  'bubble-menu-btn',
  active ? 'bubble-menu-btn--active' : '',
];

const exec = (type: string) => {
  props.onAction(type);
};

// 切换链接输入区
const toggleLinkInput = () => {
  showLinkInput.value = !showLinkInput.value;
  if (showLinkInput.value) {
    nextTick(() => {
      linkInputRef.value?.focus();
    });
  }
};

// 应用链接
const applyLink = () => {
  if (linkUrl.value.trim()) {
    props.onAction('link', { href: linkUrl.value.trim() });
  }
  showLinkInput.value = false;
  linkUrl.value = '';
};

// 移除链接
const removeLink = () => {
  props.onAction('unlink');
  showLinkInput.value = false;
  linkUrl.value = '';
};

// 取消链接输入
const cancelLink = () => {
  showLinkInput.value = false;
  linkUrl.value = '';
};

// 暴露更新方法给插件调用
defineExpose({
  update(show: boolean, left: number, top: number, marks: Partial<ActiveMarks>, linkHref?: string, inTableFlag = false) {
    visible.value = show;
    pos.left = left;
    pos.top = top;
    inTable.value = inTableFlag;
    Object.assign(activeMarks, marks);

    // 如果已有链接，填充 URL
    if (linkHref) {
      linkUrl.value = linkHref;
    }

    // 关闭链接输入区（除非正在编辑链接）
    if (!marks.link) {
      showLinkInput.value = false;
      linkUrl.value = '';
    }
  },
});
</script>

<style scoped>
.bubble-menu {
  position: fixed;
  z-index: 50;
  display: flex;
  flex-direction: column;
  padding: 4px;
  background-color: var(--popover-bg);
  border: 1px solid var(--popover-border);
  border-radius: var(--radius-md);
  box-shadow: var(--popover-shadow);
  transition: all 0.2s;
}

.bubble-menu-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
}

.bubble-menu-table-bar {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid var(--border-light);
  flex-wrap: wrap;
}

.bubble-menu-table-bar .bubble-menu-btn {
  width: auto;
  height: 28px;
  padding: 0 6px;
  font-size: 12px;
}

.bubble-menu-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.bubble-menu-btn--danger {
  color: var(--error-color);
}

.bubble-menu-btn--danger:hover:not(:disabled) {
  background-color: var(--error-bg);
}

.bubble-menu-btn {
  display: flex;
  height: 32px;
  width: 32px;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--text-color);
  background-color: transparent;
  transition: background-color 0.15s;
  cursor: pointer;
  border: none;
}

.bubble-menu-btn:hover {
  background-color: var(--hover-bg);
}

.bubble-menu-btn--active {
  background-color: var(--primary-light);
  color: var(--primary-color);
}

.bubble-menu-divider {
  margin: 0 4px;
  height: 16px;
  width: 1px;
  background-color: var(--border-color);
}

.bubble-menu-heading-btn {
  padding: 4px 8px;
  font-size: 12px;
  border-radius: var(--radius-sm);
  background-color: transparent;
  color: var(--text-color);
  cursor: pointer;
  border: none;
  transition: background-color 0.15s;
}

.bubble-menu-heading-btn:hover {
  background-color: var(--hover-bg);
}

.bubble-menu-link-section {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid var(--border-light);
  display: flex;
  align-items: center;
  gap: 4px;
}

.bubble-menu-input {
  width: 180px;
  padding: 4px 8px;
  font-size: 12px;
  background-color: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: var(--radius-sm);
  color: var(--text-color);
  outline: none;
}

.bubble-menu-input:focus {
  border-color: var(--input-focus-border);
  box-shadow: var(--input-focus-shadow);
}

.bubble-menu-input::placeholder {
  color: var(--input-placeholder);
}

.bubble-menu-btn-primary {
  padding: 4px 8px;
  font-size: 12px;
  background-color: var(--btn-primary-bg);
  color: var(--btn-primary-text);
  border-radius: var(--radius-sm);
  cursor: pointer;
  border: none;
  transition: background-color 0.15s;
}

.bubble-menu-btn-primary:hover {
  background-color: var(--btn-primary-hover);
}

.bubble-menu-btn-danger {
  padding: 4px 8px;
  font-size: 12px;
  background-color: transparent;
  color: var(--error-color);
  border-radius: var(--radius-sm);
  cursor: pointer;
  border: none;
  transition: background-color 0.15s;
}

.bubble-menu-btn-danger:hover {
  background-color: var(--error-bg);
}
</style>
