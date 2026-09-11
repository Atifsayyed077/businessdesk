import PocketBase from 'pocketbase';

// === Config ===
// Allow runtime override: ?pb=https://... , localStorage PB_URL, then .env fallback
const queryPb = new URLSearchParams(location.search).get('pb');
if (queryPb) localStorage.setItem('PB_URL', queryPb);
const storedPb = localStorage.getItem('PB_URL');
const PB_URL = storedPb || import.meta.env.VITE_PB_URL || 'https://my-pocketbase-app.loca.lt';
export const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);
// Bypass loca.lt / localtunnel interstitial (511 Network Authentication Required)
// loca.lt serves a warning page unless this header is present on fetch/XHR
pb.beforeSend = function (url, opts) {
  opts.headers = {
    ...(opts.headers || {}),
    'Bypass-Tunnel-Reminder': 'true',
    'X-Requested-With': 'XMLHttpRequest',
  };
  return { url, opts };
};

console.log('[viewer] PB_URL =', PB_URL, storedPb ? '(from localStorage)' : '(from .env)');

// === State ===
let bills = [];
let filtered = [];
let currentBill = null;

// === Helpers ===
function formatCurrency(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatDate(d) {
  if (!d) return '-';
  const s = String(d).trim().split(' ')[0].split('T')[0];
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s;
  try {
    const dt = new Date(Date.UTC(+m[1], +m[2]-1, +m[3]));
    return dt.toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric', timeZone:'Asia/Kolkata' });
  } catch { return s; }
}
function mapBill(r, items=[]) {
  const total = Number(r.total||0);
  const paid = r.paid_amount!=null ? Number(r.paid_amount) : (r.payment_status==='Paid'? total:0);
  const remaining = r.remaining_amount!=null ? Number(r.remaining_amount) : (total - paid);
  return {
    id: r.id,
    bill_number: r.bill_number||'',
    customer_name: r.customer_name || r.expand?.customer?.name || '',
    customer_mobile: r.customer_mobile || r.expand?.customer?.mobile || '',
    date: r.date || (r.created? r.created.slice(0,10):''),
    subtotal: Number(r.subtotal||0),
    labour_total: Number(r.labour_total||0),
    total, payment_status: r.payment_status || (remaining<=0?'Paid':'Pending'),
    notes: r.notes||'', created: r.created||'',
    items
  };
}
function mapBillItem(r){
  return { id:r.id, bill_id: r.bill_id || r.bill || '', product_name: r.product_name||'', quantity:Number(r.quantity||0), unit_price:Number(r.unit_price||0), total:Number(r.total||0) };
}

// === Auth ===
async function tryRestore() {
  if (pb.authStore.isValid && pb.authStore.model) {
    try { await pb.collection('users').authRefresh(); return true; } catch { pb.authStore.clear(); }
  }
  return false;
}

// === Data ===
async function fetchBills() {
  if (!pb.authStore.isValid) throw new Error('Not authenticated');
  let billsRaw = [];
  try {
    billsRaw = await pb.collection('bills').getFullList({ sort: '-date', expand: 'customer' });
  } catch (e) {
    console.warn('[viewer] getFullList -date failed, retry without', e);
    try { billsRaw = await pb.collection('bills').getFullList({ sort: '-date' }); }
    catch { billsRaw = await pb.collection('bills').getFullList(); }
  }
  let itemsByBill = {};
  try {
    const all = await pb.collection('bill_items').getFullList();
    for (const it of all) {
      const m = mapBillItem(it);
      const bid = m.bill_id;
      if (!bid) continue;
      (itemsByBill[bid] ||= []).push(m);
    }
  } catch (e) { console.warn('[viewer] bill_items fetch', e); }
  return billsRaw.map(r => mapBill(r, itemsByBill[r.id]||[]));
}

async function fetchStats(allBills) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
  const firstOfMonth = new Date(); firstOfMonth.setDate(1);
  const monthStart = firstOfMonth.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const toISODate = d => String(d||'').trim().split(' ')[0].split('T')[0];
  const todaySales = allBills.filter(b=> toISODate(b.date)===today).reduce((s,b)=> s+Number(b.total||0),0);
  const monthly = allBills.filter(b=> toISODate(b.date) >= monthStart).reduce((s,b)=> s+Number(b.total||0),0);
  const pending = allBills.filter(b=> b.payment_status==='Pending').reduce((s,b)=> s+Number(b.total||0),0);
  let products=[], customers=[];
  try { products = await pb.collection('products').getFullList(); } catch {}
  try { customers = await pb.collection('customers').getFullList(); } catch {}
  const lowStock = products.filter(p=> Number(p.stock||0) <= Number(p.min_stock||10)).length;
  return { todaySales, monthly, pending, lowStock, totalProducts: products.length, totalCustomers: customers.length, todayCount: allBills.filter(b=> toISODate(b.date)===today).length, totalBills: allBills.length };
}

