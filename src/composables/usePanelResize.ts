import { onMounted, onUnmounted, ref, type Ref } from 'vue';

/** 三栏布局中的可拖动面板：左侧文件树、右侧大纲，中间编辑区随两侧宽度自适应 */
export type PanelSide = 'sidebar' | 'outline';

/** 各面板宽度限制（px）。默认值与原先写死的 256px（w-64）保持一致 */
export const PANEL_WIDTH_LIMITS: Record<PanelSide, { min: number; max: number; default: number }> =
  {
    sidebar: { min: 180, max: 520, default: 256 },
    outline: { min: 160, max: 520, default: 256 },
  };

/** 拖动条自身的宽度（px），用于计算中间编辑区可用空间 */
export const RESIZER_WIDTH = 5;

/** 中间编辑区至少要占容器宽度的这一比例，两侧拖动均不得越过此线 */
export const MIN_EDITOR_RATIO = 0.5;

/**
 * 该面板能占用的最大宽度：容器宽度的剩余部分（1 - MIN_EDITOR_RATIO）
 * 扣掉另一侧面板与两条拖动条。窗口过窄时返回值可能小于面板最小宽度，
 * 由 clampPanelWidth 兜底到 min。
 */
export function panelAvailableWidth(total: number, side: PanelSide, otherWidth: number): number {
  if (!Number.isFinite(total) || total <= 0) {
    return PANEL_WIDTH_LIMITS[side].max;
  }
  return total * (1 - MIN_EDITOR_RATIO) - otherWidth - RESIZER_WIDTH * 2;
}

/**
 * 把目标宽度收敛到合法区间。
 * available 是「留给该面板的最大可用宽度」，窗口过窄时上限会低于 max，
 * 但不会低于 min（宁可暂时放宽 50% 编辑区约束，也不让面板窄到无法使用）。
 */
export function clampPanelWidth(side: PanelSide, width: number, available: number): number {
  if (!Number.isFinite(width)) return PANEL_WIDTH_LIMITS[side].default;
  const { min, max } = PANEL_WIDTH_LIMITS[side];
  const upper = Number.isFinite(available) ? Math.max(min, Math.min(max, available)) : max;
  const clamped = Math.min(Math.max(width, min), upper);
  return Math.round(clamped);
}

interface UsePanelResizeOptions {
  /** 左侧面板宽度（本地响应式值，拖动过程中高频更新，不直接写配置） */
  sidebarWidth: Ref<number>;
  /** 右侧大纲宽度 */
  outlineWidth: Ref<number>;
  /** 三栏容器，用于算可用空间 */
  containerRef: Ref<HTMLElement | null>;
  /** 拖动结束 / 键盘微调后回调，用于把最终宽度持久化到配置 */
  onCommit?: () => void;
}

export function usePanelResize(options: UsePanelResizeOptions) {
  const { sidebarWidth, outlineWidth, containerRef, onCommit } = options;

  /** 当前正在拖动的面板，null 表示没有拖动 */
  const activeSide = ref<PanelSide | null>(null);

  let dragSide: PanelSide | null = null;
  let startX = 0;
  let startWidth = 0;

  function widthRef(side: PanelSide): Ref<number> {
    return side === 'sidebar' ? sidebarWidth : outlineWidth;
  }

  /** 该面板能占用的最大宽度：容器宽 - 另一侧宽度 - 两条拖动条 - 编辑区最小宽度 */
  function availableWidth(side: PanelSide): number {
    const container = containerRef.value;
    const total = container ? container.clientWidth : window.innerWidth;
    const otherWidth = side === 'sidebar' ? outlineWidth.value : sidebarWidth.value;
    return panelAvailableWidth(total, side, otherWidth);
  }

  function applyWidth(side: PanelSide, width: number) {
    widthRef(side).value = clampPanelWidth(side, width, availableWidth(side));
  }

  function handleMouseMove(event: MouseEvent) {
    if (!dragSide) return;
    const delta = event.clientX - startX;
    // 左侧面板跟随鼠标右移变宽，右侧面板跟随鼠标右移变窄
    applyWidth(dragSide, dragSide === 'sidebar' ? startWidth + delta : startWidth - delta);
  }

  function stopResize() {
    if (!dragSide) return;
    dragSide = null;
    activeSide.value = null;
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', stopResize);
    window.removeEventListener('blur', stopResize);
    document.body.classList.remove('panel-resizing');
    onCommit?.();
  }

  function startResize(side: PanelSide, event: MouseEvent) {
    if (event.button !== 0) return;
    event.preventDefault();
    dragSide = side;
    activeSide.value = side;
    startX = event.clientX;
    startWidth = widthRef(side).value;
    // 拖动过程中锁定光标并禁止选中文字，避免划过正文时产生选区
    document.body.classList.add('panel-resizing');
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopResize);
    window.addEventListener('blur', stopResize);
  }

  /** 双击拖动条恢复默认宽度 */
  function resetWidth(side: PanelSide) {
    applyWidth(side, PANEL_WIDTH_LIMITS[side].default);
    onCommit?.();
  }

  /** 键盘微调（方向键），delta 为正表示拖动条向右移动 */
  function nudgeWidth(side: PanelSide, delta: number) {
    applyWidth(side, widthRef(side).value + (side === 'sidebar' ? delta : -delta));
    onCommit?.();
  }

  /**
   * 把两侧宽度重新收进当前容器的合法范围：
   * 窗口变窄、或从配置恢复出超限宽度（中间编辑区不足 50%）时调用。
   * 只改本地宽度，不覆盖用户配置。
   */
  function refreshLimits() {
    applyWidth('sidebar', sidebarWidth.value);
    applyWidth('outline', outlineWidth.value);
  }

  onMounted(() => {
    window.addEventListener('resize', refreshLimits);
  });

  onUnmounted(() => {
    stopResize();
    window.removeEventListener('resize', refreshLimits);
  });

  return {
    activeSide,
    startResize,
    stopResize,
    resetWidth,
    nudgeWidth,
    refreshLimits,
  };
}
