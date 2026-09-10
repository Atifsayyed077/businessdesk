# Admin Viewer — Static Site (Read-Only)

Static read-only viewer for BusinessDesk, fetching from **`https://my-pocketbase-app.loca.lt`** (PocketBase).

Built per `ADMIN_READONLY_APK.md` — same data contract as desktop, **no create/edit/delete**.

## Live PB URL

```
https://my-pocketbase-app.loca.lt
```

Must keep tunnel running on the machine that hosts PocketBase:

```bat
npx lt --port 8090 --subdomain my-pocketbase-app
# or via start.bat (already does it)
```

PocketBase must be running: `C:\pocketbase_0.40.2_windows_amd64\pocketbase.exe serve` (default `http://127.0.0.1:8090`).

## Folder

```
C:\store manager\admin-viewer\   ← separate static site (this folder)
  index.html
  vite.config.js
  .env            → VITE_PB_URL=https://my-pocketbase-app.loca.lt
  src/main.js     → PocketBase SDK fetch
  src/style.css
  dist/           → `npm run build` output (deploy this)
```

Main desktop app stays in `C:\store manager\` (`src/`, `electron/`).

## Run locally

```bash
cd "C:\store manager\admin-viewer"
npm install
npm run dev      # → http://localhost:5174
```

Login with your `users` collection credentials (create `viewer` role if needed per `ADMIN_READONLY_APK.md:61`).

## Build static

```bash
npm run build    # → admin-viewer/dist/
npm run preview  # → http://localhost:4174 (serve dist)
```

Deploy `dist/` to **Netlify / Vercel / GitHub Pages / Cloudflare Pages** — it's fully static (no server). Ensure PocketBase CORS allows your deployed origin (PocketBase 0.40+ allows all by default; if restricted add `https://your-site.netlify.app`).

## Features (read-only)

- Login via `users` auth (`pb.collection('users').authWithPassword`)
- Dashboard: `todaySales`, `monthly`, `pending`, `lowStock`, `totalCustomers/Products` (`src/main.js:fetchStats` mirrors `src/lib/utils.ts:488`)
- Bills History: search `bill_number/customer/mobile`, filter `Paid|Pending`, totals, CSV export
- Open Bill: read `bills` + `bill_items` (`expand` + `itemsByBill` map like `src/lib/utils.ts:393`), view items, totals, notes — no `Mark Paid` / `Bulk SMS`.

Blocked: all `pb.collection(...).create/update/delete` — UI never calls them.

## ENV

| Var | Value |
|-----|-------|
| `VITE_PB_URL` | `https://my-pocketbase-app.loca.lt` (tunnel) or `http://192.168.1.x:8090` (LAN) or `https://pb.yourdomain.com` (hosted) |
| `VITE_READONLY` | `true` |

Change via `admin-viewer/.env` and rebuild. For quick switch without rebuild, edit `src/main.js: PB_URL` fallback.

## Tunnel subdomain

Requested: `my-pocketbase-app` → `https://my-pocketbase-app.loca.lt`

Keep `start.bat` running — it now does:

1. `pocketbase.exe serve`
2. `npx lt --port 8090 --subdomain my-pocketbase-app`
3. Opens `BusinessDesk.exe` (not `localhost:5173`)

If subdomain is taken, loca.lt assigns random — either retry or change `--subdomain` in `start.bat:32`.

## Deploy checklist

- [ ] `npx lt --port 8090 --subdomain my-pocketbase-app` shows `your url is: https://my-pocketbase-app.loca.lt`
- [ ] `curl https://my-pocketbase-app.loca.lt/api/health` → `{"code":200,"message":"API connected!"}`
- [ ] Viewer login works at `http://localhost:5174`
- [ ] `npm run build` → deploy `dist/`
- [ ] Deployed site can still reach `https://my-pocketbase-app.loca.lt` (tunnel must stay on)
- For production, host PocketBase on VPS instead of loca.lt tunnel (tunnel sleeps when PC off).

## Troubleshooting

| Error | Fix |
|-------|-----|
| `Failed to fetch` / `PB offline at https://my-pocketbase-app.loca.lt` | Tunnel not running — run `npx lt --port 8090 --subdomain my-pocketbase-app` and ensure PB at 8090 |
| `401` | Wrong email/password or user not in `users` — create via `http://127.0.0.1:8090/_/` |
| `CORS` | Add your static site origin to PocketBase CORS (Admin UI → Settings) |
| Subdomain taken | Change `--subdomain` to unique value, update `.env` `VITE_PB_URL` accordingly |
