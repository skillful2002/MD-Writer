<p align="center">
  <img src="./public/icon.png" width="160" alt="MD Writer Logo" />
</p>

<h1 align="center">MD Writer</h1>

<p align="center">
  <strong>本地优先的 Markdown 编辑器 · 基于 Tauri 2、Rust 领域内核与 TipTap</strong>
</p>

<p align="center">
  <a href="./README.md">English</a>
  ·
  <a href="./README.zh-CN.md">简体中文</a>
  ·
  <a href="./README.ja-JP.md">日本語</a>
  ·
  <a href="./README.ko-KR.md">한국어</a>
</p>

<p align="center">
  <a href="https://github.com/skillful2002/MD-Writer/releases">
    <img src="https://img.shields.io/github/v/release/skillful2002/MD-Writer?style=flat-square&color=blue" alt="Version" />
  </a>
  <a href="https://gitee.com/liuzhengguo/MD-Writer">
    <img src="https://img.shields.io/badge/Gitee-liuzhengguo-red?style=flat-square&logo=gitee" alt="Gitee" />
  </a>
  <a href="https://github.com/skillful2002/MD-Writer/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/License-Apache--2.0-green?style=flat-square" alt="Apache-2.0" />
  </a>
</p>

## 项目简介

**MD Writer**是一款跨平台、本地优先的 Markdown 编辑器。它用 Tauri 2 的桌面原生边界、Rust 领域内核与 TipTap 所见即所得编辑器，提供稳定、快速、可扩展的写作体验。所有文档、图片与工作区数据都保存在你自己的机器上，不上传云端。

> 当前版本：**1.2.0**

## 核心特性

- **所见即所得编辑**：基于 TipTap / ProseMirror，代码块、表格、数学公式、Mermaid 图表、Callout 等都在渲染态直接编辑，无需在源码与预览之间反复切换。
- **本地优先**：文档、图片与工作区全部留在本地；粘贴或拖拽的图片自动保存到文档同级的 `.images/` 目录，使用相对路径引用。
- **最近打开**：侧栏与菜单一键访问近期文档与文件夹，并支持配置显示条数。
- **源码 / 编辑双模式**：两种模式切换时保持光标所在行，编辑器带源码行号，方便精确核对 Markdown 原文。
- **表格增强**：单元格内可增删行列、切换表头；代码块切换语言后光标自动定位到内容首行。
- **统一标题栏**：面板切换收口到自定义标题栏，大纲面板移至编辑区右侧，深色主题全面跟随。
- **三栏宽度可拖动**：文件区、编辑区、大纲区之间的两条分割线可拖动调整宽度并记住设置，编辑区始终保留至少一半窗口宽度。
- **多窗口桌面体验**：支持新窗口打开文档、窗口状态持久化、原生菜单与系统打印。
- **结构化工作区**：Rust 负责目录过滤、文件监听聚合、外部变更事件与保存冲突检测。
- **导出能力**：微信排版与 HTML 导出，前端渲染导出内容，原生侧负责打印与文件写入。

## 技术架构

MD Writer 采用清晰的三层边界：

- **Vue 3 + Pinia + TipTap**：UI、编辑器交互与命令分发。
- **Tauri 2**：插件、权限边界与命令 / 事件桥接。
- **Rust 领域内核**：文档、工作区、窗口运行时与文件监听一致性。

约定约束：

- 前端业务层不直接调用 `invoke` / `listen` / `emit`。
- Rust 对外命令统一返回结构化 DTO 与 `AppError`。
- 通用桌面能力优先使用官方 Tauri 插件。

## 技术栈

- 桌面框架：Tauri 2
- 原生内核：Rust
- 前端：Vue 3 + TypeScript + Pinia + Vite
- 编辑器：TipTap / ProseMirror
- Markdown：markdown-it + 自定义 parser / serializer
- 样式：Tailwind CSS
- 原生插件：store / window-state / dialog / opener / cli

## 快速开始

```bash
# 包管理器已迁移到 bun；若本地未安装 bun，可将下方 bun 命令替换为 npm
bun install
bun run dev          # 仅启动前端
bun run dev:tauri    # 前端 + 桌面端
bun run build
bun run build:tauri
bun run test
cargo check --manifest-path src-tauri/Cargo.toml
```

## 文档

更完整的设计与开发约定见 `docs/` 目录：

- [架构说明](./docs/ARCHITECTURE.md)：系统分层、运行时拓扑、领域边界和演进约束。
- [工程标准](./docs/ENGINEERING_STANDARDS.md)：Tauri、Rust、Vue、事件、文档和 Review 约束。
- [路线图](./docs/ROADMAP.md)：当前阶段、已完成能力和后续计划。
- [许可证说明](./docs/LICENSE_NOTES.md)：Apache 2.0 许可的简要说明。
- [语义编辑模型](./docs/SEMANTIC_EDITOR_MODEL.md)：编辑器文档模型重构的不变量和迁移方向。

## 许可证

MD Writer 基于 [Apache License 2.0](LICENSE) 开源。