// === Render ===
function renderApp() {
  const app = document.getElementById('app');
  app.innerHTML = `
  <header class="sticky top-0 z-20 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70 border-b border-slate-200">
    <div class="max-w-6xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex flex-wrap items-center justify-between gap-2 sm:gap-4">
      <div class="flex items-center gap-2.5 min-w-0 flex-1">
        <div class="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-slate-900 text-white grid place-items-center text-sm font-bold shrink-0">BD</div>
        <div class="min-w-0">
          <div class="text-[15px] sm:text-sm font-semibold leading-none truncate">BusinessDesk Viewer</div>
          <div class="text-[11px] sm:text-xs text-slate-500 truncate">Read-only • <button id="pbUrlBtn" class="font-mono underline decoration-dotted underline-offset-2 hover:text-slate-900 truncate max-w-[160px] xs:max-w-[220px] sm:max-w-none align-bottom" title="Click to change PB URL">${PB_URL.replace(/^https?:\/\//,'')}</button></div>
        </div>
      </div>
      <div class="flex items-center gap-1.5 sm:gap-2 shrink-0 w-full sm:w-auto justify-between sm:justify-end">
        <span id="pbStatus" class="text-[11px] sm:text-xs px-2.5 py-1 rounded-full border bg-slate-50 border-slate-200 truncate max-w-[160px] sm:max-w-none">Checking…</span>
        <button id="logoutBtn" class="hidden inline-flex items-center justify-center px-3 py-2 sm:py-1.5 text-xs font-medium rounded-lg border bg-white text-slate-700 border-slate-200 hover:bg-slate-50 cursor-pointer min-h-[36px] sm:min-h-0">Logout</button>
      </div>
    </div>
  </header>

  <!-- PB URL override banner (shows when ?pb or localStorage used) -->
  <div id="pbBanner" class="hidden max-w-6xl mx-auto mt-3 px-3 sm:px-4">
    <div class="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl px-3 py-2.5 flex flex-col xs:flex-row items-start xs:items-center justify-between gap-2">
      <span class="break-all">Using PB: <b class="font-mono">${PB_URL}</b></span>
      <button id="pbResetBtn" class="shrink-0 text-xs px-3 py-1.5 bg-white border border-amber-200 rounded-lg hover:bg-amber-100 min-h-[32px]">Reset</button>
    </div>
  </div>

  <!-- Global error banner for 404/511 -->
  <div id="globalError" class="hidden max-w-6xl mx-auto mt-3 px-3 sm:px-4">
    <div class="bg-red-50 border border-red-200 text-red-800 text-sm rounded-xl p-4"></div>
  </div>

  <main class="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">

    <!-- Login -->
    <section id="loginSection" class="max-w-md mx-auto bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-sm">
      <h2 class="text-lg font-semibold">Admin Login</h2>
      <p class="text-xs text-slate-500 mt-1">Sign in with your PocketBase <code class="bg-slate-100 px-1 rounded">users</code> account. This viewer is <b>read-only</b> — no create/edit/delete.</p>
      <div id="loginError" class="hidden mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 break-words"></div>
      <form id="loginForm" class="mt-4 space-y-3">
        <input id="email" type="email" placeholder="Email (e.g. viewer@businessdesk.in)" class="w-full px-3 py-3 sm:py-2 text-base sm:text-sm border border-slate-300 rounded-xl sm:rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900" required autocomplete="username" inputmode="email" />
        <input id="password" type="password" placeholder="Password" class="w-full px-3 py-3 sm:py-2 text-base sm:text-sm border border-slate-300 rounded-xl sm:rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900" required autocomplete="current-password" />
        <button type="submit" class="inline-flex items-center justify-center gap-2 w-full px-3 py-3 sm:py-2.5 text-[15px] sm:text-sm font-semibold rounded-xl sm:rounded-lg border bg-slate-900 text-white border-slate-900 hover:bg-black active:bg-black cursor-pointer min-h-[48px] sm:min-h-0">Sign in</button>
        <p class="text-[11px] text-slate-400 break-all">PB: <span class="font-mono">${PB_URL}</span> — keep <code class="whitespace-nowrap">npx lt --port 8090 --subdomain my-pocketbase-app</code> running</p>
      </form>
      <details class="mt-4 text-xs text-slate-500">
        <summary class="cursor-pointer py-2">Troubleshooting</summary>
        <ul class="list-disc pl-4 mt-2 space-y-1.5 leading-relaxed">
          <li><code>Failed to fetch</code> → PocketBase not running or loca.lt tunnel not started.</li>
          <li><code>403/404</code> → create a <code>viewer</code> user in <code>http://127.0.0.1:8090/_/</code> → users.</li>
          <li>Use <code>start.bat</code> to launch PB + <code>npx lt --port 8090 --subdomain my-pocketbase-app</code>.</li>
        </ul>
      </details>
    </section>

    <!-- Dashboard -->
    <section id="dashSection" class="hidden space-y-4">
      <div id="statsGrid" class="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3"></div>

      <div class="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 shadow-sm">
        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between">
            <h3 class="font-semibold text-[15px] sm:text-base">Bills History</h3>
            <span class="text-[11px] text-slate-400 sm:hidden">Swipe table →</span>
          </div>
          <!-- Mobile: stacked, Desktop: row -->
          <div class="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
            <div class="flex flex-col xs:flex-row gap-2 flex-1">
              <input id="search" placeholder="Search bill / customer / mobile…" class="flex-1 min-w-0 px-3 py-2.5 sm:py-2 text-sm border border-slate-300 rounded-xl sm:rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900" />
              <select id="statusFilter" class="px-3 py-2.5 sm:py-2 text-sm border border-slate-300 rounded-xl sm:rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 xs:w-32 sm:w-36 shrink-0">
                <option value="all">All Status</option>
                <option value="Paid">Paid</option>
                <option value="Pending">Pending</option>
              </select>
            </div>
            <div class="flex gap-2">
              <button id="refreshBtn" class="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-1.5 text-sm sm:text-xs font-medium rounded-xl sm:rounded-lg border bg-white text-slate-700 border-slate-200 hover:bg-slate-50 active:bg-slate-100 cursor-pointer min-h-[44px] sm:min-h-0">↻ Refresh</button>
              <button id="exportCsvBtn" class="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-1.5 text-sm sm:text-xs font-medium rounded-xl sm:rounded-lg border bg-white text-slate-700 border-slate-200 hover:bg-slate-50 active:bg-slate-100 cursor-pointer min-h-[44px] sm:min-h-0">CSV</button>
            </div>
          </div>
        </div>
        <div id="billStats" class="grid grid-cols-3 gap-2 sm:gap-3 mt-3 sm:mt-4 text-center"></div>
        <!-- Desktop table -->
        <div class="hidden sm:block overflow-auto mt-4 border border-slate-100 rounded-xl">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 sticky top-0">
              <tr class="text-[11px] font-semibold tracking-wide uppercase text-slate-500">
                <th class="px-3 py-2.5 text-left whitespace-nowrap">Bill No.</th><th class="px-3 py-2.5 text-left">Customer</th><th class="px-3 py-2 whitespace-nowrap">Mobile</th><th class="px-3 py-2 whitespace-nowrap">Date</th><th class="px-3 py-2 text-right">Items</th><th class="px-3 py-2 text-right">Total</th><th class="px-3 py-2">Status</th><th class="px-3 py-2">View</th>
              </tr>
            </thead>
            <tbody id="billsBody"></tbody>
          </table>
        </div>
        <!-- Mobile cards -->
        <div id="billsCards" class="sm:hidden mt-4 space-y-2"></div>
        <p class="text-xs text-slate-400 mt-3 text-center sm:text-left">Read-only: searching/opening bills only • Tap View to see items</p>
      </div>
    </section>

  </main>

  <!-- Bill Modal — responsive: full on mobile, centered on desktop -->
  <dialog id="billDialog" class="p-0 rounded-2xl sm:rounded-xl border-0 sm:border border-slate-200 w-full max-w-2xl backdrop:bg-black/40 m-0 sm:m-auto sm:mt-[5vh] max-h-[92dvh] sm:max-h-[85vh] overflow-hidden flex flex-col open:flex">
    <div class="p-4 sm:p-5 flex flex-col min-h-0 overflow-hidden">
      <div class="flex items-start justify-between gap-3 shrink-0">
        <div class="min-w-0">
          <div id="dlgBillNo" class="text-base sm:text-lg font-bold truncate"></div>
          <div id="dlgMeta" class="text-xs text-slate-500 break-words"></div>
        </div>
        <form method="dialog" class="shrink-0"><button class="inline-flex items-center justify-center px-3 py-2 sm:py-1.5 text-sm sm:text-xs font-medium rounded-xl sm:rounded-lg border bg-white text-slate-700 border-slate-200 hover:bg-slate-50 min-h-[40px] sm:min-h-0">Close</button></form>
      </div>
      <div class="overflow-auto mt-4 border border-slate-100 rounded-xl -mx-1 sm:mx-0 flex-1 min-h-0">
        <table class="w-full text-sm min-w-[420px] sm:min-w-0">
          <thead class="bg-slate-50 sticky top-0"><tr class="text-[11px] font-semibold tracking-wide uppercase text-slate-500"><th class="px-3 py-2 text-left">#</th><th class="px-3 py-2 text-left">Product</th><th class="px-3 py-2 text-right">Qty</th><th class="px-3 py-2 text-right">Price</th><th class="px-3 py-2 text-right">Total</th></tr></thead>
          <tbody id="dlgBody"></tbody>
        </table>
      </div>
      <div id="dlgTotals" class="mt-3 text-sm text-right space-y-1 shrink-0 bg-slate-50 -mx-4 sm:mx-0 px-4 py-3 rounded-xl sm:bg-transparent sm:px-0 sm:py-0"></div>
      <p id="dlgNotes" class="mt-3 text-xs text-slate-500 shrink-0 break-words"></p>
    </div>
  </dialog>

  <footer class="max-w-6xl mx-auto px-3 sm:px-4 py-6 sm:py-8 text-center text-xs text-slate-400 leading-relaxed">
    Static viewer — <span class="font-mono break-all">${PB_URL}</span> • <code>npm run build</code> → <code>dist/</code>
  </footer>
  `;

  // events
  document.getElementById('loginForm').addEventListener('submit', onLogin);
  document.getElementById('logoutBtn').addEventListener('click', onLogout);
  const pbUrlBtn = document.getElementById('pbUrlBtn');
  if (pbUrlBtn) pbUrlBtn.addEventListener('click', onChangePbUrl);
  const pbResetBtn = document.getElementById('pbResetBtn');
  if (pbResetBtn) pbResetBtn.addEventListener('click', onResetPbUrl);
  const banner = document.getElementById('pbBanner');
  if (banner && (storedPb || queryPb)) banner.classList.remove('hidden');
  // show globalError handlers
  document.getElementById('search')?.addEventListener('input', applyFilter);
  document.getElementById('statusFilter')?.addEventListener('change', applyFilter);
  document.getElementById('refreshBtn')?.addEventListener('click', loadAfterLogin);
  document.getElementById('exportCsvBtn')?.addEventListener('click', exportCsv);
}

