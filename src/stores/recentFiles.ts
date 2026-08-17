import { defineStore } from 'pinia';
import {
  addRecentFile as persistAddRecentFile,
  clearRecentFiles as persistClearRecentFiles,
  getRecentFiles,
  type RecentFile,
} from '../services/tauri/history-store';

export const useRecentFilesStore = defineStore('recentFiles', {
  state: () => ({
    files: [] as RecentFile[],
    isLoaded: false,
  }),

  getters: {
    /** 按给定上限返回最近打开的文件（最近在前）。limit 至少为 1。 */
    displayFiles: (state) => (limit: number): RecentFile[] =>
      state.files.slice(0, Math.max(1, Math.floor(limit) || 1)),
  },

  actions: {
    async load() {
      try {
        this.files = await getRecentFiles();
      } catch (error) {
        console.error('[RecentFiles] 加载历史失败:', error);
        this.files = [];
      }
      this.isLoaded = true;
    },

    async add(path: string, name: string) {
      const existingIndex = this.files.findIndex((file) => file.path === path);
      if (existingIndex !== -1) {
        const [existing] = this.files.splice(existingIndex, 1);
        existing.lastOpened = Date.now();
        this.files.unshift(existing);
      } else {
        this.files.unshift({ path, name, lastOpened: Date.now() });
      }
      try {
        await persistAddRecentFile(path, name);
      } catch (error) {
        console.error('[RecentFiles] 持久化历史失败:', error);
      }
    },

    async clear() {
      this.files = [];
      try {
        await persistClearRecentFiles();
      } catch (error) {
        console.error('[RecentFiles] 清除历史失败:', error);
      }
    },
  },
});
