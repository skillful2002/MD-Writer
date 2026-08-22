import { defineStore } from 'pinia';

export interface FileState {
  path: string | null;
  content: string;
  isDirty: boolean;
  lastModifiedTime: number | null;
  /** 代码文件的 lowlight 语言 id；null 表示非代码文件或降级为纯文本 */
  language: string | null;
  /** 文件实际编码(如 "utf-8" / "gb18030")；保存时按此编码回写，避免改变原文件编码 */
  encoding: string;
  /** 当前文件是否已就"保存编码"做过选择；每个文件只询问一次，随文件重置 */
  encodingResolved: boolean;
}

interface FileStoreState {
  currentFile: FileState;
  hasUserEdit: boolean;
  isLoading: boolean;
  // 未命名（新建）文档首次保存时建议默认定位的目录
  suggestedDir: string | null;
}

function createEmptyFileState(): FileState {
  return {
    path: null,
    content: '',
    isDirty: false,
    lastModifiedTime: null,
    language: null,
    encoding: 'utf-8',
    encodingResolved: true,
  };
}

export const useFileStore = defineStore('file', {
  state: (): FileStoreState => ({
    currentFile: createEmptyFileState(),
    // 标记用户是否有过编辑操作
    hasUserEdit: false,
    isLoading: false,
    suggestedDir: null,
  }),

  actions: {
    setLoading(loading: boolean) {
      this.isLoading = loading;
    },

    setContent(content: string) {
      this.currentFile.content = content;
      // 只有用户有编辑操作时才标记为脏
      if (this.hasUserEdit) {
        this.currentFile.isDirty = true;
      }
    },

    // 用户编辑操作时调用
    markUserEdit() {
      this.hasUserEdit = true;
      this.currentFile.isDirty = true;
    },

    setFile(
      content: string,
      path: string | null,
      lastModifiedTime: number | null = null,
      language: string | null = null,
      encoding: string = 'utf-8',
      encodingResolved: boolean = true,
    ) {
      this.currentFile = {
        path,
        content,
        isDirty: false,
        lastModifiedTime,
        language,
        encoding,
        encodingResolved,
      };
      // 重置编辑标志
      this.hasUserEdit = false;
    },

    markSaved(lastModifiedTime: number | null = null) {
      this.currentFile.isDirty = false;
      this.hasUserEdit = false;
      if (lastModifiedTime !== null) {
        this.currentFile.lastModifiedTime = lastModifiedTime;
      }
    },

    reset() {
      this.currentFile = createEmptyFileState();
      this.hasUserEdit = false;
      this.suggestedDir = null;
    },

    setSuggestedDir(dir: string | null) {
      this.suggestedDir = dir;
    },
  },
});