function onChangePbUrl() {
  const cur = PB_URL;
  const next = prompt('Enter PocketBase URL (e.g. https://my-pocketbase-app.loca.lt or http://192.168.1.50:8090):', cur);
  if (!next || next.trim() === cur) return;
  const v = next.trim().replace(/\/$/, '');
  localStorage.setItem('PB_URL', v);
  alert(`PB URL set to ${v}\nPage will reload. Add ?pb=${encodeURIComponent(v)} to share.`);
  location.href = location.pathname + '?pb=' + encodeURIComponent(v);
}
function onResetPbUrl() {
  localStorage.removeItem('PB_URL');
  location.href = location.pathname;
}
function showGlobalError(html) {
  const el = document.getElementById('globalError');
  if (!el) return;
  el.innerHTML = html;
  el.classList.remove('hidden');
}
function hideGlobalError() {
  const el = document.getElementById('globalError');
  if (el) el.classList.add('hidden');
}

function setPbStatus(text, ok=null) {
  const el = document.getElementById('pbStatus');
  if (!el) return;
  el.textContent = text;
  el.className = 'text-xs px-2 py-1 rounded-full border ' + (ok===true?'bg-green-50 border-green-200 text-green-700': ok===false?'bg-red-50 border-red-200 text-red-700':'bg-slate-50 border-slate-200');
}

