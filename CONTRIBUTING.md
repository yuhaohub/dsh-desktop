# 贡献指南

欢迎贡献！无论是 bug 修复、文档、还是新平台支持。

## 环境

- macOS（当前仅 macOS 目标）
- Node.js ≥ 20，npm

## 开发

```sh
npm ci
npm start          # 生成图标并启动应用
```

改动 `main.js` 或 `scripts/` 后，重启应用验证。

## 提交前检查

```sh
node --check main.js && node --check scripts/locate.js   # 语法
bash -n scripts/install.sh                               # 安装脚本语法
npm run dist                                             # 确认能完整打包
```

- 不要提交 `dist/`、`node_modules/`、`assets/*.png`（构建产物，见 `.gitignore`）。
- 图标源文件是 `assets/dsh-icon.svg`，PNG 由 `npm run icon` 生成，不要手工改 PNG。

## 发版（维护者）

1. 更新 `package.json` 的 `version`（与 tag 一致，如 `0.1.0`）。
2. 打 tag 并推送，CI 会自动构建、发布到 GitHub Releases：

```sh
git tag v0.1.0
git push origin v0.1.0
```

3. 到 Releases 页确认两个架构的 dmg/zip 与 SHA256SUMS 都已上传。
