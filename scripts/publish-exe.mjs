#!/usr/bin/env node
// publish-exe.mjs — builds and publishes to GitHub Releases (auto-fetches GH_TOKEN if needed)
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');

function log(m) { console.log(`[publish] ${m}`); }
function warn(m) { console.warn(`[publish] WARN: ${m}`); }

// 1. Ensure GH_TOKEN
let token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_PAT;
if (!token) {
  // Try to get from git credential manager (stored by `gh` / Antigravity IDE)
  try {
    const { spawnSync: sp } = await import('node:child_process');
    const input = 'protocol=https\nhost=github.com\n';
    const r = sp('git', ['credential', 'fill'], { input, encoding: 'utf-8', shell: true });
    const out = r.stdout || '';
    const m = out.match(/password=([^\r\n]+)/);
    if (m && m[1] && m[1].startsWith('gho_')) {
      token = m[1].trim();
      log('Found GH_TOKEN via git credential fill');
    }
  } catch {}
}
if (!token) {
  // Try credential-manager get directly
  try {
    const r = spawnSync('git-credential-manager.exe', ['get'], { input: 'protocol=https\nhost=github.com\n', encoding: 'utf-8', shell: true });
    const m = (r.stdout||'').match(/password=([^\r\n]+)/);
    if (m && m[1].startsWith('gho_')) token = m[1].trim();
  } catch {}
}
if (!token) {
  console.error(`
[publish] ERROR: GitHub Personal Access Token is not set.

For local builds WITHOUT publishing (no token needed), run:
  npm run exe

For publishing to https://github.com/Atifsayyed077/businessdesk/releases, set token:
  PowerShell: $env:GH_TOKEN="ghp_xxx" ; npm run exe:publish
  CMD:        set GH_TOKEN=ghp_xxx && npm run exe:publish

Create token: https://github.com/settings/tokens/new  scopes: repo
Or login via CLI:  gh auth login --web
`);
  process.exit(1);
}
process.env.GH_TOKEN = token;
process.env.GITHUB_TOKEN = token;
process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
log('GH_TOKEN found (***' + token.slice(-4) + ')');

// 2. Read version for log
let version = '0.0.0';
try {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
  version = pkg.version;
} catch {}
log(`Publishing v${version} to Atifsayyed077/businessdesk ...`);

// 3. Reuse build-exe logic but with --publish always and version-aware exe name
// Kill stale
for (const name of ['BusinessDesk.exe', 'electron.exe']) {
  spawnSync('taskkill', ['/F', '/IM', name], { stdio: 'ignore', shell: true });
}
await new Promise(r => setTimeout(r, 800));

// Clean release if locked? Delegate to build-exe's cleaning by calling it with publish flag
// Instead, run build:electron then electron-builder --publish always directly
function run(cmd, args, opts={}) {
  log(`$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, ...opts });
  return r.status;
}

let code = run('npm', ['run', 'build:electron'], { cwd: ROOT });
if (code !== 0) process.exit(code);

code = run('npx', ['--yes', 'electron-builder', '--win', 'nsis', '--publish', 'always'], {
  cwd: ROOT,
  env: { ...process.env }
});
if (code !== 0) {
  console.error(`[publish] electron-builder failed with code ${code}`);
  process.exit(code);
}

log(`✓ Published v${version} — check https://github.com/Atifsayyed077/businessdesk/releases/tag/v${version}`);
