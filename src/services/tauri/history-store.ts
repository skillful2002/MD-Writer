import { LazyStore } from '@tauri-apps/plugin-store';

const HISTORY_STORE_PATH = 'history.json';
const RECENT_FOLDERS_KEY = 'recentFolders';
const MAX_RECENT_FOLDERS = 50;

export interface RecentFolder {
  path: string;
  name: string;
  lastOpened: number;
}

const historyStore = new LazyStore(HISTORY_STORE_PATH, {
  defaults: {},
  autoSave: false,
});

export async function getRecentFolders(): Promise<RecentFolder[]> {
  const list = await historyStore.get<RecentFolder[]>(RECENT_FOLDERS_KEY);
  if (!Array.isArray(list)) {
    return [];
  }
  return list.filter(
    (item): item is RecentFolder =>
      item != null &&
      typeof item.path === 'string' &&
      typeof item.name === 'string' &&
      typeof item.lastOpened === 'number',
  );
}

export async function addRecentFolder(path: string, name: string): Promise<void> {
  const list = await getRecentFolders();
  const filtered = list.filter((item) => item.path !== path);
  filtered.unshift({ path, name, lastOpened: Date.now() });
  const trimmed = filtered.slice(0, MAX_RECENT_FOLDERS);
  await historyStore.set(RECENT_FOLDERS_KEY, trimmed);
  await historyStore.save();
}

export async function clearRecentFolders(): Promise<void> {
  await historyStore.set(RECENT_FOLDERS_KEY, []);
  await historyStore.save();
}