async function onLogin(e) {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const pwd = document.getElementById('password').value;
  const errEl = document.getElementById('loginError');
  errEl.classList.add('hidden');
  try {
    setPbStatus('Signing in…', null);
    await pb.collection('users').authWithPassword(email, pwd);
    hideGlobalError();
    setPbStatus('Connected ✓', true);
    await afterLogin();
  } catch (err) {
    // PocketBase errors from tunnel often surface as 511/404 HTML, surface helpful text
    const status = err?.status || err?.originalError?.status;
    let msg = err?.data?.message || err?.message || 'Login failed';
    if (status === 511 || String(msg).includes('511')) msg += ' — tunnel 511: run `npx lt --port 8090 --subdomain my-pocketbase-app` on host PC and keep it open';
    if (status === 404) msg += ' — tunnel 404: subdomain not active, restart tunnel';
    errEl.textContent = msg + ' — PB at ' + PB_URL + ' — check health and ensure tunnel is running.';
    errEl.classList.remove('hidden');
    setPbStatus(status ? `PB ${status} — login failed` : 'Offline', false);
  }
}
function onLogout() {
  pb.authStore.clear();
  location.reload();
}
async function afterLogin() {
  document.getElementById('loginSection').classList.add('hidden');
  document.getElementById('dashSection').classList.remove('hidden');
  document.getElementById('logoutBtn').classList.remove('hidden');
  setPbStatus(`Logged in as ${pb.authStore.model?.email||''}`, true);
  await loadAfterLogin();
}
async function loadAfterLogin() {
  // loading state
  document.getElementById('billsBody').innerHTML = `<tr><td colspan="8" class="px-3 py-8 text-center text-slate-400">Loading bills from ${PB_URL}…</td></tr>`;
  try {
    bills = await fetchBills();
    filtered = [...bills];
    hideGlobalError();
    renderStats();
    applyFilter();
    setPbStatus(`${bills.length} bills • ${PB_URL}`, true);
  } catch (e) {
    const st = e?.status;
    let extra = '';
    if (st === 511) extra = '<br/><span class="text-amber-700">511: loca.lt interstitial — ensure tunnel sends Bypass-Tunnel-Reminder header (now automatic) and tunnel is running</span>';
    if (st === 404) extra = '<br/><span class="text-amber-700">404: subdomain not active — restart `npx lt --port 8090 --subdomain my-pocketbase-app`</span>';
    document.getElementById('billsBody').innerHTML = `<tr><td colspan="8" class="px-3 py-6 text-center text-red-600">Failed to fetch: ${e.message} ${extra} — is <code>npx lt --port 8090 --subdomain my-pocketbase-app</code> running? PB at ${PB_URL} <button onclick="location.reload()" class="underline">Retry</button></td></tr>`;
    setPbStatus(st ? `Fetch ${st} failed` : 'Fetch failed', false);
  }
}
function renderStats() {
  const s = document.getElementById('billStats');
  const tot = filtered.reduce((a,b)=> a+Number(b.total||0),0);
  const paid = filtered.filter(b=> b.payment_status==='Paid').reduce((a,b)=> a+Number(b.total||0),0);
  const pend = filtered.filter(b=> b.payment_status==='Pending').reduce((a,b)=> a+Number(b.total||0),0);
  s.innerHTML = `
    <div class="bg-slate-50 rounded-xl border border-slate-200 p-3 sm:p-4"><div class="text-[11px] sm:text-xs uppercase tracking-wide text-slate-500">Total</div><div class="font-bold text-sm sm:text-base">${formatCurrency(tot)}</div><div class="text-[11px] sm:text-xs text-slate-400">${filtered.length} bills</div></div>
    <div class="bg-green-50/50 rounded-xl border border-green-200 p-3 sm:p-4"><div class="text-[11px] sm:text-xs uppercase tracking-wide text-slate-500">Collected</div><div class="font-bold text-green-600 text-sm sm:text-base">${formatCurrency(paid)}</div></div>
    <div class="bg-amber-50/50 rounded-xl border border-amber-200 p-3 sm:p-4"><div class="text-[11px] sm:text-xs uppercase tracking-wide text-slate-500">Pending</div><div class="font-bold text-amber-600 text-sm sm:text-base">${formatCurrency(pend)}</div></div>
  `;

  fetchStats(bills).then(stats=>{
    const grid = document.getElementById('statsGrid');
    if (!grid) return;
    grid.innerHTML = `
      <div class="bg-white rounded-xl border border-slate-200 p-3 sm:p-4"><div class="text-[11px] sm:text-xs text-slate-500 uppercase tracking-wide">Today</div><div class="text-lg sm:text-xl font-bold">${formatCurrency(stats.todaySales)}</div><div class="text-[11px] sm:text-xs text-slate-400">${stats.todayCount} bills today</div></div>
      <div class="bg-white rounded-xl border border-slate-200 p-3 sm:p-4"><div class="text-[11px] sm:text-xs text-slate-500 uppercase tracking-wide">Monthly</div><div class="text-lg sm:text-xl font-bold">${formatCurrency(stats.monthly)}</div><div class="text-[11px] sm:text-xs text-slate-400">${stats.totalBills} bills</div></div>
      <div class="bg-white rounded-xl border border-slate-200 p-3 sm:p-4"><div class="text-[11px] sm:text-xs text-slate-500 uppercase tracking-wide">Pending</div><div class="text-lg sm:text-xl font-bold text-amber-600">${formatCurrency(stats.pending)}</div><div class="text-[11px] sm:text-xs text-slate-400">total pending</div></div>
      <div class="bg-white rounded-xl border border-slate-200 p-3 sm:p-4"><div class="text-[11px] sm:text-xs text-slate-500 uppercase tracking-wide">Customers / Products</div><div class="text-lg sm:text-xl font-bold">${stats.totalCustomers} / ${stats.totalProducts}</div><div class="text-[11px] sm:text-xs text-slate-400">${stats.lowStock} low stock</div></div>
    `;
  }).catch(()=>{});
}

