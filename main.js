/**
 * dsh-desktop — Electron shell for DeepSeek Harness.
 *
 * Responsibilities:
 * - locate the `dsh` CLI and `node` robustly (env overrides first, then nvm /
 *   homebrew node and the npx checkout under ~/.npm/_npx — works even when
 *   double-clicked from Finder with a minimal PATH);
 * - attach to an already-running DSH instance on the target URL, otherwise
 *   spawn `dsh web` (on the target URL's port) and wait for it to serve;
 * - host the web app in a frameless-ish window with tray support
 *   (close hides to tray; tray "退出" / Cmd+Q quits and stops the spawned
 *   dsh process — an externally attached instance is never killed);
 * - stream the spawned dsh stdout/stderr to <logs>/dsh-web.log and keep a
 *   small launcher log at <logs>/dsh-desktop.log.
 *
 * Env overrides:
 *   DSH_URL  — web app URL (default http://127.0.0.1:3080)
 *   DSH_BIN  — absolute path to the dsh CLI entry
 *   DSH_NODE — absolute path to a node binary used to run dsh
 */
const { app, BrowserWindow, Tray, Menu, dialog, nativeImage, shell } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { findNode, findDshBin, buildDshSpawn } = require('./scripts/locate.js');

const DSH_URL = process.env.DSH_URL || 'http://127.0.0.1:3080';

let mainWindow = null;
let tray = null;
let splash = null;
let dshChild = null; // only set when WE spawned dsh (externally attached instance untouched)
let quitting = false;

