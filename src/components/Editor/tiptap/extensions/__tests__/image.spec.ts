import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetLocalImageCacheForTests,
  __resetRemoteImageCacheForTests,
  __setLocalImageResolverForTests,
  __setRemoteImageFetcherForTests,
  formatImageMarkdown,
  getLocalImageDisplaySrc,
  getRemoteImageDisplaySrc,
  parseImageMarkdown,
} from '../image';

beforeEach(() => {
  __resetRemoteImageCacheForTests();
  __resetLocalImageCacheForTests();
});

describe('formatImageMarkdown', () => {
  it('formats image markdown without title', () => {
    expect(formatImageMarkdown({ src: '/demo.png', alt: 'demo', title: null }))
      .toBe('![demo](/demo.png)');
  });

  it('formats image markdown with title', () => {
    expect(formatImageMarkdown({ src: '/demo.png', alt: 'demo', title: 'cover' }))
      .toBe('![demo](/demo.png "cover")');
  });
});

describe('parseImageMarkdown', () => {
  it('parses image markdown without title', () => {
    expect(parseImageMarkdown('![demo](/demo.png)')).toEqual({
      src: '/demo.png',
      alt: 'demo',
      title: null,
    });
  });

  it('parses image markdown with title', () => {
    expect(parseImageMarkdown('![demo](/demo.png "cover")')).toEqual({
      src: '/demo.png',
      alt: 'demo',
      title: 'cover',
    });
  });

  it('returns null for invalid markdown', () => {
    expect(parseImageMarkdown('not image markdown')).toBe(null);
    expect(parseImageMarkdown('![]()')).toBe(null);
  });
});

describe('getRemoteImageDisplaySrc', () => {
  it('deduplicates pending requests for the same remote URL', async () => {
    const fetcher = vi.fn(async () => 'data:image/png;base64,demo');
    __setRemoteImageFetcherForTests(fetcher);

    await expect(Promise.all([
      getRemoteImageDisplaySrc('https://example.com/demo.png'),
      getRemoteImageDisplaySrc('https://example.com/demo.png'),
    ])).resolves.toEqual([
      'data:image/png;base64,demo',
      'data:image/png;base64,demo',
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('limits concurrent remote image requests', async () => {
    const resolvers: Array<() => void> = [];
    const fetcher = vi.fn(
      (src: string) =>
        new Promise<string>((resolve) => {
          resolvers.push(() => {
            resolve(`data:${src}`);
          });
        }),
    );
    __setRemoteImageFetcherForTests(fetcher);

    const urls = Array.from({ length: 6 }, (_, index) => `https://example.com/${index}.png`);
    const requests = urls.map((url) => getRemoteImageDisplaySrc(url));

    await Promise.resolve();
    expect(fetcher).toHaveBeenCalledTimes(4);

    resolvers.splice(0, 4).forEach((resolve) => {
      resolve();
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(fetcher).toHaveBeenCalledTimes(6);

    resolvers.splice(0).forEach((resolve) => {
      resolve();
    });
    await expect(Promise.all(requests)).resolves.toEqual(urls.map((url) => `data:${url}`));
  });

  it('caches failures briefly and falls back to the original URL', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('network failed');
    });
    __setRemoteImageFetcherForTests(fetcher);

    await expect(getRemoteImageDisplaySrc('https://example.com/missing.png'))
      .resolves.toBe('https://example.com/missing.png');
    await expect(getRemoteImageDisplaySrc('https://example.com/missing.png'))
      .resolves.toBe('https://example.com/missing.png');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('getLocalImageDisplaySrc', () => {
  it('returns remote URLs unchanged', async () => {
    expect(await getLocalImageDisplaySrc('https://example.com/a.png', '/docs/note.md'))
      .toBe('https://example.com/a.png');
  });

  it('returns data URIs unchanged', async () => {
    expect(await getLocalImageDisplaySrc('data:image/png;base64,abc', '/docs/note.md'))
      .toBe('data:image/png;base64,abc');
  });

  it('returns the original src when no document path is available', async () => {
    expect(await getLocalImageDisplaySrc('../.images/cover.png', null))
      .toBe('../.images/cover.png');
  });

  it('resolves a relative path to an asset URL via the resolver', async () => {
    __setLocalImageResolverForTests(async (src, docPath) => {
      expect(src).toBe('../.images/cover.png');
      expect(docPath).toBe('/docs/note.md');
      return 'asset://localhost/docs/.images/cover.png';
    });

    await expect(getLocalImageDisplaySrc('../.images/cover.png', '/docs/note.md'))
      .resolves.toBe('asset://localhost/docs/.images/cover.png');
  });

  it('falls back to the original src when resolution fails', async () => {
    __setLocalImageResolverForTests(async () => {
      throw new Error('file not found');
    });

    expect(await getLocalImageDisplaySrc('./missing.png', '/docs/note.md'))
      .toBe('./missing.png');
  });

  it('caches the resolved asset URL for repeated calls', async () => {
    let calls = 0;
    __setLocalImageResolverForTests(async () => {
      calls += 1;
      return 'asset://localhost/a.png';
    });

    const src = './a.png';
    const doc = '/docs/n.md';
    await getLocalImageDisplaySrc(src, doc);
    await getLocalImageDisplaySrc(src, doc);
    expect(calls).toBe(1);
  });
});
