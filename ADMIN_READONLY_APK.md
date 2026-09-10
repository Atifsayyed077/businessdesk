# Admin Read-Only APK — BusinessDesk Viewer (PocketBase)

> **Goal:** A read-only Android APK for **admin/owner only** that connects to the **same PocketBase** (`VITE_PB_URL`) as the desktop app and allows **viewing/searching bills** (opening bills) — no create / edit / delete / SMS / print mutations.
>
> **Status:** Spec + implementation plan. Web code is already at `src/lib/pocketbase.ts:1` and `src/lib/utils.ts:372` — APK reuses it via Capacitor wrapper.

---

## 1. Why this exists

| Desktop (Electron) `C:\store manager\electron\main.ts:1` | APK (Admin Viewer) |
|---|---|
| Full CRUD: products, customers, billing, credit, SMS | **Read-only**: dashboard stats, bill list/detail, search, PDF view |
| Thermal print via `ipcMain.handle('print-thermal')` | No print / no SMS sending (or hidden behind `viewer` guard) |
| Runs on `http://127.0.0.1:8090` locally | Connects to **hosted / LAN PocketBase** (e.g. `http://192.168.1.50:8090` or `https://pb.yourdomain.com`) |

Use case: owner wants to check today's sales / pending bills / open any bill PDF from phone without risking accidental edits.

---

## 2. Architecture

```
[ PocketBase 0.40.x @ :8090 ]  ←→  [ Desktop Electron (full) ]  (http://127.0.0.1:8090)
            ↕ same collections, role-based rules
                              ←→  [ Admin Viewer APK ]  (Capacitor + Vite + React)
                                      • auth via users collection (role = viewer)
                                      • read-only API: getBills() getBill() getDashboardStats()
                                      • VITE_READONLY=true disables mutations
```

**APK fetches data exclusively via PocketBase JS SDK** `pocketbase@0.28.0` — identical to `src/lib/pocketbase.ts:1`:

```ts
import PocketBase from 'pocketbase';
const PB_URL = import.meta.env.VITE_PB_URL || 'http://127.0.0.1:8090';
export const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);
```

No local `sql.js` fallback, no Electron IPC. Pure HTTP.

---

## 3. PocketBase Data Contract

APK reads these existing collections (`pocketbase_schema.json:2`):

| Collection | Fields used (read) | APK needs |
|---|---|---|
| `products` | `name, sku, selling_price, stock` | Dashboard low-stock count only |
| `customers` | `name, mobile` | Ledger / filter (read) |
| `bills` | `bill_number, customer_name, customer_mobile, date, subtotal, labour_total, total, payment_status, paid_amount, remaining_amount, created` | **Core: list + detail** |
| `bill_items` | `bill, bill_id, product_name, quantity, unit_price, total` | Expanded per bill (`src/lib/utils.ts:393`) |
| `settings` | `key, value` | Shop name/logo if needed |
| `payments` | `bill, amount, payment_method, payment_date` | Credit view (read) |
| `users` | `email, role` | Auth (`src/context/AppContext.tsx:72`) |

Current rules in `pocketbase_schema.json:18` are `@request.auth.id != ''` for **all** ops. For read-only APK we tighten **write** ops by role.

### 3.1 Recommended PocketBase Role Setup

1. Add field `role` (text, default `admin`) to `users` auth collection (already described in `POCKETBASE_SETUP.md:75`).
2. Create a viewer account in Admin UI `_/` → `users` → New record:
   ```
   email: viewer@businessdesk.in
   password: <strong>
   role: viewer   // or admin_viewer
   name: Owner Viewer
   ```
3. Update collection API rules (Admin UI → Collections → Edit → API Rules):

   ```
   // products, customers, bills, bill_items, settings, payments
   listRule:  @request.auth.id != ""
   viewRule:  @request.auth.id != ""
   createRule: @request.auth.role = "admin"      // viewer blocked
   updateRule: @request.auth.role = "admin"
   deleteRule: @request.auth.role = "admin"
   ```

   Keep `listRule/viewRule` open to any authenticated user so `viewer` can read. This makes APK **server-enforced read-only** even if client is tampered.

   > Minimal change: if you don't want to touch rules yet, APK client-side guard is enough, but server rule is recommended for true admin-only safety.