function applyFilter() {
  const q = (document.getElementById('search').value||'').toLowerCase();
  const st = document.getElementById('statusFilter').value;
  filtered = bills.filter(b=>{
    const mSearch = !q || b.bill_number.toLowerCase().includes(q) || b.customer_name.toLowerCase().includes(q) || (b.customer_mobile||'').includes(q);
    const mStatus = st==='all' || b.payment_status===st;
    return mSearch && mStatus;
  });
  renderBills();
  renderStats();
}

function renderBills() {
  const body = document.getElementById('billsBody');
  const cards = document.getElementById('billsCards');
  if (filtered.length===0) {
    const empty = `<div class="px-3 py-10 text-center text-slate-400 text-sm">No bills found — try different search or check PB at ${PB_URL}</div>`;
    if (body) body.innerHTML = `<tr><td colspan="8">${empty}</td></tr>`;
    if (cards) cards.innerHTML = empty;
    return;
  }
  // Desktop table
  if (body) {
    body.innerHTML = filtered.map(b=> `
      <tr class="border-t border-slate-50 hover:bg-slate-50">
        <td class="px-3 py-2.5 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">${b.bill_number}</td>
        <td class="px-3 py-2.5 font-medium max-w-[160px] truncate" title="${b.customer_name}">${b.customer_name}</td>
        <td class="px-3 py-2.5 text-slate-500 whitespace-nowrap">${b.customer_mobile}</td>
        <td class="px-3 py-2.5 text-slate-500 whitespace-nowrap">${formatDate(b.date)}</td>
        <td class="px-3 py-2.5 text-right">${b.items?.length||0}</td>
        <td class="px-3 py-2.5 text-right font-medium whitespace-nowrap">${formatCurrency(b.total)}</td>
        <td class="px-3 py-2.5">${b.payment_status==='Paid'?'<span class="inline-flex text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">Paid</span>':'<span class="inline-flex text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Pending</span>'}</td>
        <td class="px-3 py-2.5"><button data-id="${b.id}" class="viewBtn inline-flex items-center justify-center px-2.5 py-1.5 text-xs font-medium rounded-lg border bg-white text-slate-700 border-slate-200 hover:bg-slate-50">View</button></td>
      </tr>
    `).join('');
    body.querySelectorAll('.viewBtn').forEach(btn=> btn.addEventListener('click', ()=> openBill(btn.dataset.id)));
  }
  // Mobile cards
  if (cards) {
    cards.innerHTML = filtered.map(b=> `
      <div class="bg-slate-50/70 border border-slate-200 rounded-xl p-3 active:bg-slate-50">
        <div class="flex items-start justify-between gap-2">
          <div class="font-mono text-sm font-bold text-slate-900">${b.bill_number}</div>
          <span class="${b.payment_status==='Paid'?'bg-green-50 text-green-700 border-green-200':'bg-amber-50 text-amber-700 border-amber-200'} text-[11px] font-semibold border px-2 py-0.5 rounded-full shrink-0">${b.payment_status}</span>
        </div>
        <div class="text-sm font-medium mt-1 truncate">${b.customer_name}</div>
        <div class="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-1 mt-1">
          <span>${b.customer_mobile}</span><span>•</span><span>${formatDate(b.date)}</span><span>•</span><span>${b.items?.length||0} items</span>
        </div>
        <div class="flex items-center justify-between mt-2.5">
          <div class="font-bold text-slate-900">${formatCurrency(b.total)}</div>
          <button data-id="${b.id}" class="viewBtnM inline-flex items-center justify-center px-4 py-2 text-sm font-semibold rounded-xl border bg-slate-900 text-white border-slate-900 active:bg-black min-h-[40px]">View bill</button>
        </div>
      </div>
    `).join('');
    cards.querySelectorAll('.viewBtnM').forEach(btn=> btn.addEventListener('click', ()=> openBill(btn.dataset.id)));
  }
}

