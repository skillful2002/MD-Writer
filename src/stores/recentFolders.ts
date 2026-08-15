import { defineStore } from 'pinia';
import {
  addRecentFolder as persistAddRecentFolder,
  clearRecentFolders as persistClearRecentFolders,
  getRecentFolders,
  type RecentFolder,
} from '../services/tauri/history-store';

export const useRecentFoldersStore = defineStore('recentFolders', {
  state: () => ({
    folders: [] as RecentFolder[],
    isLoaded: false,
  }),

  getters: {
    /** 按给定上限返回最近打开的文件夹（最近在前）。limit 至少为 1。 */
    displayFolders: (state) => (limit: number): RecentFolder[] =>
      state.folders.slice(0, Math.max(1, Math.floor(limit) || 1)),
  },

  actions: {
    async load() {
      try {
        this.folders = await getRecentFolders();
      } catch (error) {
        console.error('[RecentFolders] 加载历史失败:', error);
        this.folders = [];
      }
      this.isLoaded = true;
    },

    async add(path: string, name: string) {
      const existingIndex = this.folders.findIndex((folder) => folder.path === path);
      if (existingIndex !== -1) {
        const [existing] = this.folders.splice(existingIndex, 1);
        existing.lastOpened = Date.now();
        this.folders.unshift(existing);
      } else {
        this.folders.unshift({ path, name, lastOpened: Date.now() });
      }
      try {
        await persistAddRecentFolder(path, name);
      } catch (error) {
        console.error('[RecentFolders] 持久化历史失败:', error);
      }
    },

    async clear() {
      this.folders = [];
      try {
        await persistClearRecentFolders();
      } catch (error) {
        console.error('[RecentFolders] 清除历史失败:', error);
      }
    },
  },
});