4. For `users` collection itself, keep default auth rules — APK only does `authWithPassword` + `authRefresh` (`src/context/AppContext.tsx:39`).

---

## 4. What the APK Can / Cannot Do

### Allowed (Read-Only)
- Login with `viewer`/`admin` credentials (`src/pages/Login.tsx`)
- Dashboard stats: `getDashboardStats()` at `src/lib/utils.ts:488` — today sales, monthly sales, pending, low-stock (read-only KPIs)
- Bills History: search by `bill_number / customer_name / mobile`, filter `Paid|Pending`, view stats (`src/pages/BillsHistory.tsx:43`)
- Open Bill: `InvoicePreview` (`src/components/InvoicePreview.tsx`) and `ThermalBillPreview` (view only, no `print-thermal` IPC)
- Download / View PDF: `generateInvoicePDF` / `generateBillsPDF` (`src/lib/pdf.ts`) — client-side, allowed
- Customer ledger read: `getCustomerLedger()`, `getAllCreditCustomers()` — display only
- Pull-to-refresh, offline cache (optional)

### Blocked (Hidden / Disabled when `VITE_READONLY=true`)
- `createProduct / updateProduct / deleteProduct` (`src/lib/utils.ts:520`)
- `createCustomer / updateCustomer / deleteCustomer` (`src/lib/utils.ts:579`)
- `Billing` → create bill (`src/pages/Billing.tsx`)
- `BillsHistory → Mark as Paid` (`src/pages/BillsHistory.tsx:59`)
- `Bulk SMS Pending` (`src/lib/sms.ts`), `sendBillSms`, `PrinterSettings`, `Backup`, `Settings` writes, `SMS Center` send
- Any `pb.collection(...).create/update/delete` calls — guard at component level + early return

**UI pattern:**
```tsx
const isReadOnly = import.meta.env.VITE_READONLY === 'true';
if (isReadOnly) return <ReadOnlyBadge />; // hide Edit/Delete/Create buttons
```

---

## 5. Tech Stack Decision

| Choice | Why |
|---|---|
| **Capacitor 6** + Vite + React (reuse `src/`) | Reuse 100% of `src/lib/utils.ts`, `src/lib/pocketbase.ts`, `src/components/*`; smallest effort; web codebase already mobile-responsive via Tailwind |
| Alternative: Tauri Android / Expo / Flutter | More rewrite; not needed |

Capacitor wraps the **same** Vite build as a WebView and gives native APK + Play Store path.

---

## 6. Implementation Plan

### Phase 0 — PocketBase must be reachable from phone

`VITE_PB_URL=http://127.0.0.1:8090` works only on desktop. For APK:

- **LAN mode (quickest):** run PocketBase with `--http=0.0.0.0:8090` and use host LAN IP:
  ```
  pocketbase.exe serve --http=0.0.0.0:8090
  # then in APK env:
  VITE_PB_URL=http://192.168.1.25:8090
  ```
  Ensure Windows Firewall allows `8090/tcp`.

- **Hosted mode (recommended for owner remote access):** deploy PocketBase to VPS / Fly.io / Render / `pocketbase.io` hosting:
  ```
  VITE_PB_URL=https://pb.businessdesk.in
  ```
  Update `src/lib/pocketbase.ts:3` requires only env change, no code.

### Phase 1 — Add Read-Only env flag to web app

1. Create `.env.readonly`:
   ```
   VITE_PB_URL=https://pb.businessdesk.in
   VITE_READONLY=true
   VITE_APK_MODE=true
   VITE_APP_TITLE=BusinessDesk Viewer
   ```

2. In `src/App.tsx:22` add guard:
   ```ts
   const isReadOnly = import.meta.env.VITE_READONLY === 'true';
   // filter nav: hide billing/sales/credit/sms/backup/settings when isReadOnly
   type Page = isReadOnly ? 'dashboard'|'bills-history'|'customers'|'reports' : ...;
   ```

