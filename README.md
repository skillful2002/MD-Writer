<p align="center">
  <img src="./public/icon.png" width="160" alt="MD Writer Logo" />
</p>

<h1 align="center">MD Writer</h1>

<p align="center">
  <strong>A local-first Markdown editor built with Tauri 2, a Rust domain core, and TipTap.</strong>
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

## Overview

**MD Writer** is a cross-platform, local-first Markdown editor. It combines Tauri 2's native desktop boundaries, a Rust domain core, and a TipTap WYSIWYG editor to deliver a stable, fast, and extensible writing experience. All documents, images, and workspaces stay on your machine — nothing is uploaded to the cloud.

> Current version: **1.0.0**

## Features

- **WYSIWYG editing**: powered by TipTap / ProseMirror, with editable rendered blocks for code, tables, math, Mermaid diagrams, callouts, and more — no constant switching between source and preview.
- **Local-first**: documents, images, and workspaces stay on your machine. Pasted or dropped images are saved into a `.images/` folder next to the document and referenced by relative path.
- **Recent files & folders**: reopen recent documents and folders from the sidebar or menu, with a configurable history length.
- **Source / editor dual mode**: switching modes preserves the cursor line, and the editor shows source line numbers for precise verification.
- **Table enhancements**: add/remove columns and rows inside cells, toggle the header row; switching a code block's language places the cursor on the first content line.
- **Unified title bar**: panel toggles are folded into a custom title bar, the outline panel moves to the right of the editor, and the dark theme is fully honored.
- **Desktop-native experience**: multi-window editing, persisted window state, native menus, and system printing.
- **Structured workspaces**: Rust handles directory filtering, watcher aggregation, external change events, and save-conflict detection.
- **Export**: WeChat-formatted and HTML export — the frontend renders export-ready content while the native layer handles printing and file writes.

## Architecture

MD Writer uses three clear layers:

- **Vue 3 + Pinia + TipTap**: UI, editor interactions, and command dispatch.
- **Tauri 2**: plugins, permission boundaries, and the command/event bridge.
- **Rust domain core**: document, workspace, window runtime, and watcher consistency.

Conventions:

- Frontend business logic does not call `invoke`, `listen`, or `emit` directly.
- Public Rust commands return structured DTOs and `AppError`.
- Common desktop capabilities should use official Tauri plugins first.

## Tech Stack

- Desktop framework: Tauri 2
- Native core: Rust
- Frontend: Vue 3 + TypeScript + Pinia + Vite
- Editor: TipTap / ProseMirror
- Markdown: markdown-it + custom parser / serializer
- Styling: Tailwind CSS
- Native plugins: store / window-state / dialog / opener / cli

## Getting Started

```bash
# The package manager has moved to bun; if bun is not installed locally, replace the bun commands below with npm
bun install
bun run dev          # frontend only
bun run dev:tauri    # frontend + desktop
bun run build
bun run build:tauri
bun run test
cargo check --manifest-path src-tauri/Cargo.toml
```

## Documentation

More design and development conventions live in the `docs/` directory:

- [Architecture](./docs/ARCHITECTURE.md): system layering, runtime topology, domain boundaries, and evolution constraints.
- [Engineering standards](./docs/ENGINEERING_STANDARDS.md): Tauri, Rust, Vue, events, docs, and review constraints.
- [Roadmap](./docs/ROADMAP.md): current stage, completed capabilities, and next steps.
- [License notes](./docs/LICENSE_NOTES.md): a brief note on the Apache 2.0 license.
- [Semantic editor model](./docs/SEMANTIC_EDITOR_MODEL.md): invariants and migration direction for the editor document model.

## License

MD Writer is open source under the [Apache License 2.0](LICENSE).
