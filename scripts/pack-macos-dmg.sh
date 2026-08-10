#!/usr/bin/env bash
# 在 macOS 上打包 MarkdownEd 的 dmg 安装包。
#
# 背景: 当构建环境(如 IDE 内置终端/无 GUI 的 shell)没有「控制 Finder」的
# 自动化权限时, `tauri build` 会在 dmg 美化步骤调用 osascript 失败
# (错误 -10004 "权限违例"), 导致整个打包中断、拿不到 dmg。
#
# 本脚本策略:
#   1. 先正常跑 `tauri build`; 若成功(说明已有 Finder 权限)则直接结束。
#   2. 若失败, 且失败发生在打包阶段(已生成 bundle_dmg.sh 与 .app),
#      则改用 create-dmg 的 --skip-jenkins 跳过 Finder 美化, 仅重新生成 dmg。
#      跳过的仅是"打开 dmg 后图标自动排版/背景图"等装饰效果, 不影响安装功能。
#
# 用法: bash scripts/pack-macos-dmg.sh   (或 npm run pack:mac)
set -u

cd "$(dirname "$0")/.." || exit 1
ROOT="$(pwd)"

if npm run build:tauri; then
  echo "✅ tauri build 完成(dmg 已生成, 含 Finder 窗口美化)"
  exit 0
fi

echo "⚠️  tauri build 失败, 尝试用 --skip-jenkins 仅重新生成 dmg ..."
BUNDLE="$ROOT/src-tauri/target/release/bundle"
SCRIPT="$BUNDLE/dmg/bundle_dmg.sh"
APP_DIR="$BUNDLE/macos"

if [ ! -f "$SCRIPT" ]; then
  echo "❌ 未找到 $SCRIPT —— 说明失败发生在打包之前(很可能是类型检查或 Rust 编译错误), 请查看上方日志后修复再试。"
  exit 1
fi

VERSION="$(node -p "require('./package.json').version")"
DMG="$BUNDLE/dmg/MarkdownEd_${VERSION}_aarch64.dmg"

# 清理上次失败遗留的读写临时 dmg
find "$BUNDLE/dmg" "$BUNDLE/macos" -maxdepth 1 -name 'rw.*.dmg' -delete 2>/dev/null

# 注意: create-dmg 的 flag 必须放在位置参数(输出dmg路径、源文件夹)之前
bash "$SCRIPT" \
  --volname MarkdownEd --icon-size 128 --app-drop-link 180 170 --skip-jenkins \
  "$DMG" "$APP_DIR"

echo "✅ dmg 已生成: $DMG"