3. In `src/context/AppContext.tsx:72` restrict login to `role === 'viewer' || role === 'admin'` if `VITE_READONLY`.

4. In `src/components/Sidebar.tsx`, `src/pages/*` conditionally render `Create/Edit/Delete` buttons.

5. Test in browser: `npm run build && npx vite preview --host` with `VITE_READONLY=true` — verify no mutations possible.

### Phase 2 — Capacitor wrapper (new folder, no rewrite)

```bash
# in C:\store manager
npm i -D @capacitor/core @capacitor/cli @capacitor/android
npx cap init BusinessDeskViewer com.businessdesk.viewer --web-dir=dist

# 1. Build readonly web
npm run build   # with .env.readonly active (or cross-env)

# 2. Add Android
npx cap add android

# 3. Configure capacitor.config.ts
```

**`capacitor.config.ts` (create at project root):**
```ts
import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'com.businessdesk.viewer',
  appName: 'BusinessDesk Viewer',
  webDir: 'dist',
  server: {
    // empty for production bundle; for dev you can use:
    // url: 'http://192.168.1.25:5173', cleartext: true
  },
  android: {
    allowMixedContent: true, // allow http:// LAN PB
  }
};
export default config;
```

**`android/app/src/main/AndroidManifest.xml`** add if using `http://` LAN:
```xml
<application android:usesCleartextTraffic="true" ...>
```

### Phase 3 — Build APK

```bash
# 1. Build web readonly
cross-env VITE_READONLY=true VITE_PB_URL=https://pb.businessdesk.in npm run build

# 2. Sync to android
npx cap sync android

# 3a. Debug APK (quick test, no signing)
cd android && .\gradlew.bat assembleDebug
# → android\app\build\outputs\apk\debug\app-debug.apk

# 3b. Release APK (signed)
# Generate keystore once:
keytool -genkey -v -keystore viewer-release.keystore -alias viewer -keyalg RSA -keysize 2048 -validity 10000
# Put keystore at android/app/viewer-release.keystore and set android/app/build.gradle signingConfigs,
# or let Android Studio do it: npx cap open android → Build → Generate Signed APK
```

Install on device:
```bash
adb install android\app\build\outputs\apk\debug\app-debug.apk
```

### Phase 4 — Hardening & Distribution

- Set PocketBase rules as in §3.1 so `viewer` cannot write even if APK is tampered.
- In `vite.config.ts:5` keep `base: './'` — required for Capacitor file:// loading.
- Add app icon: `android/app/src/main/res/mipmap-*` or via `npx capacitor-assets`.
- Versioning: bump `package.json:4` version → triggers `capacitor.config.ts` + `android/app/build.gradle` versionCode bump.

---

## 7. Folder Structure After

```
C:\store manager\
  dist/                      # vite build (readonly when VITE_READONLY=true)
  capacitor.config.ts        # NEW
  android/                   # NEW (generated by Capacitor)
  .env.readonly              # NEW
  ADMIN_READONLY_APK.md      # this file
  src/
    lib/pocketbase.ts        # no change, reads VITE_PB_URL
    lib/utils.ts             # add isReadOnly guards
    components/Sidebar.tsx   # hide write nav when readonly
    pages/BillsHistory.tsx   # hide Mark Paid / Bulk SMS when readonly
```

---

## 8. ENV Reference

| Var | Desktop | Viewer APK |
|---|---|---|
| `VITE_PB_URL` | `http://127.0.0.1:8090` | `http://192.168.1.25:8090` (LAN) or `https://pb.businessdesk.in` (hosted) |
| `VITE_READONLY` | `false` / unset | `true` |
| `VITE_APK_MODE` | unset | `true` (optional UI tweaks) |

Do **not** commit real `VITE_PB_URL` secrets; use `.env.readonly.example`.

---

## 9. Testing Checklist (APK)

