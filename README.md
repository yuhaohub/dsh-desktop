# dsh-desktop

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/yuhaohub/dsh-desktop?sort=semver)](https://github.com/yuhaohub/dsh-desktop/releases)
[![Platform](https://img.shields.io/badge/platform-macOS-arm64%20%7C%20x64-lightgrey.svg)](#)
[![CI](https://github.com/yuhaohub/dsh-desktop/actions/workflows/ci.yml/badge.svg)](https://github.com/yuhaohub/dsh-desktop/actions/workflows/ci.yml)

DeepSeek Harness 的桌面壳（Electron）：自动拉起（或挂接已运行的）`dsh web`，把 Web 界面放进独立窗口，带托盘图标，关窗最小化到托盘。**双击即可使用，无需手动起服务。**

## 一键安装（macOS）

```sh
curl -fsSL https://raw.githubusercontent.com/yuhaohub/dsh-desktop/main/scripts/install.sh | sh
```

脚本会从 [GitHub Releases](https://github.com/yuhaohub/dsh-desktop/releases) 下载最新版、校验 SHA-256、自动安装到 `/Applications`（不可写时退回 `~/Applications`）。装完去「应用程序」双击 **DeepSeek Harness Desktop** 即可。

> 没有终端？也可以直接在 Releases 页面下载对应架构的 `.zip` 或 `.dmg`。

**首次启动**：应用会自动查找本机的 `dsh`（npx 缓存或全局安装）；找不到时会通过 `npx` 联网拉取 `@deepseek-ai/dsh`，所以第一次启动需要联网并已安装 [Node.js](https://nodejs.org)，之后启动即秒开。若你已经在终端里跑着 `dsh web`，应用会直接挂接它，不会重复起进程。

> 若 macOS 提示「无法打开，因为无法验证开发者」（未签名应用），右键（或按住 Control 点击）图标 → **打开** 一次即可。

## 工作原理

- 如果 `http://127.0.0.1:3080` 已有 DSH 实例在跑（比如终端里手动起的 `dsh web`），直接挂接它，**不会**再起一个；
- 否则自动找 `dsh` CLI 并 spawn `dsh web --port 3080`，等端口就绪后打开窗口；
- 双击 .app 启动也有效：会扫描 nvm / Homebrew / 全局 npm 的 node 和 `~/.npm/_npx` 缓存里的 dsh（不依赖 shell PATH）；
- 关窗口 = 隐藏到托盘；托盘菜单「退出」或 `Cmd+Q` 才真正退出（会顺带停掉**自己拉起的** dsh 进程；外部实例不受影响）。

## 更新升级

**应用内自动检查（轻量版）**：每次启动 3 秒后自动对比 GitHub 最新 Release 与本机版本，发现新版会弹窗提示，点「下载并安装」即可一键下载（含 SHA-256 校验）→ 替换 → 自动重启。无需签名也能用。想关闭检查：设置环境变量 `DSH_DESKTOP_NO_UPDATE_CHECK=1` 再启动。

手动升级（等价于重装）：

```sh
curl -fsSL https://raw.githubusercontent.com/yuhaohub/dsh-desktop/main/scripts/install.sh | sh
```

**dsh 本体的升级**：桌面壳不捆绑 dsh——全新机器首次启动会通过 npx 自动拉取官方最新版 dsh（Web 界面同步最新）。若本机已有旧缓存想强制刷新：`npx -y @deepseek-ai/dsh@latest`。

## 配置（环境变量）

| 变量 | 默认 | 说明 |
|---|---|---|
| `DSH_URL` | `http://127.0.0.1:3080` | Web 应用地址（自动拉起的 dsh 会用其端口） |
| `DSH_BIN` | `~/.npm/_npx/*/.../dsh/lib/bin.js`（最新） | dsh CLI 入口（绝对路径） |
| `DSH_NODE` | `which node` → nvm → Homebrew → Electron 内置 | 跑 dsh 用的 node 二进制 |
| `DSH_DESKTOP_NO_UPDATE_CHECK` | 未设置 | 设为 `1` 可关闭启动时的自动更新检查 |

## 日志

- 启动日志：`~/Library/Logs/DeepSeek Harness Desktop/dsh-desktop.log`
- dsh web 输出：`~/Library/Logs/DeepSeek Harness Desktop/dsh-web.log`

## 从源码运行 / 打包

需要 Node.js ≥ 20。

```sh
npm ci          # 安装依赖（含 electron）
npm start       # 生成图标并启动
npm run dist    # 打包当前架构的 .zip + .dmg 到 dist/
npm run dist:arm64   # 只打 arm64
npm run dist:x64     # 只打 x64
```

产物在 `dist/`，例如 `dsh-desktop-0.1.0-arm64.dmg` / `dsh-desktop-0.1.0-arm64.zip`（x64 对应 `-x64`）。注意：图标（`assets/icon.png`、`assets/trayTemplate*.png`）是构建时用 Electron 从 `assets/dsh-icon.svg` 栅格化生成的，不提交仓库，`npm start` / `npm run dist` 会自动生成。

## 卸载

```sh
rm -rf "/Applications/DeepSeek Harness Desktop.app"
```

应用本身不安装 dsh，卸载后不影响你已有的 dsh。

## 路线图

- [x] macOS（arm64 / x64）
- [x] 应用内轻量更新检查（启动检测新版 → 一键下载替换）
- [ ] electron-updater 全自动静默升级（需要开发者签名/公证后）
- [ ] Windows / Linux

## 协议与致谢

- 本仓库**代码**采用 [MIT](LICENSE) 协议。
- 应用图标使用 DeepSeek Harness 官方鲸鱼标识（`assets/dsh-icon.svg`，取自 `@deepseek-ai/dsh-web-frontend` 的 favicon）。该图标的版权与商标归 **DeepSeek** 所有，**不属于**本仓库 MIT 协议授权的范围；本应用仅为 DeepSeek Harness 的桌面壳，与 DeepSeek 官方无隶属关系。
- 这是个通用 DSH 桌面壳，与 MCP 插件（dsh-mcp-client）无关——装了哪些插件由 web profile 决定。

---

**English**: A tiny Electron desktop shell for [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness). Install with the one-liner above, or grab the latest `.dmg`/`.zip` from [Releases](https://github.com/yuhaohub/dsh-desktop/releases). It attaches to a running `dsh web` or spawns one itself, then hosts the UI in a window with tray support. App icon is the official DeepSeek Harness whale mark (© DeepSeek, not covered by this repo's MIT license). Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).
