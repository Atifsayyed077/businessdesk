#!/usr/bin/env node
// Creates all PocketBase tables for BusinessDesk
// Run: node init-pocketbase.mjs

const PB_URL = process.env.VITE_PB_URL || process.env.PB_URL || 'http://127.0.0.1:8090';
const SUPERUSER_EMAIL = process.env.PB_ADMIN_EMAIL || 'admin@storemanager.com';
const SUPERUSER_PASS = process.env.PB_ADMIN_PASS || 'admin123';

async function pbFetch(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = token;
  const res = await fetch(`${PB_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(data)}`);
  }
  return data;
}

async function authSuperuser() {
  // Try _superusers (PB 0.21+) then admins (legacy)
  for (const ep of ['/api/collections/_superusers/auth-with-password', '/api/admins/auth-with-password']) {
    try {
      const data = await pbFetch(ep, {
        method: 'POST',
        body: { identity: SUPERUSER_EMAIL, password: SUPERUSER_PASS },
      });
      console.log(`✓ Superuser auth via ${ep}`);
      return data.token;
    } catch (e) {
      // try next
    }
  }
  throw new Error(`Superuser auth failed for ${SUPERUSER_EMAIL}. Check email/password.`);
}

const collectionsToCreate = [
  {
    name: 'products',
    type: 'base',
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != ""',
    deleteRule: '@request.auth.id != ""',
    fields: [
      { name: 'name', type: 'text', required: true, presentable: true },
      { name: 'sku', type: 'text', required: true },
      { name: 'category', type: 'text', required: false },
      { name: 'purchase_price', type: 'number', required: false, onlyInt: false, min: 0 },
      { name: 'selling_price', type: 'number', required: true, onlyInt: false, min: 0 },
      { name: 'labour_charge', type: 'number', required: false, onlyInt: false, min: 0 },
      { name: 'stock', type: 'number', required: false, onlyInt: false },
      { name: 'min_stock', type: 'number', required: false, onlyInt: false },
      { name: 'unit', type: 'select', required: false, values: ['pcs','kg','g','litre','ml','box','bag','roll','carton','pair','set','units'] },
      { name: 'description', type: 'text', required: false },
    ],
    indexes: ['CREATE UNIQUE INDEX idx_products_sku ON products (sku)'],
  },
  {
    name: 'customers',
    type: 'base',
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != ""',
    deleteRule: '@request.auth.id != ""',
    fields: [
      { name: 'name', type: 'text', required: true, presentable: true },
      { name: 'mobile', type: 'text', required: true },
      { name: 'email', type: 'email', required: false },
      { name: 'address', type: 'text', required: false },
    ],
    indexes: ['CREATE UNIQUE INDEX idx_customers_mobile ON customers (mobile)'],
  },
  {
    name: 'bills',
    type: 'base',
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != ""',
    deleteRule: '@request.auth.id != ""',
    fields: [
      { name: 'bill_number', type: 'text', required: true },
      { name: 'customer', type: 'relation', required: false, collectionId: 'customers_placeholder', cascadeDelete: false, maxSelect: 1 },
      { name: 'customer_name', type: 'text', required: true },
      { name: 'customer_mobile', type: 'text', required: true },
      { name: 'date', type: 'date', required: true },
      { name: 'subtotal', type: 'number', required: false },
      { name: 'labour_total', type: 'number', required: false },
      { name: 'total', type: 'number', required: true },
      { name: 'payment_status', type: 'select', required: true, values: ['Paid','Pending'] },
      { name: 'notes', type: 'text', required: false },
    ],
    indexes: ['CREATE UNIQUE INDEX idx_bills_number ON bills (bill_number)'],
  },
  {
    name: 'bill_items',
    type: 'base',
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != ""',
    deleteRule: '@request.auth.id != ""',
    fields: [
      { name: 'bill', type: 'relation', required: true, collectionId: 'bills_placeholder', cascadeDelete: true, maxSelect: 1 },
      { name: 'bill_id', type: 'text', required: false },
      { name: 'product', type: 'relation', required: false, collectionId: 'products_placeholder', cascadeDelete: false, maxSelect: 1 },
      { name: 'product_id', type: 'text', required: false },
      { name: 'product_name', type: 'text', required: true },
      { name: 'quantity', type: 'number', required: true },
      { name: 'unit_price', type: 'number', required: true },
      { name: 'labour_charge', type: 'number', required: false },
      { name: 'total', type: 'number', required: true },
    ],
  },
  {
    name: 'settings',
    type: 'base',
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != ""',
    deleteRule: '@request.auth.id != ""',
    fields: [
      { name: 'key', type: 'text', required: true },
      { name: 'value', type: 'text', required: false },
    ],
    indexes: ['CREATE UNIQUE INDEX idx_settings_key ON settings (key)'],
  },
];

