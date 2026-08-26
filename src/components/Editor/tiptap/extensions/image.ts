/**
 * 图片扩展
 *
 * 支持本地路径、网络 URL、data URI。
 * - 网络 URL 通过 fetch 转换为 data URI 显示。
 * - 本地路径（绝对或相对文档目录）解析为绝对路径、授权 asset 作用域后
 *   转换为 asset:// 协议地址显示（Tauri 环境下）。
 * - data URI 直接使用。
 */
import Image from '@tiptap/extension-image';
import type { Node as PMNode } from '@tiptap/pm/model';
import { useFileStore } from '../../../../stores/file';

export interface ImageMarkdownAttrs {
  src: string;
  alt: string;
  title: string | null;
  /**
   * 编辑器内图片显示宽度（像素）。仅持久化到图片 URL 的 fragment
   * （如 `image.png#width=300`），不影响标准 Markdown 查看器——浏览器
   * 渲染时会忽略 fragment，图片照常显示且按自然尺寸布局。
   */
  width: number | null;
  /**
   * 编辑器内图片显示高度（像素）。同样编码进 fragment
   * （如 `image.png#height=240`）。与 width 可同时存在（用 & 连接）。
   */
  height: number | null;
}

/**
 * 把宽/高编码进图片 URL 的 fragment，是最低侵入的标准 Markdown 兼容方案：
 * - 标准查看器：浏览器请求资源前会剥离 fragment，`image.png#width=300&height=240`
 *   等价于 `image.png`，图片正常显示。
 * - 持久化：fragment 随文档保存，重新打开后可解析还原。
 * 仅当 width/height 有效（>0）时才写入对应字段；两者均无效则不加 fragment。
 */
export function encodeImageSize(src: string, width: number | null, height: number | null): string {
  const base = (src || '').replace(/#(?:width|height)=\d+(?:&(?:width|height)=\d+)?$/, '');
  const parts: string[] = [];
  if (width && width > 0) parts.push(`width=${width}`);
  if (height && height > 0) parts.push(`height=${height}`);
  if (parts.length > 0) {
    return `${base}#${parts.join('&')}`;
  }
  return base;
}

export function formatImageMarkdown(attrs: ImageMarkdownAttrs): string {
  const alt = attrs.alt || '';
  const title = attrs.title?.replace(/"/g, '\\"') ?? '';
  const src = encodeImageSize(attrs.src, attrs.width, attrs.height);

  if (title) {
    return `![${alt}](${src} "${title}")`;
  }

  return `![${alt}](${src})`;
}

export function parseImageMarkdown(markdown: string): ImageMarkdownAttrs | null {
  const value = markdown.trim();
  const match = value.match(/^!\[(?<alt>[^\]]*)\]\((?<body>.*)\)$/);

  if (!match?.groups) {
    return null;
  }

  const alt = match.groups.alt ?? '';
  const body = match.groups.body.trim();
  const titleMatch = body.match(/^(?<src>.+?)(?:\s+"(?<title>(?:[^"\\]|\\.)*)")?$/);

  if (!titleMatch?.groups?.src) {
    return null;
  }

  const rawSrc = titleMatch.groups.src.trim();
  if (!rawSrc) {
    return null;
  }

  // 从 fragment 中分离出编辑器宽/高（如 `image.png#width=300&height=240`）
  const hashIndex = rawSrc.indexOf('#');
  let src = rawSrc;
  let width: number | null = null;
  let height: number | null = null;
  if (hashIndex >= 0) {
    src = rawSrc.slice(0, hashIndex);
    const fragment = rawSrc.slice(hashIndex + 1);
    const widthMatch = fragment.match(/(?:^|&)width=(?<width>\d+)/);
    const heightMatch = fragment.match(/(?:^|&)height=(?<height>\d+)/);
    if (widthMatch?.groups?.width) width = Number(widthMatch.groups.width);
    if (heightMatch?.groups?.height) height = Number(heightMatch.groups.height);
  }

  return {
    src,
    alt,
    title: titleMatch.groups.title == null ? null : titleMatch.groups.title.replace(/\\"/g, '"'),
    width,
    height,
  };
}

type RemoteImageFetcher = (src: string) => Promise<string>;
type RemoteImageCacheEntry =
  | { status: 'fulfilled'; value: string }
  | { status: 'pending'; promise: Promise<string> }
  | { status: 'failed'; expiresAt: number };

const MAX_REMOTE_IMAGE_CACHE_ENTRIES = 100;
const MAX_CONCURRENT_REMOTE_IMAGE_FETCHES = 4;
const REMOTE_IMAGE_FAILURE_TTL_MS = 5 * 60 * 1000;
const remoteImageCache = new Map<string, RemoteImageCacheEntry>();
const remoteImageQueue: Array<() => void> = [];

let activeRemoteImageFetches = 0;
let remoteImageFetcher: RemoteImageFetcher | null = null;

function isRemoteImageSrc(src: string): boolean {
  return /^https?:\/\//i.test(src);
}

function isDataUri(src: string): boolean {
  return /^data:/i.test(src);
}

/**
 * 是否为需要走本地文件解析的图片源：
 * 非网络 URL、非 data URI 的本地文件（绝对路径或相对文档目录的路径）。
 */
function isLocalImageSrc(src: string): boolean {
  return !!src && !isRemoteImageSrc(src) && !isDataUri(src);
}

function touchRemoteImageCacheEntry(src: string, entry: RemoteImageCacheEntry) {
  remoteImageCache.delete(src);
  remoteImageCache.set(src, entry);
}

function trimRemoteImageCache() {
  while (remoteImageCache.size > MAX_REMOTE_IMAGE_CACHE_ENTRIES) {
    let removableKey: string | null = null;
    for (const [src, entry] of remoteImageCache) {
      if (entry.status !== 'pending') {
        removableKey = src;
        break;
      }
    }

    if (!removableKey) {
      break;
    }
    remoteImageCache.delete(removableKey);
  }
}

function runWithRemoteImageConcurrency<T>(task: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      activeRemoteImageFetches += 1;
      task()
        .then(resolve, reject)
        .finally(() => {
          activeRemoteImageFetches -= 1;
          remoteImageQueue.shift()?.();
        });
    };

    if (activeRemoteImageFetches < MAX_CONCURRENT_REMOTE_IMAGE_FETCHES) {
      run();
    } else {
      remoteImageQueue.push(run);
    }
  });
}