function openBill(id) {
  const b = bills.find(x=> x.id===id) || filtered.find(x=> x.id===id);
  if (!b) return;
  currentBill = b;
  document.getElementById('dlgBillNo').textContent = b.bill_number;
  document.getElementById('dlgMeta').textContent = `${b.customer_name} • ${b.customer_mobile} • ${formatDate(b.date)} • ${b.payment_status}`;
  document.getElementById('dlgBody').innerHTML = (b.items||[]).map((it,i)=> `
    <tr class="border-t border-slate-50">
      <td class="px-3 py-1.5">${i+1}</td><td class="px-3 py-1.5">${it.product_name}</td><td class="px-3 py-1.5 text-right">${it.quantity}</td><td class="px-3 py-1.5 text-right">${formatCurrency(it.unit_price)}</td><td class="px-3 py-1.5 text-right">${formatCurrency(it.total)}</td>
    </tr>
  `).join('') || `<tr><td colspan="5" class="px-3 py-6 text-center text-slate-400">No items</td></tr>`;
  document.getElementById('dlgTotals').innerHTML = `
    <div>Subtotal: <b>${formatCurrency(b.subtotal)}</b></div>
    <div>Labour: <b>${formatCurrency(b.labour_total)}</b></div>
    <div class="text-base">Total: <b>${formatCurrency(b.total)}</b></div>
  `;
  document.getElementById('dlgNotes').textContent = b.notes ? `Notes: ${b.notes}` : '';
  document.getElementById('billDialog').showModal();
}