function logPath(name) {
  try {
    fs.mkdirSync(app.getPath('logs'), { recursive: true });
  } catch {}
  return path.join(app.getPath('logs'), name);
}

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}`;
  console.log(line);
  try {
    fs.appendFileSync(logPath('dsh-desktop.log'), line + '\n');
  } catch {}
}

function isDshPage(body) {
  return body.includes('__DSH_BOOT__') || body.includes('DeepSeek Harness');
}

async function probe(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const text = await res.text();
    return isDshPage(text);
  } catch {
    return false;
  }
}

async function waitForServer(url, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await probe(url)) return true;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

function startDsh() {
  const { command, args, env } = buildDshSpawn(DSH_URL);
  log(`spawning: ${command} ${args.join(' ')}`);
  dshChild = spawn(command, args, {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stream = fs.createWriteStream(logPath('dsh-web.log'), { flags: 'a' });
  dshChild.stdout?.pipe(stream);
  dshChild.stderr?.pipe(stream);
  dshChild.on('exit', (code, signal) => {
    log(`dsh web exited code=${code} signal=${signal}`);
    const wasOurs = dshChild;
    dshChild = null;
    if (!quitting && wasOurs && code !== 0) {
      dialog.showErrorBox(
        'DeepSeek Harness Desktop',
        `dsh web 进程异常退出（code ${code}）。日志：\n${logPath('dsh-web.log')}`,
      );
    }
  });
  dshChild.on('error', (error) => {
    log(`spawn error: ${error.message}`);
    if (!quitting) {
      dialog.showErrorBox('DeepSeek Harness Desktop', `无法启动 dsh：${error.message}`);
    }
  });
}

/** Ensure a DSH instance is reachable: attach to a live one or spawn ours. */
async function ensureServer(setStatus = () => {}) {
  if (await probe(DSH_URL)) {
    log(`attached to existing DSH instance at ${DSH_URL}`);
    setStatus('已连接现有 DSH 实例');
    return true;
  }
  log(`no DSH instance at ${DSH_URL}, spawning dsh web`);
  setStatus('正在启动 dsh web…\n首次运行需要联网下载，请稍候');
  startDsh();
  const ok = await waitForServer(DSH_URL);
  if (!ok) {
    dialog.showErrorBox(
      'DeepSeek Harness Desktop',
      `等待 ${DSH_URL} 超时，dsh web 未能就绪。\n\n请确认：\n` +
        '1. 已安装 Node.js（https://nodejs.org）且可以联网（首次运行会通过 npx 拉取 dsh）；\n' +
        '2. 或本机已通过 npx 安装过 @deepseek-ai/dsh。\n\n' +
        `日志：${logPath('dsh-web.log')}`,
    );
  }
  return ok;
}

/** Small frameless splash window shown while dsh boots (better first-run UX). */
function createSplash() {
  let iconDataUrl = '';
  try {
    const iconPath = path.join(__dirname, 'assets', 'icon.png');
    if (fs.existsSync(iconPath)) {
      iconDataUrl = 'data:image/png;base64,' + fs.readFileSync(iconPath).toString('base64');
    }
  } catch {}
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; height: 100%; background: #0f111e; color: #e6e9ff;
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; }
  .logo { width: 88px; height: 88px; border-radius: 20px; box-shadow: 0 8px 30px rgba(0,0,0,.45); }
  .title { font-size: 17px; font-weight: 600; }
  .status { font-size: 12.5px; opacity: .62; text-align: center; padding: 0 28px;
    line-height: 1.6; white-space: pre-line; }
  .spinner { width: 18px; height: 18px; border: 2px solid rgba(255,255,255,.18);
    border-top-color: #7aa2ff; border-radius: 50%; animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style></head><body>
  ${iconDataUrl ? `<img class="logo" src="${iconDataUrl}">` : '<div class="spinner"></div>'}
  <div class="title">DeepSeek Harness</div>
  <div class="status" id="status">正在启动…</div>
  <div class="spinner"></div>
</body></html>`;
  const win = new BrowserWindow({
    width: 340,
    height: 400,
    frame: false,
    resizable: false,
    show: false,
    backgroundColor: '#0f111e',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  win.once('ready-to-show', () => win.show());
  win.setStatus = (text) => {
    win.webContents
      .executeJavaScript(`document.getElementById('status').textContent = ${JSON.stringify(text)}`)
      .catch(() => {});
  };
  return win;
}

function showWindow() {
  if (mainWindow === null) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 940,
    minHeight: 600,
    title: 'DeepSeek Harness',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    autoHideMenuBar: true,
    backgroundColor: '#0f111e',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadURL(DSH_URL);

  // External links open in the system browser, not inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(DSH_URL)) return;
    event.preventDefault();
    shell.openExternal(url);
  });

  mainWindow.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    mainWindow.hide();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  // Note: in Electron 33 setTemplateImage() returns void — do NOT reassign.
  // The "Template" filename suffix also makes macOS treat it as a template
  // image automatically.
  let icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'trayTemplate.png'));
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('DeepSeek Harness');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开 DeepSeek Harness', click: showWindow },
      { type: 'separator' },
      { label: '退出', click: quit },
    ]),
  );
  tray.on('click', showWindow);
}

function quit() {
  quitting = true;
  if (dshChild && dshChild.exitCode === null) {
    log('stopping spawned dsh web');
    dshChild.kill('SIGTERM');
    // hard-kill if it lingers
    setTimeout(() => {
      if (dshChild && dshChild.exitCode === null) dshChild.kill('SIGKILL');
    }, 5000).unref();
  }
  app.quit();
}

app.whenReady().then(async () => {
  if (process.platform === 'darwin') {
    app.dock.setIcon(path.join(__dirname, 'assets', 'icon.png'));
  }
  splash = createSplash();
  splash.setStatus('正在定位 dsh…');
  const ok = await ensureServer((text) => splash?.setStatus(text));
  splash.destroy();
  splash = null;
  if (!ok) {
    app.quit();
    return;
  }
  createWindow();
  createTray();
  app.on('activate', showWindow); // macOS dock click
});

// Keep running in the tray when the window closes (any platform).
app.on('window-all-closed', () => {});

app.on('before-quit', () => {
  quitting = true;
});