function getRemoteImageFetcher(): RemoteImageFetcher {
  remoteImageFetcher ??= async (src: string) => {
    const { fetchRemoteImageData } = await import('../../../../services/tauri/document');
    return fetchRemoteImageData(src);
  };
  return remoteImageFetcher;
}

export async function getRemoteImageDisplaySrc(src: string): Promise<string> {
  if (!isRemoteImageSrc(src)) {
    return src;
  }

  const now = Date.now();
  const cached = remoteImageCache.get(src);
  if (cached) {
    if (cached.status === 'fulfilled') {
      touchRemoteImageCacheEntry(src, cached);
      return cached.value;
    }
    if (cached.status === 'pending') {
      touchRemoteImageCacheEntry(src, cached);
      return cached.promise;
    }
    if (cached.expiresAt > now) {
      touchRemoteImageCacheEntry(src, cached);
      return src;
    }
    remoteImageCache.delete(src);
  }

  const promise = runWithRemoteImageConcurrency(() => getRemoteImageFetcher()(src))
    .then((displaySrc) => {
      touchRemoteImageCacheEntry(src, { status: 'fulfilled', value: displaySrc });
      trimRemoteImageCache();
      return displaySrc;
    })
    .catch(() => {
      touchRemoteImageCacheEntry(src, {
        status: 'failed',
        expiresAt: Date.now() + REMOTE_IMAGE_FAILURE_TTL_MS,
      });
      trimRemoteImageCache();
      return src;
    });

  remoteImageCache.set(src, { status: 'pending', promise });
  trimRemoteImageCache();
  return promise;
}

export function __setRemoteImageFetcherForTests(fetcher: RemoteImageFetcher | null) {
  remoteImageFetcher = fetcher;
}

export function __resetRemoteImageCacheForTests() {
  remoteImageCache.clear();
  remoteImageQueue.splice(0, remoteImageQueue.length);
  activeRemoteImageFetches = 0;
  remoteImageFetcher = null;
}

/**
 * 本地图片源解析：将文档中书写的本地路径（相对或绝对）转换为可在
 * Tauri webview 中加载的 asset:// 地址。
 *
 * 流程：
 *   1. 相对路径基于当前文档目录解析为绝对路径（resolveDocumentImagePath）。
 *   2. 向 asset 协议作用域授权该文件（authorizeImageAsset）。
 *   3. 转换为 asset:// 地址（toAssetUrl）。
 *
 * 任何一步失败（如文件不存在、非 Tauri 环境）都回退为原始 src，
 * 避免抛出导致编辑器崩溃。
 */