- [ ] Login as `viewer@...` succeeds, wrong password fails
- [ ] Dashboard shows correct `todaySales / pendingPayments` from hosted PB
- [ ] Bills History lists same data as desktop (verify against `getBills()` at `src/lib/utils.ts:372`)
- [ ] Search + status filter works offline? (client filter `src/pages/BillsHistory.tsx:43`)
- [ ] Open bill → InvoicePreview renders items (`bill.items` via `itemsByBill` map)
- [ ] Create / Edit / Delete buttons **not visible** when `VITE_READONLY=true`
- [ ] Direct `pb.collection('bills').create()` from console fails with 400/403 (server rule)
- [ ] On LAN, phone and desktop see same bills after desktop creates one (re-pull)
- [ ] APK works on mobile data when PB is hosted (not LAN-only)

---

## 10. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `PocketBase offline` banner | `VITE_PB_URL` still `127.0.0.1` on phone | Use LAN IP / hosted URL; ensure `--http=0.0.0.0:8090` |
| `CORS` error | PB not allowing origin | PocketBase 0.40+ allows all by default; if restricted, add `capacitor://*` to CORS |
| `net::ERR_CLEARTEXT_NOT_PERMITTED` | Android blocks http | Set `android:usesCleartextTraffic="true"` + `allowMixedContent:true` |
| `401/403` on bills | `viewer` role blocked by strict rules | Verify `listRule = @request.auth.id != ""` and user is authenticated (`pb.authStore.isValid`) |
| White screen in APK | `base: './'` missing | Keep `vite.config.ts:6` as `base: './'` for file:// |

---

## 11. Alternatives Considered

- **PWA (no APK):** host the same Vite app at `https://viewer.businessdesk.in` with `VITE_READONLY=true` — owner can "Add to Home Screen" without building APK. Fastest path.
- **Flutter/React Native rewrite:** more native but duplicates `src/lib/utils.ts` logic.
- **Tauri Android:** promising but Capacitor has better React/Vite docs.

---

## 12. Appendix — Desktop Build Fixes

### 12.1 winCodeSign symlink error

**Error you reported:**
```
ERROR: Cannot create symbolic link : A required privilege is not held by the client.
:C:\Users\atifs\AppData\Local\electron-builder\Cache\winCodeSign\...\libcrypto.dylib
```

**Root cause:** `electron-builder` extracts `winCodeSign-2.6.0.7z` which contains symlinks (`libcrypto.dylib` →). Windows blocks symlink creation without **Developer Mode** or **Administrator** privilege.

**Fix applied (verified 2026-09-07 — `release2/BusinessDesk Setup 0.0.1.exe` 100 MB built, EXIT:0):**

1. `electron-builder.yml:16` — disabled signing explicitly:
   ```yaml
   win:
     sign: null
     signAndEditExecutable: false
     verifyUpdateCodeSignature: false
     forceCodeSigning: false
   ```
2. `package.json:16` — skip identity discovery so `winCodeSign` is **not downloaded at all**:
   ```json
   "exe": "cross-env CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:electron && cross-env CSC_IDENTITY_AUTO_DISCOVERY=false electron-builder --win nsis --publish never"
   ```
   Added devDeps `cross-env@7.0.3`, `rimraf@6.1.3` (`package.json:34`). `SET USE_SYSTEM_SIGNCODE=true` was PowerShell-incompatible and insufficient.

3. Cache cleared:
   ```powershell
   Remove-Item -Recurse -Force "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
   ```

**How to build now (no admin needed):**
```powershell
npm install          # picks up cross-env
npm run exe          # → release/BusinessDesk Setup 0.0.1.exe
# or manually:
$env:CSC_IDENTITY_AUTO_DISCOVERY="false"
npx electron-builder --win nsis --publish never
```

**If you still see winCodeSign download:** enable **Developer Mode** once (Settings → System → For developers → Developer Mode ON — grants `SeCreateSymbolicLinkPrivilege` without admin) OR run the build from an **elevated** PowerShell (Run as Administrator). With the fix above, **neither is required** anymore because `winCodeSign` is skipped.

> Note: `build/icon.ico` line is commented in `electron-builder.yml:22` — add a 256×256 `.ico` there to replace the default Electron icon warning `default Electron icon is used`.

### 12.2 Installed EXE — `ERR_MODULE_NOT_FOUND: electron-updater`

**Error you reported after installing `C:\Program Files\Business Desk\...`:**
```
Uncaught Exception: Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'electron-updater' imported from ...app.asar/electron/dist/main.js
```

