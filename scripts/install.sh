#!/usr/bin/env bash
#
# dsh-desktop 一键安装脚本（macOS）
#
#   curl -fsSL https://raw.githubusercontent.com/yuhaohub/dsh-desktop/main/scripts/install.sh | sh
#
# 从 GitHub Releases 下载最新版安装包，校验 SHA-256 后安装
# "DeepSeek Harness Desktop.app" 到 /Applications（不可写时退回 ~/Applications）。
#
# 环境变量覆盖：
#   DSH_DESKTOP_REPO     GitHub 仓库，默认 yuhaohub/dsh-desktop
#   DSH_DESKTOP_VERSION  指定版本 tag（如 v0.1.0），默认最新版
#   DSH_DESKTOP_DEST     安装目录，默认 /Applications
#
set -euo pipefail

REPO="${DSH_DESKTOP_REPO:-yuhaohub/dsh-desktop}"
VERSION="${DSH_DESKTOP_VERSION:-}"
DEST="${DSH_DESKTOP_DEST:-/Applications}"

say() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mWarn:\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || die "当前仅支持 macOS（Windows / Linux 支持开发中）。"
case "$(uname -m)" in
  arm64) ARCH="arm64" ;;
  x86_64 | amd64) ARCH="x64" ;;
  *) die "不支持的 CPU 架构: $(uname -m)" ;;
esac

command -v curl >/dev/null 2>&1 || die "未找到 curl。"
command -v unzip >/dev/null 2>&1 || die "未找到 unzip。"

# --- 解析发布版本 ----------------------------------------------------------
if [ -z "$VERSION" ]; then
  say "查询 $REPO 的最新版本…"
  RELEASE_JSON="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest")" \
    || die "无法获取最新版本（请检查网络或仓库是否存在）。"
  VERSION="$(printf '%s' "$RELEASE_JSON" | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1 || true)"
  [ -n "$VERSION" ] || die "无法从 GitHub 解析最新版本号。"
else
  RELEASE_JSON="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/tags/$VERSION")" \
    || die "无法获取版本 $VERSION（请检查版本号是否正确）。"
fi
say "发现版本: $VERSION（架构: $ARCH）"

# --- 挑选安装包 ------------------------------------------------------------
ZIP_URL="$(printf '%s' "$RELEASE_JSON" | grep -o '"browser_download_url"[[:space:]]*:[[:space:]]*"[^"]*"' \
  | sed -E 's/.*"[[:space:]]*:[[:space:]]*"([^"]*)"/\1/' \
  | grep -E "\-${ARCH}\.zip$" | head -n1 || true)"
[ -n "$ZIP_URL" ] || die "该版本未找到 ${ARCH} 架构的 zip 安装包，请确认发布资产完整。"

ZIP_NAME="$(basename "$ZIP_URL")"
SUM_URL="$(dirname "$ZIP_URL")/SHA256SUMS"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

say "下载 $ZIP_NAME …"
curl -fsSL -o "$TMP/$ZIP_NAME" "$ZIP_URL" || die "下载失败。"

# --- 校验和（可选，缺失时仅警告）------------------------------------------
if curl -fsSL -o "$TMP/SHA256SUMS" "$SUM_URL" 2>/dev/null; then
  EXPECTED="$(grep -F "  $ZIP_NAME" "$TMP/SHA256SUMS" | awk '{print $1}')"
  if [ -n "$EXPECTED" ]; then
    ACTUAL="$(shasum -a 256 "$TMP/$ZIP_NAME" | awk '{print $1}')"
    if [ "$ACTUAL" != "$EXPECTED" ]; then
      die "校验和不匹配（下载可能损坏），请重试。期望 $EXPECTED，实际 $ACTUAL"
    fi
    say "校验和验证通过。"
  else
    warn "SHA256SUMS 中未找到 $ZIP_NAME 的条目，跳过校验。"
  fi
else
  warn "未找到 SHA256SUMS，跳过校验。"
fi

# --- 解压 ----------------------------------------------------------------
say "解压安装包…"
(cd "$TMP" && unzip -q "$ZIP_NAME") || die "解压失败，安装包可能已损坏。"
APP_DIR="$(find "$TMP" -maxdepth 2 -type d -name '*.app' | head -n1)"
[ -n "$APP_DIR" ] || die "安装包内未找到 .app。"

APP_NAME="$(basename "$APP_DIR")"
TARGET="$DEST/$APP_NAME"

# --- 安装 ----------------------------------------------------------------
if [ -d "$TARGET" ]; then
  say "移除旧版本 $TARGET"
  rm -rf "$TARGET"
fi
if ! mkdir -p "$DEST" 2>/dev/null || [ ! -w "$DEST" ]; then
  DEST="$HOME/Applications"
  TARGET="$DEST/$APP_NAME"
  say "$DEST 不可写，改为安装到 $TARGET"
  mkdir -p "$DEST"
fi
ditto "$APP_DIR" "$TARGET"

say "安装完成：$TARGET"
say ""
printf '  双击启动：%s\n' "$TARGET"
printf '  提示：首次启动会自动查找/拉取 dsh（需联网与 Node.js）；若已运行 dsh web 则直接挂接。\n'
printf '  若 macOS 提示「无法验证开发者」，请右键（或按住 Control 点击）图标 -> 打开。\n'
printf '  卸载：rm -rf "%s"\n' "$TARGET"
printf '  版本：%s（架构: %s）\n' "$VERSION" "$ARCH"