type LocalImageResolver = (src: string, docPath: string) => Promise<string>;
type LocalImageCacheEntry =
  | { status: 'fulfilled'; value: string }
  | { status: 'pending'; promise: Promise<string> }
  | { status: 'failed'; expiresAt: number };

const MAX_LOCAL_IMAGE_CACHE_ENTRIES = 200;
const localImageCache = new Map<string, LocalImageCacheEntry>();
let localImageResolver: LocalImageResolver | null = null;

function getLocalImageResolver(): LocalImageResolver {
  localImageResolver ??= async (src: string, docPath: string) => {
    const { resolveDocumentImagePath, authorizeImageAsset }
      = await import('../../../../services/tauri/document');
    const { toAssetUrl } = await import('../../../../services/tauri/asset');
    const { absolutePath } = await resolveDocumentImagePath(docPath, src);
    const authorized = await authorizeImageAsset(absolutePath);
    return toAssetUrl(authorized.path);
  };
  return localImageResolver;
}

function trimLocalImageCache() {
  while (localImageCache.size > MAX_LOCAL_IMAGE_CACHE_ENTRIES) {
    let removableKey: string | null = null;
    for (const [src, entry] of localImageCache) {
      if (entry.status !== 'pending') {
        removableKey = src;
        break;
      }
    }
    if (!removableKey) {
      break;
    }
    localImageCache.delete(removableKey);
  }
}

export async function getLocalImageDisplaySrc(
  src: string,
  docPath: string | null,
): Promise<string> {
  if (!isLocalImageSrc(src)) {
    return src;
  }
  if (!docPath) {
    return src;
  }

  const cacheKey = `${docPath}::${src}`;
  const now = Date.now();
  const cached = localImageCache.get(cacheKey);
  if (cached) {
    if (cached.status === 'fulfilled') {
      return cached.value;
    }
    if (cached.status === 'pending') {
      return cached.promise;
    }
    if (cached.expiresAt > now) {
      return src;
    }
    localImageCache.delete(cacheKey);
  }

  const promise = getLocalImageResolver()(src, docPath)
    .then((displaySrc) => {
      localImageCache.set(cacheKey, { status: 'fulfilled', value: displaySrc });
      trimLocalImageCache();
      return displaySrc;
    })
    .catch(() => {
      localImageCache.set(cacheKey, {
        status: 'failed',
        expiresAt: Date.now() + REMOTE_IMAGE_FAILURE_TTL_MS,
      });
      trimLocalImageCache();
      return src;
    });

  localImageCache.set(cacheKey, { status: 'pending', promise });
  return promise;
}

export function __setLocalImageResolverForTests(resolver: LocalImageResolver | null) {
  localImageResolver = resolver;
}

export function __resetLocalImageCacheForTests() {
  localImageCache.clear();
  localImageResolver = null;
}

