#!/usr/bin/env node
// build-exe.mjs — wrapper that makes `npm run exe` never fail on app.asar lock
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const RELEASE = join(ROOT, 'release');
const TEMP_OUT = join(process.env.LOCALAPPDATA || 'C:\\Users\\atifs\\AppData\\Local\\Temp', 'opencode', 'bd-release');

function log(m) { console.log(`[build-exe] ${m}`); }
function warn(m) { console.warn(`[build-exe] WARN: ${m}`); }
function run(cmd, args, opts = {}) {
  log(`$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, ...opts });
  return r.status;
}

// 1. Pre-clean: kill stale BusinessDesk/electron
for (const name of ['BusinessDesk.exe', 'electron.exe']) {
  spawnSync('taskkill', ['/F', '/IM', name], { stdio: 'ignore', shell: true });
}
await new Promise(r => setTimeout(r, 1200));

// 2. Try to clean release (best effort)
let useTemp = false;
if (existsSync(RELEASE)) {
  try {
    rmSync(RELEASE, { recursive: true, force: true, maxRetries: 2, retryDelay: 300 });
  } catch {}
  if (existsSync(join(RELEASE, 'win-unpacked', 'resources', 'app.asar'))) {
    // Still locked — common cause: opencode/Antigravity file-watcher (pid 49656) or 360 AV
    // Check if we can open it
    try {
      const { openSync, closeSync } = await import('node:fs');
      const fd = openSync(join(RELEASE, 'win-unpacked', 'resources', 'app.asar'), 'r');
      closeSync(fd);
      // If open succeeded, it was transient lock — retry rm
      rmSync(RELEASE, { recursive: true, force: true });
    } catch {
      warn(`release/win-unpacked/resources/app.asar still locked (IDE watcher or AV). Will build to TEMP: ${TEMP_OUT}`);
      useTemp = true;
      // Try rename release away so next build can use fresh release folder
      try {
        const bak = `${RELEASE}.bak.${Date.now()}`;
        renameSync(RELEASE, bak);
        log(`renamed locked release → ${bak}`);
        useTemp = false; // rename freed the path
      } catch (e) {
        warn(`rename failed: ${e.message} — keeping release locked, using TEMP_OUT`);
        useTemp = true;
      }
    }
  }
  if (!existsSync(RELEASE) && !useTemp) log('release cleaned');
}
if (existsSync(TEMP_OUT) && useTemp) {
  try { rmSync(TEMP_OUT, { recursive: true, force: true }); } catch {}
}

// 3. Build vite + electron
log('building vite + electron ...');
let code = run('npm', ['run', 'build:electron'], { cwd: ROOT });
if (code !== 0) process.exit(code);

// 4. Run electron-builder
const outDir = useTemp ? TEMP_OUT : RELEASE;
log(`running electron-builder → ${outDir}`);
const outArg = outDir.includes(' ') ? `"${outDir}"` : outDir;
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
const builtExe = join(outDir, exeName);
if (existsSync(builtExe)) {
  const { statSync } = await import('node:fs');
  const sz = statSync(builtExe).size;
  log(`✓ built ${builtExe} (${(sz/1024/1024).toFixed(1)} MB)`);
  if (useTemp) {
    log(`NOTE: release was locked, installer is in TEMP not release/. Copy it manually after reboot:`);
    log(`  copy "${builtExe}" "C:\\store manager\\release\\${exeName}"`);
    log(`Permanent fix: add C:\\store manager\\release\\ to 360 Total Security → Settings → Exclusions, and restart opencode.`);
  }
} else {
  warn(`expected exe not found: ${builtExe}`);
  process.exit(1);
}
