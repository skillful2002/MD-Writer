<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue';

import { invokeCommand } from '../../services/tauri/client';
import { TAURI_COMMANDS } from '../../services/tauri/command-names';

const model = defineModel<string>({ required: true });

// 始终保留的兜底选项：system-ui 是跨平台最稳的默认，不依赖任何已安装字体。
const FALLBACK_SYSTEM = 'system-ui';

// 当系统字体枚举失败（例如非 Tauri 环境 / 命令不可用）时的极小白名单，
// 保证选择器不会变成空白。
const EMERGENCY_FALLBACK = [
  'system-ui',
  'Menlo',
  'Monaco',
  'PingFang SC',
  'Microsoft YaHei',
  'Consolas',
  'Helvetica Neue',
];

const loading = ref(true);
const systemFonts = ref<string[]>([]);

// 用 canvas 测量 'i' 与 'W' 宽度是否相等，判断是否为等宽字体。
function isMonospace(family: string): boolean {
  if (typeof document === 'undefined') return false;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  ctx.font = `16px "${family}", monospace`;
  const wI = ctx.measureText('i').width;
  const wW = ctx.measureText('W').width;
  // 容差 0.5px，规避亚像素误差
  return Math.abs(wI - wW) < 0.5;
}

const fontGroups = computed(() => {
  const current = model.value;
  const names = new Set<string>(systemFonts.value);

  // 保证当前已选值一定在列表里（旧设置可能不在本机探测结果中）
  if (current && current !== FALLBACK_SYSTEM) {
    names.add(current);
  }

  const all = Array.from(names).sort((a, b) => a.localeCompare(b));
  const mono: string[] = [];
  const text: string[] = [];

  for (const name of all) {
    if (name === FALLBACK_SYSTEM) {
      text.unshift(name); // system-ui 永远在阅读组置顶
    } else if (isMonospace(name)) {
      mono.push(name);
    } else {
      text.push(name);
    }
  }

  const groups: { label: string; options: { value: string; label: string }[] }[] = [];
  if (text.length) {
    groups.push({
      label: '阅读 / 无衬线',
      options: text.map((v) => ({ value: v, label: v })),
    });
  }
  if (mono.length) {
    groups.push({
      label: '等宽 / 编程',
      options: mono.map((v) => ({ value: v, label: v })),
    });
  }
  return groups;
});

async function loadFonts() {
  loading.value = true;
  try {
    const fonts = await invokeCommand<string[]>(TAURI_COMMANDS.listSystemFonts);
    if (Array.isArray(fonts) && fonts.length > 0) {
      systemFonts.value = fonts;
    } else {
      systemFonts.value = [...EMERGENCY_FALLBACK];
    }
  } catch {
    // 命令不可用（如纯 Web 环境）时降级
    systemFonts.value = [...EMERGENCY_FALLBACK];
  } finally {
    loading.value = false;
  }
}

onMounted(loadFonts);

// 若当前值在加载完成后不在系统字体中，且非 system-ui，则回退到 system-ui
watch(loading, (done) => {
  if (!done) return;
  const available = new Set(systemFonts.value);
  if (model.value !== FALLBACK_SYSTEM && !available.has(model.value)) {
    model.value = FALLBACK_SYSTEM;
  }
});
</script>

<template>
  <div class="settings-font-select">
    <label class="settings-font-select__label">字体族</label>
    <select
      v-model="model"
      class="settings-font-select__input"
      :disabled="loading"
    >
      <option v-if="loading" value="">正在读取系统字体…</option>
      <optgroup v-for="group in fontGroups" :key="group.label" :label="group.label">
        <option v-for="opt in group.options" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </optgroup>
    </select>
    <p class="settings-font-select__hint">
      下拉项均为本机已安装字体，选择后立即生效。
    </p>
  </div>
</template>

<style scoped>
.settings-font-select {
  min-width: 0;
}

.settings-font-select__label {
  display: block;
  color: var(--text-color);
  font-size: 14px;
  font-weight: 500;
}

.settings-font-select__input {
  width: 100%;
  margin-top: 8px;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background-color: var(--bg-color);
  color: var(--text-color);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.settings-font-select__input:focus {
  border-color: transparent;
  outline: none;
  box-shadow: 0 0 0 2px #3b82f6;
}

.settings-font-select__hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--text-muted, #8a8a8a);
}
</style>
