#!/usr/bin/env node
/**
 * Detached helper that performs the post-quit app swap for the lightweight
 * updater. Spawned by main.js (ELECTRON_RUN_AS_NODE=1, detached, unref'd)
 * right before app.quit(); it waits for the old process to exit, replaces
 * the .app bundle, then relaunches it via `open`.
 *
 *   Usage: apply-update.js <zipPath> <extractDir> <appBundlePath> <parentPid>
 *
 * Env: DSH_UPDATE_SKIP_RELAUNCH=1 — skip the final `open` (used in tests).
 */
'use strict';

const { spawnSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const [, , zipPath, extractDir, appBundlePath, parentPidArg] = process.argv;

function log(msg) {
  try {
    const dir = path.join(os.homedir(), 'Library', 'Logs', 'DeepSeek Harness Desktop');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'dsh-desktop-update.log'), `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed (${r.status}): ${(r.stderr || '').trim()}`);
  }
}

function relaunch() {
  if (process.env.DSH_UPDATE_SKIP_RELAUNCH === '1') return;
  spawn('open', [appBundlePath], { detached: true, stdio: 'ignore' }).unref();
}

/** Poll until the parent pid is gone (throws when kill(pid, 0) fails). */
function waitParentExit(pid, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      process.kill(pid, 0);
    } catch {
      return true;
    }
    spawnSync('sleep', ['0.5']);
  }
  return false;
}

try {
  const pid = parseInt(parentPidArg || '0', 10);
  log(`update: zip=${zipPath} app=${appBundlePath} parent=${pid}`);
  if (pid > 0 && !waitParentExit(pid)) {
    log('update: parent still alive after timeout, aborting');
    process.exit(1);
  }
  if (fs.existsSync(appBundlePath)) {
    fs.rmSync(appBundlePath, { recursive: true, force: true });
  }
  fs.mkdirSync(extractDir, { recursive: true });
  run('unzip', ['-q', zipPath, '-d', extractDir]);
  const appDir = fs.readdirSync(extractDir).find((d) => d.endsWith('.app'));
  if (!appDir) throw new Error('no .app found in downloaded archive');
  const src = path.join(extractDir, appDir);
  try {
    fs.renameSync(src, appBundlePath); // same-volume atomic move
  } catch {
    run('ditto', [src, appBundlePath]); // cross-volume fallback
  }
  log('update: swapped, relaunching');
  relaunch();
  fs.rmSync(zipPath, { force: true });
  fs.rmSync(extractDir, { recursive: true, force: true });
  log('update: done');
  process.exit(0);
} catch (e) {
  log(`update: FAILED ${e.message}`);
  // Best effort: relaunch whatever is at the target so the user is not left
  // without an app (the old bundle may still be intact).
  if (fs.existsSync(appBundlePath)) relaunch();
  process.exit(1);
}
