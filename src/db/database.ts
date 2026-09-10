import { pb } from '../lib/pocketbase';
import type { Product, Customer, Bill, BillItem } from '../types';

// PocketBase-backed database layer
// Collections required in PocketBase:
// - products, customers, bills, bill_items, settings, users (auth)

let initialized = false;

export async function initDatabase(): Promise<void> {
  if (initialized) return;
  // Check PocketBase health
  try {
    await pb.health.check();
  } catch (e) {
    console.warn('PocketBase not reachable at', pb.baseUrl, e);
    // Still mark initialized - UI will show connection error
  }
  // Ensure auth is restored from localStorage
  if (pb.authStore.isValid) {
    try {
      await pb.collection('users').authRefresh();
    } catch {
      pb.authStore.clear();
    }
  }
  initialized = true;
}

export function getDb(): null {
  return null;
}

export function saveDatabase() {
  // No-op for PocketBase (server handles persistence)
}

export async function getNextBillNumber(): Promise<string> {
  try {
    const result = await pb.collection('bills').getList(1, 1, {
      sort: '-bill_number',
    });
    if (result.items.length === 0) return 'INV-1001';
    const last = result.items[0].bill_number as string;
    const num = parseInt(last.replace('INV-', ''), 10);
    if (isNaN(num)) return 'INV-1001';
    return `INV-${num + 1}`;
  } catch {
    return 'INV-1001';
  }
}

export function getNextBillNumberSync(): string {
  // Fallback sync version - generates timestamp-based to avoid race
  return `INV-${Date.now().toString().slice(-6)}`;
}

// Generic helpers
export async function runQuery(_sql: string, _params: any[] = []): Promise<any> {
  console.warn('runQuery is deprecated with PocketBase');
  return null;
}

export async function fetchAllAsync(collection: string, options: any = {}): Promise<any[]> {
  try {
    const result = await pb.collection(collection).getFullList(options);
    return result;
  } catch (e) {
    console.error(`fetchAll ${collection} error:`, e);
    return [];
  }
}

export async function fetchOneAsync(collection: string, idOrFilter: string, options: any = {}): Promise<any | null> {
  try {
    // If it looks like an ID, fetch by ID
    if (!idOrFilter.includes('=') && !idOrFilter.includes(' ')) {
      return await pb.collection(collection).getOne(idOrFilter, options);
    }
    const result = await pb.collection(collection).getList(1, 1, {
      filter: idOrFilter,
      ...options,
    });
    return result.items[0] || null;
  } catch (e) {
    console.error(`fetchOne ${collection} error:`, e);
    return null;
  }
}

export function fetchAll(_sql: string, _params: any[] = []): any[] {
  console.warn('fetchAll sync is deprecated - use fetchAllAsync');
  return [];
}

export function fetchOne(_sql: string, _params: any[] = []): any {
  console.warn('fetchOne sync is deprecated - use fetchOneAsync');
  return null;
}

export async function exportDatabase(): Promise<string> {
  // PocketBase handles backups server-side
  // Return JSON dump for compatibility
  try {
    const products = await pb.collection('products').getFullList();
    const customers = await pb.collection('customers').getFullList();
    const bills = await pb.collection('bills').getFullList();
    const billItems = await pb.collection('bill_items').getFullList();
    const data = { products, customers, bills, bill_items: billItems, exported_at: new Date().toISOString() };
    return btoa(JSON.stringify(data));
  } catch (e) {
    console.error('exportDatabase error', e);
    return '';
  }
}

export async function importDatabase(_base64: string) {
  console.warn('importDatabase not implemented for PocketBase - use PocketBase admin backup');
}

export async function deleteAllExceptBills() {
  try {
    const products = await pb.collection('products').getFullList();
    for (const p of products) await pb.collection('products').delete(p.id);
    const customers = await pb.collection('customers').getFullList();
    for (const c of customers) await pb.collection('customers').delete(c.id);
  } catch (e) {
    console.error('deleteAllExceptBills error', e);
    throw e;
  }
}

export async function deleteAllData() {
  try {
    const bills = await pb.collection('bills').getFullList();
    for (const b of bills) await pb.collection('bills').delete(b.id);
    const billItems = await pb.collection('bill_items').getFullList();
    for (const bi of billItems) await pb.collection('bill_items').delete(bi.id);
    const products = await pb.collection('products').getFullList();
    for (const p of products) await pb.collection('products').delete(p.id);
    const customers = await pb.collection('customers').getFullList();
    for (const c of customers) await pb.collection('customers').delete(c.id);
  } catch (e) {
    console.error('deleteAllData error', e);
    throw e;
  }
}

// PocketBase CRUD helpers
export async function pbCreate(collection: string, data: any) {
  return await pb.collection(collection).create(data);
}

export async function pbUpdate(collection: string, id: string, data: any) {
  return await pb.collection(collection).update(id, data);
}

export async function pbDelete(collection: string, id: string) {
  return await pb.collection(collection).delete(id);
}

export async function pbGetList(collection: string, page = 1, perPage = 100, options: any = {}) {
  return await pb.collection(collection).getList(page, perPage, options);
}

export async function pbGetFullList(collection: string, options: any = {}) {
  return await pb.collection(collection).getFullList(options);
}
