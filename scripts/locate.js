/**
 * Locate the node binary and the dsh CLI in a way that survives being
 * launched from Finder (double-click), where PATH is only
 * /usr/bin:/bin:/usr/sbin:/sbin and nvm/homebrew node are invisible.
 *
 * Pure CommonJS, no electron dependency — usable from main.js and from
 * plain-node test scripts.
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/** Prefer the newest file among candidates that exist. */
function newest(existing) {
  return existing.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || null;
}

/**
 * Resolve a node binary:
 *  1. DSH_NODE env
 *  2. `which node` (works when launched from a terminal)
 *  3. nvm installations (~/.nvm/versions/node — newest version first)
 *  4. common homebrew/system locations
 *  5. Electron's bundled node (process.execPath) as last resort — callers
 *     must set ELECTRON_RUN_AS_NODE=1 when spawning this one.
 */
function findNode() {
  if (process.env.DSH_NODE && fs.existsSync(process.env.DSH_NODE)) return process.env.DSH_NODE;
  try {
    const out = spawnSync('which', ['node'], { encoding: 'utf8' }).stdout?.trim();
    if (out && fs.existsSync(out)) return out;
  } catch {}
  const candidates = [];
  try {
    const nvmDir = path.join(os.homedir(), '.nvm', 'versions', 'node');
    if (fs.existsSync(nvmDir)) {
      for (const ver of fs.readdirSync(nvmDir)) {
        const bin = path.join(nvmDir, ver, 'bin', 'node');
        if (fs.existsSync(bin)) candidates.push(bin);
      }
    }
  } catch {}
  for (const cand of ['/opt/homebrew/bin/node', '/usr/local/bin/node', '/usr/bin/node']) {
    if (fs.existsSync(cand)) candidates.push(cand);
  }
  const hit = newest(candidates.filter((p) => fs.existsSync(p)));
  return hit || process.execPath;
}

/**
 * Resolve the dsh CLI entry (bin.js of @deepseek-ai/dsh):
 *  1. DSH_BIN env
 *  2. every npx checkout under ~/.npm/_npx (any hash dir) that contains
 *     node_modules/@deepseek-ai/dsh — newest by mtime wins, which survives
 *     npx re-installs that create new hash directories
 *  3. global installs (`npm prefix -g` plus common homebrew/system prefixes)
 */
function findDshBin() {
  const candidates = [];
  if (process.env.DSH_BIN && fs.existsSync(process.env.DSH_BIN)) candidates.push(process.env.DSH_BIN);
  try {
    const npxRoot = path.join(os.homedir(), '.npm', '_npx');
    if (fs.existsSync(npxRoot)) {
      for (const dir of fs.readdirSync(npxRoot)) {
        const bin = path.join(npxRoot, dir, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
        if (fs.existsSync(bin)) candidates.push(bin);
      }
    }
  } catch {}
  for (const prefix of [npmGlobalPrefix(), '/opt/homebrew', '/usr/local', '/usr']) {
    if (!prefix) continue;
    const bin = path.join(prefix, 'lib', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
    if (fs.existsSync(bin)) candidates.push(bin);
  }
  return newest(candidates.filter((p) => fs.existsSync(p))) || null;
}

/** `npm prefix -g` when npm is on PATH; null otherwise. */
function npmGlobalPrefix() {
  try {
    const out = spawnSync('npm', ['prefix', '-g'], { encoding: 'utf8' }).stdout?.trim();
    return out || null;
  } catch {
    return null;
  }
}

/**
 * Build the spawn command/env that launches `dsh web` on the port of the
 * target URL. Returns { command, args, env, usesElectronNode }.
 */
function buildDshSpawn(targetUrl) {
  const bin = findDshBin();
  const node = findNode();
  const port = new URL(targetUrl).port;

  const env = { ...process.env };
  // Finder-launched apps have a minimal PATH; put node's own bin dir first
  // so dsh (and its child tools) can find node/npm/npx and friends.
  const nodeDir = path.dirname(node);
  env.PATH = [nodeDir, process.env.PATH].filter(Boolean).join(':');

  const usesElectronNode = node === process.execPath;
  if (usesElectronNode) env.ELECTRON_RUN_AS_NODE = '1';

  if (bin) {
    return { command: node, args: [bin, 'web', '--port', port], env, usesElectronNode };
  }
  // Last resort: npx next to the resolved node.
  const npx = path.join(nodeDir, 'npx');
  return { command: npx, args: ['-y', '@deepseek-ai/dsh', 'web', '--port', port], env, usesElectronNode };
}

module.exports = { findNode, findDshBin, buildDshSpawn };
