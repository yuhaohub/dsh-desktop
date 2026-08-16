/**
 * Electron main process used by make-icon.mjs: rasterizes assets/dsh-icon.svg
 * (the official DeepSeek Harness whale mark) into PNG icons using a hidden
 * offscreen BrowserWindow + canvas rendering. No image library required.
 *
 * Canvas (not capturePage) is used so transparency is preserved in the PNG.
 *
 * Outputs (same dir as this repo's assets/):
 *   icon.png            1024x1024 app icon (dark rounded square + white whale)
 *   trayTemplate.png    32x32    macOS template tray icon (black whale)
 *   trayTemplate@2x.png 64x64    retina variant of the tray icon
 */
import { app, BrowserWindow } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'assets', 'dsh-icon.svg'), 'utf8');

// The favicon's <style> block flips the whale to white under
// prefers-color-scheme: dark. For deterministic output we drop that block
// and set the fill explicitly per output.
const clean = svg.replace(/<style>[\s\S]*?<\/style>/s, '');
const whale = (fill) => clean.replace('fill="#000"', `fill="${fill}"`);

const pageHtml = (svgMarkup) => `<!doctype html>
<html><head><meta charset="utf-8"><style>html, body { margin: 0; padding: 0; background: transparent; }</style>
</head><body><div id="mark">${svgMarkup}</div></body></html>`;

/**
 * Render one icon in a hidden window:
 *  - draw a rounded rect + vertical gradient (app icon) or nothing (tray),
 *  - stamp the whale mark on top,
 *  - return a PNG buffer via canvas.toDataURL (preserves alpha).
 */
async function render(win, { svgMarkup, size, rounded }) {
  const svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgMarkup);
  const script = `(async () => {
    const size = ${size};
    const rounded = ${rounded};
    const markSize = Math.round(size * (${rounded ? 0.55 : 0.75}));
    const img = new Image();
    img.src = ${JSON.stringify(svgDataUrl)};
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (rounded) {
      const r = Math.round(size * 0.185);
      const g = ctx.createLinearGradient(0, 0, 0, size);
      g.addColorStop(0, '#22243C');
      g.addColorStop(1, '#0F111E');
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.arcTo(size, 0, size, size, r);
      ctx.arcTo(size, size, 0, size, r);
      ctx.arcTo(0, size, 0, 0, r);
      ctx.arcTo(0, 0, size, 0, r);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
    }
    const s = markSize / img.naturalWidth;
    const dw = img.naturalWidth * s;
    const dh = img.naturalHeight * s;
    ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
    return canvas.toDataURL('image/png');
  })()`;
  const dataUrl = await win.webContents.executeJavaScript(script, true);
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Buffer.from(b64, 'base64');
}

app.disableHardwareAcceleration();
app
  .whenReady()
  .then(async () => {
    const jobs = [
      { out: join(root, 'assets', 'icon.png'), svgMarkup: whale('#ffffff'), size: 1024, rounded: true },
      { out: join(root, 'assets', 'trayTemplate.png'), svgMarkup: whale('#000000'), size: 32, rounded: false },
      { out: join(root, 'assets', 'trayTemplate@2x.png'), svgMarkup: whale('#000000'), size: 64, rounded: false },
    ];

    const win = new BrowserWindow({
      width: 1024,
      height: 1024,
      show: false,
      webPreferences: {
        offscreen: true,
        backgroundThrottling: false,
      },
    });
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(pageHtml(whale('#000000'))));

    for (const job of jobs) {
      const png = await render(win, job);
      writeFileSync(job.out, png);
      console.log(`wrote ${job.out}`);
    }
    win.destroy();
    app.exit(0);
  })
  .catch((error) => {
    console.error('icon rasterization failed:', error);
    app.exit(1);
  });