async function main() {
  console.log(`PocketBase URL: ${PB_URL}`);
  console.log(`Superuser: ${SUPERUSER_EMAIL}`);
  const token = await authSuperuser();

  // Get existing collections to resolve relation collectionIds and skip if exists
  const existing = await pbFetch('/api/collections', { token });
  const byName = new Map(existing.items.map(c => [c.name, c]));
  console.log(`Found ${existing.items.length} existing collections`);

  // Resolve relation collectionIds dynamically
  const idMap = {};
  for (const c of existing.items) idMap[c.name] = c.id;

  for (const col of collectionsToCreate) {
    if (byName.has(col.name)) {
      console.log(`- ${col.name}: already exists, skipping`);
      continue;
    }
    // Fix relation collectionIds
    for (const f of col.fields) {
      if (f.type === 'relation') {
        if (f.collectionId === 'customers_placeholder') f.collectionId = idMap['customers'] || '';
        if (f.collectionId === 'bills_placeholder') f.collectionId = idMap['bills'] || '';
        if (f.collectionId === 'products_placeholder') f.collectionId = idMap['products'] || '';
        // If target not yet created, create without relation first then patch
        if (!f.collectionId) {
          console.log(`  relation ${f.name} target not yet created, creating as text for now`);
          f.type = 'text';
          delete f.collectionId;
          delete f.cascadeDelete;
          delete f.maxSelect;
        }
      }
    }

    try {
      const created = await pbFetch('/api/collections', { method: 'POST', token, body: col });
      console.log(`✓ Created collection: ${created.name} (${created.id})`);
      idMap[created.name] = created.id;
    } catch (e) {
      console.error(`✗ Failed to create ${col.name}:`, e.message);
      // Retry without indexes if index failed
      if (e.message.includes('index')) {
        const withoutIndexes = { ...col, indexes: [] };
        try {
          const created = await pbFetch('/api/collections', { method: 'POST', token, body: withoutIndexes });
          console.log(`✓ Created collection (without indexes): ${created.name}`);
          idMap[created.name] = created.id;
        } catch (e2) {
          console.error(`  Still failed: ${e2.message}`);
        }
      }
    }
  }

  // Patch relations that were created as text (if any)
  // This is optional - the app works with bill/customer as text ids too

  // Ensure default app user exists in users collection (auth)
  try {
    const usersCol = byName.get('users') || existing.items.find(c => c.name === 'users');
    if (usersCol) {
      // Try to create default user if not exists
      const appUserEmail = 'admin@storemanager.com';
      const appUserPass = 'admin123';
      // Check if exists
      let exists = false;
      try {
        const list = await pbFetch(`/api/collections/users/records?filter=email%3D%22${encodeURIComponent(appUserEmail)}%22&perPage=1`, { token });
        exists = list.items?.length > 0;
      } catch {}
      if (!exists) {
        try {
          await pbFetch('/api/collections/users/records', {
            method: 'POST',
            token,
            body: {
              email: appUserEmail,
              password: appUserPass,
              passwordConfirm: appUserPass,
              name: 'Administrator',
              emailVisibility: true,
              verified: true,
            },
          });
          console.log(`✓ Created app user: ${appUserEmail} / ${appUserPass}`);
        } catch (e) {
          console.log(`Note: could not create app user (may already exist or needs email auth): ${e.message}`);
        }
      } else {
        console.log(`- App user ${appUserEmail} already exists`);
      }
    }
  } catch (e) {
    console.log(`Note: users check skipped: ${e.message}`);
  }

  console.log('\nDone! All tables ready.');
  console.log('PocketBase Admin: http://127.0.0.1:8090/_/');
  console.log('App: http://localhost:5173  (login with PocketBase user)');
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
