#!/usr/bin/env node
// build-exe.mjs — single release folder, no portable duplication
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const RELEASE = join(ROOT, 'release');

function log(m) { console.log(`[build-exe] ${m}`); }
function run(cmd, args, opts = {}) {
  log(`$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, ...opts });
  return r.status;
}

// 1. Kill stale BusinessDesk/electron (frees app.asar lock without needing temp folder)
for (const name of ['BusinessDesk.exe', 'electron.exe']) {
  spawnSync('taskkill', ['/F', '/IM', name], { stdio: 'ignore', shell: true });
}
await new Promise(r => setTimeout(r, 800));

// 2. Clean release (single folder) — retry if locked, do not create release2/temp
if (existsSync(RELEASE)) {
  // Try normal rm, if locked wait and retry once
  try {
    rmSync(RELEASE, { recursive: true, force: true, maxRetries: 2, retryDelay: 300 });
  } catch {}
  if (existsSync(join(RELEASE, 'win-unpacked', 'resources', 'app.asar'))) {
    // Still locked — likely Antigravity watcher. Wait a bit and force close handles via taskkill, then retry
    await new Promise(r => setTimeout(r, 1500));
    try { rmSync(RELEASE, { recursive: true, force: true }); } catch {}
    if (existsSync(RELEASE)) {
      console.warn('[build-exe] WARN: release still locked — close BusinessDesk.exe / restart IDE and retry `npm run exe`');
      console.warn('[build-exe] Attempting to continue anyway (electron-builder will overwrite)');
    } else {
      log('release cleaned after retry');
    }
  } else if (!existsSync(RELEASE)) {
    log('release cleaned');
  }
}

// 3. Build vite + electron
log('building vite + electron ...');
let code = run('npm', ['run', 'build:electron'], { cwd: ROOT });
if (code !== 0) process.exit(code);

// 4. Run electron-builder — single output: release
log(`running electron-builder → ${RELEASE}`);
const outArg = RELEASE.includes(' ') ? `"${RELEASE}"` : RELEASE;
const builderArgs = ['electron-builder', '--win', 'nsis', '--publish', 'never', `--config.directories.output=${outArg}`];
code = run('npx', ['--yes', ...builderArgs], {
  cwd: ROOT,
  env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' }
});

if (code !== 0) process.exit(code);

let version = '0.0.1';
try {
  const { readFileSync } = await import('node:fs');
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
  version = pkg.version || version;
} catch {}
const exeName = `BusinessDesk Setup ${version}.exe`;
const builtExe = join(RELEASE, exeName);
if (existsSync(builtExe)) {
  const { statSync } = await import('node:fs');
  const sz = statSync(builtExe).size;
  log(`✓ built ${builtExe} (${(sz/1024/1024).toFixed(1)} MB)`);
  log(`  Single release folder: ${RELEASE} — no release2 / portable duplication`);
} else {
  console.warn(`[build-exe] expected exe not found: ${builtExe}`);
  process.exit(1);
}
