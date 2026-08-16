<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useSettingsStore } from '../../stores/settings';

export interface SidebarOutlineItem {
  text: string;
  level: number;
  pos: number;
}

const props = defineProps<{
  items: SidebarOutlineItem[];
  docId: string;
}>();

const emit = defineEmits<{
  (e: 'scroll-to', pos: number): void;
}>();

const settingsStore = useSettingsStore();

// 折叠状态：以 heading 的 pos 为键的 Set。
// 默认（启动 / 设置变更 / 打开新文档）依据「大纲默认展开」决定树的展开程度：
//   开 → 全部层级展开（折叠集合为空）
//   关 → 仅显示文档最顶级大纲（把「最顶级且拥有子节点」的标题折叠，其下层级全部隐藏）
const collapsed = ref<Set<number>>(new Set());

// 记录上一次套用默认的文档标识与列表长度，用于区分「打开新文档」与「编辑同一文档」
const appliedDocId = ref<string | null>(null);
let prevLen = 0;

function toggle(pos: number) {
  const next = new Set(collapsed.value);
  if (next.has(pos)) next.delete(pos);
  else next.add(pos);
  collapsed.value = next; // 替换引用以触发响应式更新
}

// 哪些标题拥有子节点（下一个 item 层级更深）→ 显示折叠箭头
const hasChildrenSet = computed(() => {
  const set = new Set<number>();
  for (let i = 0; i < props.items.length - 1; i++) {
    if (props.items[i + 1].level > props.items[i].level) {
      set.add(props.items[i].pos);
    }
  }
  return set;
});

// 标题栏「展开全部 / 收起全部」按钮状态：
//  - 所有可折叠标题均已展开 → 展开按钮禁用
//  - 所有可折叠标题均已收起 → 收起按钮禁用
const allExpanded = computed(() => {
  const collapsible = [...hasChildrenSet.value];
  return collapsible.length === 0 || collapsible.every((p) => !collapsed.value.has(p));
});

const allCollapsed = computed(() => {
  const collapsible = [...hasChildrenSet.value];
  return collapsible.length === 0 || collapsible.every((p) => collapsed.value.has(p));
});

function expandAll() {
  collapsed.value = new Set();
}

function collapseAll() {
  collapsed.value = new Set(hasChildrenSet.value);
}

// 依据「大纲默认展开」设置套用默认展开状态。
// 最顶级层级 = 文档内出现的最小 heading level（不一定是 H1）。
function applyDefault() {
  const next = new Set<number>();
  if (!settingsStore.settings.outlineExpanded && props.items.length > 0) {
    const topLevel = Math.min(...props.items.map((i) => i.level));
    for (const item of props.items) {
      if (item.level === topLevel && hasChildrenSet.value.has(item.pos)) {
        next.add(item.pos);
      }
    }
  }
  collapsed.value = next;
}

// 基于折叠态的可见项：栈算法跳过已折叠子树的后代
const visibleItems = computed<SidebarOutlineItem[]>(() => {
  const out: SidebarOutlineItem[] = [];
  const ancestors: SidebarOutlineItem[] = [];
  for (const item of props.items) {
    while (ancestors.length && ancestors[ancestors.length - 1].level >= item.level) {
      ancestors.pop();
    }
    const parent = ancestors[ancestors.length - 1];
    if (parent && collapsed.value.has(parent.pos)) continue; // 处于已折叠子树内
    out.push(item);
    ancestors.push(item); // 成为后续更深节点的候选父级
  }
  return out;
});

// 大纲数据变化时的处理：
//  - 打开新文档（docId 变化）或文档从空变为有内容 → 套用默认展开
//  - 同一文档内编辑 → 仅清理已失效的折叠项，保留用户手动展开 / 收起
watch(
  () => props.items,
  (items) => {
    const docChanged = appliedDocId.value !== props.docId;
    const becameNonEmpty = appliedDocId.value === props.docId && prevLen === 0 && items.length > 0;
    if (docChanged || becameNonEmpty) {
      applyDefault();
      appliedDocId.value = props.docId;
    } else {
      const valid = new Set(items.map((i) => i.pos));
      let changed = false;
      const next = new Set<number>();
      for (const p of collapsed.value) {
        if (valid.has(p)) next.add(p);
        else changed = true;
      }
      if (changed) collapsed.value = next;
    }
    prevLen = items.length;
  },
  { immediate: true },
);

// 设置「大纲默认展开」切换时实时套用默认
watch(() => settingsStore.settings.outlineExpanded, applyDefault);
</script>

<template>
  <div class="flex flex-col flex-1">
    <!-- 大纲标题栏：标题 + 展开全部 / 收起全部 -->
    <div
      class="flex-shrink-0 flex items-center justify-between px-4 py-2 text-xs font-semibold border-b"
      style="border-color: var(--border-color); color: var(--text-color)"
    >
      <span>大纲</span>
      <div class="flex items-center gap-0.5" data-tauri-no-drag>
        <button
          type="button"
          class="outline-header-btn"
          :disabled="allExpanded"
          :title="allExpanded ? '已全部展开' : '展开全部'"
          @click="expandAll"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4">
            <path d="M7 7l3 3 3-3" />
            <path d="M7 12l3 3 3-3" />
          </svg>
        </button>
        <button
          type="button"
          class="outline-header-btn"
          :disabled="allCollapsed"
          :title="allCollapsed ? '已全部收起' : '收起全部'"
          @click="collapseAll"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4">
            <path d="M7 13l3-3 3 3" />
            <path d="M7 8l3-3 3 3" />
          </svg>
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto p-4">
      <div v-if="items.length === 0" class="text-xs text-gray-400 px-2 italic">暂无标题</div>
      <nav class="space-y-0.5">
        <div
          v-for="item in visibleItems"
          :key="item.pos"
          :style="{ paddingLeft: `${(item.level - 1) * 12 + 8}px` }"
          class="group flex items-center py-1 pl-2 pr-2 rounded-md text-sm text-gray-600 hover:bg-blue-50 hover:text-blue-600 cursor-pointer transition-colors"
          @click="emit('scroll-to', item.pos)"
        >
          <span v-if="hasChildrenSet.has(item.pos)" class="mr-0.5 inline-flex w-3 justify-center text-[0.65rem] leading-none text-gray-400 select-none hover:text-gray-600" @click.stop="toggle(item.pos)">{{ collapsed.has(item.pos) ? '▸' : '▾' }}</span>
          <span v-else class="mr-0.5 inline-flex w-3"></span>
          <span class="truncate">{{ item.text }}</span>
        </div>
      </nav>
    </div>
  </div>
</template>

<style scoped>
.outline-header-btn {
  display: inline-flex;
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background-color: transparent;
  border: none;
  color: var(--text-color);
  opacity: 0.55;
  cursor: pointer;
  transition: background-color 0.15s, opacity 0.15s;
}

.outline-header-btn:hover:not(:disabled) {
  background-color: var(--hover-bg);
  opacity: 1;
}

.outline-header-btn:disabled {
  opacity: 0.25;
  cursor: default;
}
</style>
