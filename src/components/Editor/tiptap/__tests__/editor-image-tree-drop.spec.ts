import { describe, expect, it } from 'vitest';

import {
  clearTreeImageDragData,
  getTreeImageDropPath,
  relativePathFrom,
  setTreeImageDragData,
} from '../editor-image-tree-drop';

const emptyEvent = { dataTransfer: null } as unknown as DragEvent;

describe('tree image drag fallback', () => {
  it('reads the path from the module-level pending value after dragstart', () => {
    setTreeImageDragData(emptyEvent, '/docs/photo.png');
    // dataTransfer 为空也能拿到路径（绕过 WebView 清空 dataTransfer 的问题）
    expect(getTreeImageDropPath(emptyEvent)).toBe('/docs/photo.png');
  });

  it('consumes the pending value so a second drop reads nothing', () => {
    setTreeImageDragData(emptyEvent, '/docs/photo.png');
    getTreeImageDropPath(emptyEvent);
    expect(getTreeImageDropPath(emptyEvent)).toBeNull();
  });

  it('clearTreeImageDragData wipes the pending value', () => {
    setTreeImageDragData(emptyEvent, '/docs/photo.png');
    clearTreeImageDragData();
    expect(getTreeImageDropPath(emptyEvent)).toBeNull();
  });
});

describe('relativePathFrom', () => {
  it('returns a sibling file path within the same directory', () => {
    expect(relativePathFrom('/docs', '/docs/photo.png')).toBe('photo.png');
  });

  it('keeps a subdirectory prefix', () => {
    expect(relativePathFrom('/docs', '/docs/sub/photo.png')).toBe('sub/photo.png');
  });

  it('uses .. for a parent-sibling directory', () => {
    expect(relativePathFrom('/workspace/docs', '/workspace/images/photo.png')).toBe(
      '../images/photo.png',
    );
  });

  it('normalizes windows separators', () => {
    expect(relativePathFrom('C:/docs', 'C:/docs/sub/photo.png')).toBe('sub/photo.png');
  });

  it('falls back to the absolute path across drives', () => {
    expect(relativePathFrom('C:/docs', 'D:/photos/photo.png')).toBe('D:/photos/photo.png');
  });
});