**Root cause:** `electron-updater@6.8.9` and `electron-is-dev@3.0.1` were in `devDependencies` (`package.json:36`). `electron-builder` only packages `dependencies` into `app.asar`. So production `app.asar` contained `dist/`, `electron/dist/main.js` but **no** `node_modules/electron-updater` — import crashed before `app.whenReady`.

**Fix applied:**
1. Moved `electron-updater`, `electron-is-dev` to `dependencies` (`package.json:21`).
2. Added `package.json` to `files` (`electron-builder.yml:9`) so updater can read app version from asar.
3. Made `electron/main.ts:1` resilient: replaced static `import pkg from 'electron-updater'` / `import isDev from 'electron-is-dev'` with `createRequire` + `try/catch`:
   ```ts
   import { createRequire } from 'module';
   const require = createRequire(import.meta.url);
   let isDev: boolean; try { const m=require('electron-is-dev'); isDev=... } catch { isDev=!app.isPackaged }
   let autoUpdater:any=null; try { autoUpdater=require('electron-updater').autoUpdater } catch {}
   ```
   Now missing updater does **not** crash; updater IPC handlers (`check-for-updates`, `download-update`, `quit-and-install`) return graceful `not available` messages.

Verified: `npx asar list release2/win-unpacked/resources/app.asar | Select-String electron-updater` shows updater + `builder-util-runtime` bundled.

### 12.3 Packaged window blank — `ERR_FILE_NOT_FOUND: electron/dist/index.html`

**Symptom after fixing 12.2:** win-unpacked launch logged `Failed to load URL: file:///.../app.asar/electron/dist/index.html`.

**Root cause:** `electron/main.ts:40` used `path.join(__dirname, '../dist/index.html')`. With `__dirname = .../app.asar/electron/dist`, `../dist` resolves to `.../app.asar/electron/dist` (still inside `electron/`), not `.../app.asar/dist`. Correct is `../../dist`. Same for icon `../public/favicon.svg` → should be `../../dist/favicon.svg` (Vite copies `public/*` to `dist/`).

**Fix:** `electron/main.ts:31` now:
```ts
const iconPath = path.join(__dirname, '../../dist/favicon.svg');
const distIndex = path.join(__dirname, '../../dist/index.html');
// ...
mainWindow.loadFile(distIndex);
```
Verified: `release2/win-unpacked` launches 8s with no `ERR_MODULE_NOT_FOUND` nor `ERR_FILE_NOT_FOUND`.

### 12.4 AutoUpdater 404 noise — `YOUR_GITHUB_USERNAME`

Previous `electron-builder.yml:37` had placeholder `publish: provider: github / owner: YOUR_GITHUB_USERNAME` — updater then tried `https://github.com/YOUR_GITHUB_USERNAME/businessdesk/releases.atom` → 404 `HttpError`. Disabled by commenting `publish` block entirely (no `publish: null` — that crashes app-builder). Updater now safely skipped; uncomment and set real repo when you enable releases.

### 12.5 Locked `release/win-unpacked/resources/app.asar`

If rebuild fails with `remove .../app.asar: The process cannot access the file because it is being used by another process` after testing `release/win-unpacked/BusinessDesk.exe`, blame 360 Total Security (`QHActiveDefense` 9665 handles) or lingering Electron. Workaround: build to alt dir `npx electron-builder --win nsis --publish never --config.directories.output=release2` (verified) or reboot / `taskkill /F /IM BusinessDesk.exe` + disable real-time briefly, then `Remove-Item -Recurse -Force release`.

---

## 13. Next Steps for You

1. Decide `VITE_PB_URL` — LAN IP for internal viewer or hosted URL for remote.
2. Create `viewer` user and (optionally) apply server rules in §3.1.
3. Run Phase 1–2 locally to get `app-debug.apk` under `android/app/build/outputs/apk/debug/`.
4. Install on owner's phone, verify Bills History matches desktop.

Want the actual `capacitor.config.ts` + `isReadOnly` guards scaffolded into `src/`? Ask to generate them — this MD is the blueprint, code is 1 command away.

