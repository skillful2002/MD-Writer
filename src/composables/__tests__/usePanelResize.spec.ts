import { describe, expect, it } from 'vitest';
import {
  PANEL_WIDTH_LIMITS,
  RESIZER_WIDTH,
  clampPanelWidth,
  panelAvailableWidth,
} from '../usePanelResize';

describe('panelAvailableWidth', () => {
  it('为中间编辑区预留一半容器宽度', () => {
    // 1600 宽容器：编辑区占 800，其余 800 里扣掉右侧 256 与两条拖动条
    expect(panelAvailableWidth(1600, 'sidebar', 256)).toBe(1600 * 0.5 - 256 - RESIZER_WIDTH * 2);
    expect(panelAvailableWidth(1600, 'outline', 256)).toBe(1600 * 0.5 - 256 - RESIZER_WIDTH * 2);
  });

  it('容器宽度异常时回落到面板最大宽度', () => {
    expect(panelAvailableWidth(0, 'sidebar', 256)).toBe(PANEL_WIDTH_LIMITS.sidebar.max);
    expect(panelAvailableWidth(Number.NaN, 'outline', 256)).toBe(PANEL_WIDTH_LIMITS.outline.max);
  });

  it('按该上限收敛后，编辑区仍不少于容器的一半', () => {
    const total = 1200;
    const otherWidth = 200;
    const available = panelAvailableWidth(total, 'sidebar', otherWidth);
    const width = clampPanelWidth('sidebar', 900, available);
    const editorWidth = total - width - otherWidth - RESIZER_WIDTH * 2;
    expect(editorWidth).toBeGreaterThanOrEqual(total * 0.5);
  });
});

describe('clampPanelWidth', () => {
  it('区间内的宽度原样保留', () => {
    expect(clampPanelWidth('sidebar', 320, 800)).toBe(320);
    expect(clampPanelWidth('outline', 300, 800)).toBe(300);
  });

  it('低于下限时收敛到最小宽度', () => {
    expect(clampPanelWidth('sidebar', 40, 800)).toBe(PANEL_WIDTH_LIMITS.sidebar.min);
    expect(clampPanelWidth('outline', 0, 800)).toBe(PANEL_WIDTH_LIMITS.outline.min);
  });

  it('高于上限时收敛到最大宽度', () => {
    expect(clampPanelWidth('sidebar', 9999, 9999)).toBe(PANEL_WIDTH_LIMITS.sidebar.max);
  });

  it('可压缩到 0 时改由可用空间决定上限', () => {
    expect(clampPanelWidth('sidebar', 500, 400)).toBe(400);
  });

  it('可用空间不足下限时仍保证最小宽度可用', () => {
    expect(clampPanelWidth('sidebar', 500, 60)).toBe(PANEL_WIDTH_LIMITS.sidebar.min);
  });

  it('异常值回落到默认宽度', () => {
    expect(clampPanelWidth('sidebar', Number.NaN, 800)).toBe(PANEL_WIDTH_LIMITS.sidebar.default);
    expect(clampPanelWidth('outline', Number.POSITIVE_INFINITY, 800)).toBe(
      PANEL_WIDTH_LIMITS.outline.default,
    );
  });

  it('结果取整，避免出现半像素宽度', () => {
    expect(clampPanelWidth('sidebar', 320.6, 800)).toBe(321);
  });
});