function exportCsv() {
  if (filtered.length===0) return alert('No bills to export');
  const head = ['Bill No','Customer','Mobile','Date','Items','Total','Status'];
  const rows = filtered.map(b=> [b.bill_number, b.customer_name, b.customer_mobile, b.date, (b.items?.length||0), b.total, b.payment_status]);
  const csv = [head, ...rows].map(r=> r.map(c=> `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=`Bills_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  setTimeout(()=> URL.revokeObjectURL(url), 1000);
}

// === Boot ===
renderApp();
tryRestore().then(ok=>{
  if (ok) afterLogin();
  else setPbStatus(`PB: ${PB_URL} — please login`, null);
});

// Health check display — with bypass header for loca.lt (avoids 511 interstitial)
fetch(`${PB_URL}/api/health`, {
  headers: { 'Bypass-Tunnel-Reminder': 'true', 'X-Requested-With': 'XMLHttpRequest' },
  // @ts-ignore — pocketbase health is simple GET, no credentials needed
}).then(async r=> {
  if (r.ok) {
    hideGlobalError();
    setPbStatus(`PB OK: ${PB_URL}`, true);
    return;
  }
  const text = await r.text().catch(()=>'');
  // 511 = loca.lt interstitial, 404 = subdomain not active / tunnel down
  if (r.status === 511) {
    setPbStatus(`PB 511 at ${PB_URL}`, false);
    showGlobalError(`
      <div class="font-semibold">Tunnel requires browser verification (511 Network Authentication Required)</div>
      <div class="mt-2 text-xs leading-relaxed">
        <b>https://my-pocketbase-app.loca.lt</b> is served by <code>localtunnel / loca.lt</code>. When opened directly it shows an interstitial page; API <code>fetch</code> without <code>Bypass-Tunnel-Reminder</code> header gets 511.<br/>
        This site now sends that header automatically — <b>if you still see 511, the tunnel is not running on the host PC.</b><br/>
        On the PC that runs <code>pocketbase.exe serve</code> do:<br/>
        <code class="bg-white px-1.5 py-0.5 rounded border">npx lt --port 8090 --subdomain my-pocketbase-app</code><br/>
        Keep that window open. Then <button onclick="location.reload()" class="underline font-semibold">Reload</button>.<br/>
        Tip: open <a href="${PB_URL}/api/health" target="_blank" class="underline">API health directly</a> — if you see a "Continue" button, click it, then reload this page.<br/>
        Permanent fix: host PocketBase on Fly.io / pocketbase.io / VPS instead of ephemeral tunnel.
      </div>
      <div class="mt-2 flex gap-2">
        <button onclick="location.reload()" class="px-3 py-1.5 text-xs font-medium rounded-lg border bg-white border-red-200 hover:bg-red-100">Retry</button>
        <button id="errChangeUrl" class="px-3 py-1.5 text-xs font-medium rounded-lg border bg-slate-900 text-white">Change PB URL</button>
      </div>
    `);
    setTimeout(()=> document.getElementById('errChangeUrl')?.addEventListener('click', onChangePbUrl), 0);
  } else if (r.status === 404) {
    setPbStatus(`PB 404 at ${PB_URL}`, false);
    showGlobalError(`
      <div class="font-semibold">PB 404 — tunnel subdomain not active</div>
      <div class="mt-2 text-xs">Subdomain <b>my-pocketbase-app</b> at <code>loca.lt</code> is free / tunnel is offline. The PC must run:<br/>
      <code class="bg-white px-1.5 py-0.5 rounded border">cd /d C:\\pocketbase_0.40.2_windows_amd64 && pocketbase.exe serve</code><br/>
      and <code class="bg-white px-1.5 py-0.5 rounded border">npx lt --port 8090 --subdomain my-pocketbase-app</code><br/>
      Wait for <code>your url is: https://my-pocketbase-app.loca.lt</code> then reload. If still 404, subdomain taken — pick new one and update <code>admin-viewer/.env VITE_PB_URL</code> + <code>start.bat</code>.</div>
      <div class="mt-2"><button onclick="location.reload()" class="px-3 py-1.5 text-xs font-medium rounded-lg border bg-white border-red-200">Retry</button></div>
    `);
  } else {
    setPbStatus(`PB ${r.status} at ${PB_URL}`, false);
    showGlobalError(`<b>PB ${r.status}</b> at ${PB_URL}<br/><code class="text-xs">${text.slice(0,300)}</code><br/><button onclick="location.reload()" class="mt-2 px-3 py-1.5 text-xs border bg-white rounded">Retry</button>`);
  }
}).catch((err)=> {
  setPbStatus(`PB offline at ${PB_URL}`, false);
  showGlobalError(`
    <div class="font-semibold">Cannot reach PocketBase at ${PB_URL}</div>
    <div class="text-xs mt-2">Error: ${err.message}<br/>Common causes: tunnel not running, PC asleep, or CORS blocked.<br/>
    1) On host PC: <code>start.bat</code> (starts PB + <code>npx lt --port 8090 --subdomain my-pocketbase-app</code>)<br/>
    2) Test health directly: <a href="${PB_URL}/api/health" target="_blank" class="underline">${PB_URL}/api/health</a> should return {"code":200}<br/>
    3) Check PB CORS: Admin UI → Settings → allow all origins or add <code>https://rococo-nasturtium-d70716.netlify.app</code></div>
    <div class="mt-2"><button onclick="location.reload()" class="px-3 py-1.5 text-xs border bg-white rounded">Retry</button> <button id="errChangeUrl2" class="px-3 py-1.5 text-xs bg-slate-900 text-white rounded">Change PB URL</button></div>
  `);
  setTimeout(()=> document.getElementById('errChangeUrl2')?.addEventListener('click', onChangePbUrl), 0);
});