export const CustomImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      // 编辑器内显示宽度（px），持久化到 md 的 URL fragment（#width=N）。
      // 不进 HTMLAttributes，避免污染导出的 HTML；仅作为节点内部属性。
      width: {
        default: null,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-width');
          const num = raw ? Number(raw) : null;
          return num && num > 0 ? num : null;
        },
        renderHTML: () => ({}),
      },
    };
  },
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('span');
      dom.className = 'mk-image-shell';
      dom.draggable = false;

      // 图片画框：承载 <img> 与缩放手柄，作为手柄定位基准
      const frame = document.createElement('span');
      frame.className = 'mk-image-frame';

      const image = document.createElement('img');
      image.className = 'mk-image';
      image.loading = 'lazy';
      image.draggable = false;
      frame.appendChild(image);

      // 缩放手柄（仅当图片被选中时由 CSS 激活，纯展示层交互）
      const handleLeft = document.createElement('span');
      handleLeft.className = 'mk-image-resize-handle handle-left';
      handleLeft.setAttribute('aria-hidden', 'true');
      const handleRight = document.createElement('span');
      handleRight.className = 'mk-image-resize-handle handle-right';
      handleRight.setAttribute('aria-hidden', 'true');
      const handleTop = document.createElement('span');
      handleTop.className = 'mk-image-resize-handle handle-top';
      handleTop.setAttribute('aria-hidden', 'true');
      const handleBottom = document.createElement('span');
      handleBottom.className = 'mk-image-resize-handle handle-bottom';
      handleBottom.setAttribute('aria-hidden', 'true');
      // 右下角手柄：按图片固有比例同比例缩放宽度与高度
      const handleCorner = document.createElement('span');
      handleCorner.className = 'mk-image-resize-handle handle-corner';
      handleCorner.setAttribute('aria-hidden', 'true');
      frame.appendChild(handleLeft);
      frame.appendChild(handleRight);
      frame.appendChild(handleTop);
      frame.appendChild(handleBottom);
      frame.appendChild(handleCorner);

      dom.appendChild(frame);

      const sourceText = document.createElement('div');
      sourceText.className = 'mk-image-source-text';
      sourceText.contentEditable = 'plaintext-only';
      sourceText.spellcheck = false;
      sourceText.draggable = false;
      dom.appendChild(sourceText);

      let isEditing = false;

      const getAttrs = (): ImageMarkdownAttrs => ({
        src: (node.attrs.src as string) || '',
        alt: (node.attrs.alt as string) || '',
        title: (node.attrs.title as string | null) ?? null,
        width: typeof node.attrs.width === 'number' ? (node.attrs.width as number) : null,
        height: typeof node.attrs.height === 'number' ? (node.attrs.height as number) : null,
      });

      let displayRequestId = 0;
      let displaySrc = '';

      // 把节点 width/height 应用到展示层（不影响 md 文本，仅改 DOM 尺寸）。
      // 仅当某维度被显式设置时才覆盖，未设置的维度保留自然尺寸。
      function applySizeToView(width: number | null, height: number | null) {
        image.style.width = (width && width > 0) ? `${width}px` : '';
        image.style.height = (height && height > 0) ? `${height}px` : '';
      }

      function syncView() {
        const attrs = getAttrs();
        const fallbackSrc = attrs.src;

        if (displaySrc !== fallbackSrc) {
          displaySrc = fallbackSrc;
          image.src = fallbackSrc;
        }

        image.alt = attrs.alt;
        image.title = attrs.title ?? '';

        applySizeToView(attrs.width, attrs.height);

        if (isRemoteImageSrc(attrs.src)) {
          const requestId = ++displayRequestId;
          void getRemoteImageDisplaySrc(attrs.src).then((displaySrc) => {
            if (requestId === displayRequestId) {
              if (image.src !== displaySrc) {
                image.src = displaySrc;
              }
            }
          });
        } else if (isLocalImageSrc(attrs.src)) {
          const requestId = ++displayRequestId;
          const docPath = useFileStore().currentFile.path;
          void getLocalImageDisplaySrc(attrs.src, docPath).then((displaySrc) => {
            if (requestId === displayRequestId && image.src !== displaySrc) {
              image.src = displaySrc;
            }
          });
        }

        if (!isEditing) {
          sourceText.textContent = formatImageMarkdown(attrs);
        }
      }

      function commit() {
        const parsed = parseImageMarkdown(sourceText.textContent || '');
        if (!parsed) {
          dom.classList.add('is-invalid');
          requestAnimationFrame(() => {
            sourceText.focus();
          });
          return;
        }

        dom.classList.remove('is-invalid');
        isEditing = false;
        dom.classList.remove('is-editing');

        const current = getAttrs();
        if (
          parsed.src === current.src
          && parsed.alt === current.alt
          && parsed.title === current.title
          && parsed.width === current.width
          && parsed.height === current.height
        ) {
          syncView();
          return;
        }

        if (typeof getPos !== 'function') {
          syncView();
          return;
        }

        const pos = getPos();
        if (typeof pos !== 'number') {
          syncView();
          return;
        }
        const tr = editor.state.tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          ...parsed,
        });
        editor.view.dispatch(tr);
      }

      function cancel() {
        isEditing = false;
        dom.classList.remove('is-editing');
        dom.classList.remove('is-invalid');
        syncView();
      }

      // ── 拖拽缩放（写入节点 width/height 属性，持久化到 md 的 URL fragment）──
      // - 左右手柄：只调宽度，互不锁定宽高比
      // - 上下手柄：只调高度，互不锁定宽高比
      // - 右下角手柄：按当前显示宽高比同比例缩放宽度与高度
      // 任一维度未设置时保留自然尺寸。限制最小/最大值。
      const MIN_SIZE = 40;
      const MAX_SIZE = 4000;

      function setSize(nextWidth: number | null, nextHeight: number | null) {
        const current = getAttrs();
        const clamp = (v: number | null) =>
          (v == null || v <= 0) ? null : Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(v)));
        const width = clamp(nextWidth);
        const height = clamp(nextHeight);
        if (width === current.width && height === current.height) {
          return;
        }
        if (typeof getPos !== 'function') {
          return;
        }
        const pos = getPos();
        if (typeof pos !== 'number') {
          return;
        }
        const tr = editor.state.tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          width,
          height,
        });
        editor.view.dispatch(tr);
      }

      function startResize(event: PointerEvent) {
        event.preventDefault();
        event.stopPropagation();

        const handle = event.target as HTMLElement;
        const rect = image.getBoundingClientRect();
        const startX = event.clientX;
        const startY = event.clientY;
        const startWidth = rect.width;
        const startHeight = rect.height;
        const isHorizontal = handle.classList.contains('handle-left')
          || handle.classList.contains('handle-right');
        const isVertical = handle.classList.contains('handle-top')
          || handle.classList.contains('handle-bottom');
        const isCorner = handle.classList.contains('handle-corner');
        const horizontalDir = handle.classList.contains('handle-left') ? -1 : 1;
        const verticalDir = handle.classList.contains('handle-top') ? -1 : 1;
        // 同比例缩放以图片左上角为锚点：缩放后图片右下角跟随鼠标，
        // 宽度 = 鼠标X - 图片左边缘，高度按当前显示宽高比联动。
        // 这样按下瞬间（鼠标在手柄处）scale 恰为 1，不会瞬间缩到极小。
        const anchorLeft = rect.left;
        const aspect = startWidth / startHeight || 1;
        handle.setPointerCapture(event.pointerId);

        const onMove = (moveEvent: PointerEvent) => {
          if (isCorner) {
            const nextWidth = moveEvent.clientX - anchorLeft;
            const nextHeight = nextWidth / aspect;
            setSize(nextWidth, nextHeight);
            return;
          }
          const deltaX = moveEvent.clientX - startX;
          const deltaY = moveEvent.clientY - startY;
          const nextWidth = isHorizontal ? startWidth + horizontalDir * deltaX : null;
          const nextHeight = isVertical ? startHeight + verticalDir * deltaY : null;
          setSize(nextWidth, nextHeight);
        };

        const onUp = (upEvent: PointerEvent) => {
          handle.releasePointerCapture(upEvent.pointerId);
          handle.removeEventListener('pointermove', onMove);
          handle.removeEventListener('pointerup', onUp);
          editor.commands.focus();
        };

        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', onUp);
      }

      for (const handle of [handleLeft, handleRight, handleTop, handleBottom, handleCorner]) {
        handle.addEventListener('pointerdown', startResize);
        handle.addEventListener('mousedown', (e) => e.stopPropagation());
        handle.addEventListener('dragstart', (e) => e.preventDefault());
      }

      dom.addEventListener('dragstart', (event) => {
        event.preventDefault();
      });

      sourceText.addEventListener('mousedown', (event) => {
        event.stopPropagation();
      });

      sourceText.addEventListener('focus', () => {
        isEditing = true;
        dom.classList.add('is-editing');
        dom.classList.remove('is-invalid');
      });

      sourceText.addEventListener('blur', () => {
        commit();
      });

      sourceText.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          commit();
          editor.commands.focus();
          return;
        }

        if (event.key === 'Escape') {
          event.preventDefault();
          cancel();
          editor.commands.focus();
        }
      });

      syncView();

      return {
        dom,
        update(updatedNode: PMNode) {
          if (updatedNode.type.name !== 'image') {
            return false;
          }

          node = updatedNode;
          syncView();
          return true;
        },
        stopEvent(event: Event) {
          return event.target instanceof Node && sourceText.contains(event.target);
        },
        ignoreMutation(mutation: MutationRecord | { type: 'selection'; target: Node }) {
          return (
            mutation.target instanceof Node
            && (
              mutation.target === dom
              || sourceText.contains(mutation.target)
              || image.contains(mutation.target)
            )
          );
        },
      };
    };
  },
}).configure({
  inline: true,
  allowBase64: true,
  HTMLAttributes: {
    class: 'mk-image',
    loading: 'lazy',
  },
});
