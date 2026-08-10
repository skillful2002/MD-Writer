import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [vue()],

  // 关闭自动清空 dist: 在 WorkBuddy 的 sandbox 环境下, `vite build` 清空 outDir
  // (dist 旧文件 >50 个) 会被 safe-delete 批量删除护栏拦截, 导致前端构建失败、
  // 进而 tauri build 整体中断。dist 为 gitignored 的构建产物, 残留旧 hash 文件无害。
  build: {
    emptyOutDir: false,
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
