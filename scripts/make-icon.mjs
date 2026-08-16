/**
 * Generate app/tray icons from the official DeepSeek Harness favicon
 * (assets/dsh-icon.svg — the DSH whale mark, copied from the
 * @deepseek-ai/dsh-web-frontend package).
 *
 * Rasterization runs in a hidden Electron window
 * (scripts/rasterize-icon.mjs) so no image library is required — the only
 * devDependency used is Electron itself.
 *
 * Outputs:
 *   assets/icon.png            1024x1024 app icon (dark rounded square + whale)
 *   assets/trayTemplate.png    32x32    macOS template tray icon
 *   assets/trayTemplate@2x.png 64x64    retina variant of the tray icon
 */
import { existsSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svgPath = join(root, 'assets', 'dsh-icon.svg');

// If the source is missing, pull the official favicon from any installed
// @deepseek-ai/dsh-web-frontend package (scans the npx cache under ~/.npm).
if (!existsSync(svgPath)) {
  const npxRoot = join(homedir(), '.npm', '_npx');
  const found = [];
  if (existsSync(npxRoot)) {
    for (const dir of readdirSync(npxRoot)) {
      const p = join(npxRoot, dir, 'node_modules', '@deepseek-ai', 'dsh-web-frontend', 'dist', 'favicon.svg');
      if (existsSync(p)) found.push(p);
    }
  }
  const src = found.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
  if (!src) {
    console.error('dsh-icon.svg missing and no @deepseek-ai/dsh-web-frontend package found.');
    process.exit(1);
  }
  copyFileSync(src, svgPath);
  console.log(`copied official DSH favicon -> ${svgPath}`);
}

// In plain Node, require('electron') resolves to the electron binary path.
const electron = require('electron');
const result = spawnSync(electron, [join(root, 'scripts', 'rasterize-icon.mjs')], {
  stdio: 'inherit',
  env: process.env,
});
process.exit(result.status ?? 1);
