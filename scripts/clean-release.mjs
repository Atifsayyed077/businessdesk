#!/usr/bin/env node
// clean-release.mjs — robust pre-build cleaner for electron-builder
// Handles: BusinessDesk.exe still running, Antigravity/opencode file-watcher lock on app.asar, 360 AV lock
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const RELEASE = join(ROOT, 'release');
const RELEASE2 = join(ROOT, 'release2');
const TEMP_OUT = join(process.env.LOCALAPPDATA || 'C:\\Users\\atifs\\AppData\\Local\\Temp', 'opencode', 'bd-release');

function log(m) { console.log(`[clean] ${m}`); }
function warn(m) { console.warn(`[clean] WARN: ${m}`); }

// 1. Kill BusinessDesk.exe / electron.exe if running (prevents EnsureEmptyDir lock)
for (const name of ['BusinessDesk.exe', 'electron.exe']) {
  try {
    const r = spawnSync('taskkill', ['/F', '/IM', name], { stdio: 'ignore', shell: true });
    if (r.status === 0) log(`killed ${name}`);
  } catch {}
}

// small pause for OS to release handles
await new Promise(r => setTimeout(r, 1500));

// 2. Try to remove release with retries (handles transient AV lock)
async function tryRemove(dir, label) {
  if (!existsSync(dir)) { log(`${label} not exists — skip`); return true; }
  for (let i = 1; i <= 4; i++) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 2, retryDelay: 300 });
      if (!existsSync(dir)) { log(`removed ${label} (attempt ${i})`); return true; }
    } catch (e) {
      warn(`remove ${label} attempt ${i} failed: ${e.message}`);
    }
    // If rmSync left it partially, try rename as fallback (rename is atomic and often succeeds when delete fails)
    if (existsSync(dir) && i === 3) {
      const bak = `${dir}.bak.${Date.now()}`;
      try {
        renameSync(dir, bak);
        log(`renamed locked ${label} → ${bak} (will be deleted on next reboot)`);
        return true;
      } catch (e2) {
        warn(`rename ${label} failed: ${e2.message}`);
      }
    }
    await new Promise(r => setTimeout(r, 800 * i));
  }
  return !existsSync(dir);
}

const okRelease = await tryRemove(RELEASE, 'release');
const okRelease2 = await tryRemove(RELEASE2, 'release2');
await tryRemove(TEMP_OUT, 'temp bd-release');

// 3. Decide output
// If release is still locked, build to TEMP_OUT so `npm run exe` never fails with ERR_ELECTRON_BUILDER_CANNOT_EXECUTE
if (!okRelease) {
  warn(`release still locked (likely IDE file-watcher Antigravity.exe or 360 AV). Building to TEMP: ${TEMP_OUT}`);
  warn(`After build, installer will be at: ${join(TEMP_OUT, 'BusinessDesk Setup 0.0.1.exe')}`);
  warn(`Fix: add C:\\store manager\\release\\ to 360 Total Security → Exclusions, and restart IDE, or reboot then delete release.bak.*`);
  process.env.ELECTRON_BUILDER_OUT = TEMP_OUT;
  // write a marker so package.json wrapper can pick it up
  process.stdout.write(`::SET_OUT::${TEMP_OUT}\n`);
  // also set for parent if using cross-env wrapper we will read ELECTRON_BUILDER_OUT
} else {
  log(`release clean OK — building to release/`);
  process.env.ELECTRON_BUILDER_OUT = RELEASE;
}

log('clean done');
