import { pb } from './pocketbase';
import type { Bill, BillItem, Customer, Product } from '../types';

export { pb };

// Formatting helpers (pure, no DB)
export function formatCurrency(amount: number): string {
  return `₹${Number(amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export function formatCurrencyWhole(amount: number): string {
  return `₹${Number(amount || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 0
  })}`;
}

export function formatNumber(num: number): string {
  return Number(num || 0).toLocaleString('en-IN');
}

function parseSafeDate(dateStr?: string): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  // Handle PocketBase format "2026-09-03 07:37:27.948Z" (space) -> "2026-09-03T07:37:27.948Z"
  // Handle "2026-09-03 00:00:00.000Z" -> T, handle "2026-09-03" -> keep
  let s = dateStr.trim();
  if (!s) return null;
  // Extract YYYY-MM-DD part if full datetime
  // PocketBase may store date as "2026-09-03" or "2026-09-03 00:00:00.000Z"
  // For date-only bills, keep as YYYY-MM-DD
  // For timestamp, convert space to T for reliable parsing
  if (s.includes(' ') && s.includes('Z')) {
    s = s.replace(' ', 'T');
  }
  // If it's YYYY-MM-DD with time without T, fix
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) {
    s = s.replace(' ', 'T');
  }
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d;
}

function getSafeDate(dateStr?: string): Date {
  if (!dateStr) return new Date();
  const parsed = parseSafeDate(dateStr);
  if (parsed && !isNaN(parsed.getTime())) return parsed;
  // Fallback to current date if invalid
  console.warn('[Date] Invalid date string, using current date:', dateStr);
  return new Date();
}

export function getISTDate(dateString?: string): string {
  try {
    const now = dateString ? getSafeDate(dateString) : new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const y = parts.find(p => p.type === 'year')?.value || '2026';
    const m = parts.find(p => p.type === 'month')?.value || '01';
    const d = parts.find(p => p.type === 'day')?.value || '01';
    // Validate parts are numeric
    if (isNaN(Number(y)) || isNaN(Number(m)) || isNaN(Number(d))) {
      throw new Error('Invalid date parts');
    }
    return `${y}-${m}-${d}`;
  } catch (e) {
    console.warn('[getISTDate] fallback to today due to error:', e, dateString);
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    return `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}-${parts.find(p => p.type === 'day')?.value}`;
  }
}

export function formatDisplayDate(dateStr: string): string {
  if (!dateStr || typeof dateStr !== 'string') {
    // Fallback to current date
    dateStr = getISTDate();
  }
  // Extract YYYY-MM-DD part (handles "2026-09-03 00:00:00.000Z" or "2026-09-03T00:00:00Z")
  const datePart = dateStr.trim().split(' ')[0].split('T')[0];
  const match = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    console.warn('[formatDisplayDate] Invalid date format, using current date:', dateStr);
    const fallback = getSafeDate();
    return fallback.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    });
  }
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (isNaN(y) || isNaN(m) || isNaN(d) || m < 1 || m > 12 || d < 1 || d > 31) {
    console.warn('[formatDisplayDate] Invalid date values:', dateStr);
    const fallback = getSafeDate();
    return fallback.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    });
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (isNaN(date.getTime())) {
    const fallback = getSafeDate();
    return fallback.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    });
  }
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

export function formatFullDate(date: Date): string {
  if (!date || isNaN(date.getTime())) {
    date = new Date();
  }
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

export function getISTTime(dateString?: string): string {
  try {
    const now = dateString ? getSafeDate(dateString) : new Date();
    if (isNaN(now.getTime())) throw new Error('Invalid date');
    return now.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    });
  } catch {
    return new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    });
  }
}

export function getISTDateTime(dateString?: string): string {
  return `${getISTDate(dateString)} ${getISTTime(dateString)}`;
}

export function formatDisplayDateTime(dateStr: string, timeStr?: string): string {
  if (!dateStr || typeof dateStr !== 'string') {
    return formatDisplayDate(getISTDate());
  }
  const datePart = formatDisplayDate(dateStr);
  if (timeStr && timeStr !== 'Invalid Date') return `${datePart} ${timeStr}`;
  // Try to extract time from created_at if available
  const parsed = parseSafeDate(dateStr);
  if (parsed) {
    const t = parsed.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
    if (t !== 'Invalid Date') return `${datePart} ${t}`;
  }
  return datePart;
}

export function getCurrentISTDateTime(): { date: string; time: string; dateTime: string } {
  const now = new Date();
  return {
    date: getISTDate(),
    time: getISTTime(),
    dateTime: `${formatDisplayDate(getISTDate())} ${getISTTime()}`,
  };
}

// PocketBase helpers
function logPbError(context: string, e: any) {
  const details = {
    context,
    status: e?.status,
    message: e?.message,
    data: e?.data,
    originalError: e?.originalError,
    url: e?.url,
    isValid: pb.authStore.isValid,
  };
  console.error(`[PB] ${context} failed`, details, e);
}

function isAuthError(e: any): boolean {
  return e?.status === 401 || e?.status === 403;
}

function escapeFilterValue(v: string): string {
  return v.replace(/"/g, '\\"');
}

// Mappers
function mapProduct(r: any): Product {
  return {
    id: r.id,
    name: r.name || '',
    sku: r.sku || '',
    category: r.category || 'General',
    purchase_price: Number(r.purchase_price || 0),
    selling_price: Number(r.selling_price || 0),
    labour_charge: Number(r.labour_charge || 0),
    stock: Number(r.stock || 0),
    min_stock: Number(r.min_stock || 10),
    unit: r.unit || 'pcs',
    description: r.description || '',
    created_at: r.created || r.created_at || '',
  };
}

function mapCustomer(r: any): Customer {
  return {
    id: r.id,
    name: r.name || '',
    mobile: r.mobile || '',
    email: r.email || '',
    address: r.address || '',
    created_at: r.created || r.created_at || '',
  };
}

function mapBillItem(r: any): BillItem {
  return {
    id: r.id,
    bill_id: r.bill_id || r.bill || '',
    product_id: r.product_id || r.product || '',
    product_name: r.product_name || '',
    quantity: Number(r.quantity || 0),
    unit_price: Number(r.unit_price || 0),
    labour_charge: Number(r.labour_charge || 0),
    total: Number(r.total || 0),
  };
}

function mapBill(r: any, items: BillItem[] = []): Bill {
  const total = Number(r.total || 0);
  const paid = r.paid_amount != null ? Number(r.paid_amount) : (r.payment_status === 'Paid' ? total : 0);
  const remaining = r.remaining_amount != null ? Number(r.remaining_amount) : (total - paid);
  return {
    id: r.id,
    bill_number: r.bill_number || '',
    customer_id: r.customer_id || r.customer || '',
    customer_name: r.customer_name || r.expand?.customer?.name || '',
    customer_mobile: r.customer_mobile || r.expand?.customer?.mobile || '',
    date: r.date || getISTDate(r.created),
    subtotal: Number(r.subtotal || 0),
    labour_total: Number(r.labour_total || 0),
    total,
    payment_status: (r.payment_status as 'Paid' | 'Pending') || (remaining <= 0 ? 'Paid' : 'Pending'),
    payment_method: r.payment_method || (r.payment_status === 'Paid' ? 'Cash' : 'Pending'),
    paid_amount: paid,
    remaining_amount: Math.max(0, remaining),
    due_date: r.due_date || '',
    notes: r.notes || '',
    created_at: r.created || r.created_at || '',
    items,
  };
}

function mapPayment(r: any): import('../types').Payment {
  return {
    id: r.id,
    bill: r.bill || r.bill_id || '',
    bill_id: r.bill_id || r.bill || '',
    bill_number: r.bill_number || '',
    customer: r.customer || '',
    customer_name: r.customer_name || '',
    customer_mobile: r.customer_mobile || '',
    amount: Number(r.amount || 0),
    payment_method: r.payment_method || 'Cash',
    payment_date: r.payment_date || r.created || '',
    notes: r.notes || '',
    created_at: r.created || '',
  };
}

// Async data access (PocketBase) - all with safe error handling and no 'created' sort
export async function getProducts(): Promise<Product[]> {
  if (!pb.authStore.isValid) {
    console.warn('[PB] getProducts skipped: not authenticated');
    return [];
  }
  try {
    const records = await pb.collection('products').getFullList({ sort: 'name' });
    return records.map(mapProduct);
  } catch (e: any) {
    logPbError('getProducts', e);
    // Retry without sort if sort failed
    if (e?.status === 400) {
      try {
        const retry = await pb.collection('products').getFullList();
        return retry.map(mapProduct);
      } catch (e2: any) {
        logPbError('getProducts retry', e2);
      }
    }
    return [];
  }
}

export async function getProduct(id: string): Promise<Product | null> {
  if (!pb.authStore.isValid) return null;
  try {
    const r = await pb.collection('products').getOne(id);
    return mapProduct(r);
  } catch (e: any) {
    if (!isAuthError(e)) logPbError('getProduct', e);
    return null;
  }
}

export async function getCustomers(): Promise<Customer[]> {
  if (!pb.authStore.isValid) {
    console.warn('[PB] getCustomers skipped: not authenticated');
    return [];
  }
  try {
    const records = await pb.collection('customers').getFullList({ sort: 'name' });
    return records.map(mapCustomer);
  } catch (e: any) {
    logPbError('getCustomers', e);
    if (e?.status === 400) {
      try {
        const retry = await pb.collection('customers').getFullList();
        return retry.map(mapCustomer);
      } catch (e2: any) {
        logPbError('getCustomers retry', e2);
      }
    }
    return [];
  }
}

export async function getCustomerByMobile(mobile: string): Promise<Customer | null> {
  if (!pb.authStore.isValid) return null;
  try {
    const result = await pb.collection('customers').getList(1, 1, {
      filter: `mobile = "${escapeFilterValue(mobile)}"`,
    });
    if (result.items.length === 0) return null;
    return mapCustomer(result.items[0]);
  } catch (e: any) {
    logPbError('getCustomerByMobile', e);
    return null;
  }
}

export async function getBills(): Promise<Bill[]> {
  if (!pb.authStore.isValid) {
    console.warn('[PB] getBills skipped: not authenticated');
    return [];
  }
  try {
    // Use only '-date' and '-bill_number' for sorting - 'created' is not sortable on base collections (400 error)
    let billsRaw: any[] = [];
    try {
      billsRaw = await pb.collection('bills').getFullList({ sort: '-date', expand: 'customer' });
    } catch (e: any) {
      logPbError('getBills primary', e);
      // Fallback without expand and with safe sort
      try {
        billsRaw = await pb.collection('bills').getFullList({ sort: '-date' });
      } catch (e2: any) {
        logPbError('getBills fallback sort', e2);
        billsRaw = await pb.collection('bills').getFullList();
      }
    }

    // Fetch all bill_items in one query
    let itemsByBill: Record<string, BillItem[]> = {};
    try {
      const allItems = await pb.collection('bill_items').getFullList();
      for (const it of allItems) {
        const mapped = mapBillItem(it);
        const bid = mapped.bill_id as string;
        if (!bid) continue;
        if (!itemsByBill[bid]) itemsByBill[bid] = [];
        itemsByBill[bid].push(mapped);
      }
    } catch (e: any) {
      // No items or permission
      if (!isAuthError(e)) logPbError('getBills items', e);
    }
    return billsRaw.map(r => mapBill(r, itemsByBill[r.id] || []));
  } catch (e: any) {
    logPbError('getBills outer', e);
    return [];
  }
}

export async function getBill(id: string): Promise<Bill | null> {
  if (!pb.authStore.isValid) return null;
  try {
    const r = await pb.collection('bills').getOne(id, { expand: 'customer' });
    let items: BillItem[] = [];
    try {
      const itemsRaw = await pb.collection('bill_items').getFullList({ filter: `bill_id = "${escapeFilterValue(id)}"` });
      items = (itemsRaw as any[]).map(mapBillItem);
      if (items.length === 0) {
        const alt = await pb.collection('bill_items').getFullList({ filter: `bill = "${escapeFilterValue(id)}"` });
        if (alt.length > 0) items = alt.map(mapBillItem);
      }
    } catch (e: any) {
      logPbError('getBill items', e);
    }
    return mapBill(r, items);
  } catch (e: any) {
    logPbError('getBill', e);
    return null;
  }
}

export async function getBillItems(billId: string): Promise<BillItem[]> {
  if (!pb.authStore.isValid) return [];
  try {
    const safeId = escapeFilterValue(billId);
    const records = await pb.collection('bill_items').getFullList({ filter: `bill_id = "${safeId}" || bill = "${safeId}"` });
    return records.map(mapBillItem);
  } catch (e: any) {
    logPbError('getBillItems', e);
    return [];
  }
}

export async function getCustomerLedger(customerId: string) {
  if (!pb.authStore.isValid) return { bills: [] as Bill[], totalOutstanding: 0, totalPaid: 0 };
  try {
    const safeId = escapeFilterValue(customerId);
    const bills = await pb.collection('bills').getFullList({
      filter: `customer = "${safeId}" || customer_id = "${safeId}"`,
      sort: '-date',
    });
    let totalOutstanding = 0;
    let totalPaid = 0;
    const mapped = bills.map(r => mapBill(r));
    for (const b of mapped) {
      const total = Number(b.total || 0);
      if (b.payment_status === 'Pending') totalOutstanding += total;
      else totalPaid += total;
    }
    return { bills: mapped, totalOutstanding, totalPaid };
  } catch (e: any) {
    logPbError('getCustomerLedger', e);
    // Retry without sort
    try {
      const safeId = escapeFilterValue(customerId);
      const bills = await pb.collection('bills').getFullList({
        filter: `customer = "${safeId}" || customer_id = "${safeId}"`,
      });
      let totalOutstanding = 0;
      let totalPaid = 0;
      const mapped = bills.map(r => mapBill(r));
      for (const b of mapped) {
        const total = Number(b.total || 0);
        if (b.payment_status === 'Pending') totalOutstanding += total;
        else totalPaid += total;
      }
      return { bills: mapped, totalOutstanding, totalPaid };
    } catch {}
    return { bills: [] as Bill[], totalOutstanding: 0, totalPaid: 0 };
  }
}

export async function getDashboardStats() {
  if (!pb.authStore.isValid) {
    return { todaySales: 0, totalProducts: 0, lowStock: 0, totalCustomers: 0, monthlySales: 0, pendingPayments: 0, todayBillCount: 0 };
  }
  try {
    const today = getISTDate();
    const firstOfMonth = new Date();
    firstOfMonth.setDate(1);
    const monthStart = getISTDate(firstOfMonth.toISOString());

    const [allBills, products, customers] = await Promise.all([
      pb.collection('bills').getFullList().catch((e: any) => { logPbError('getDashboardStats bills', e); return []; }),
      pb.collection('products').getFullList().catch((e: any) => { logPbError('getDashboardStats products', e); return []; }),
      pb.collection('customers').getFullList().catch((e: any) => { logPbError('getDashboardStats customers', e); return []; }),
    ]);

    const todaySales = allBills.filter((b: any) => b.date === today).reduce((s: number, b: any) => s + Number(b.total || 0), 0);
    const todayBillCount = allBills.filter((b: any) => b.date === today).length;
    const totalProducts = products.length;
    const lowStock = products.filter((p: any) => Number(p.stock || 0) <= Number(p.min_stock || 10)).length;
    const totalCustomers = customers.length;
    const monthlySales = allBills.filter((b: any) => (b.date || '') >= monthStart).reduce((s: number, b: any) => s + Number(b.total || 0), 0);
    const pendingPayments = allBills.filter((b: any) => b.payment_status === 'Pending').reduce((s: number, b: any) => s + Number(b.total || 0), 0);

    return { todaySales, totalProducts, lowStock, totalCustomers, monthlySales, pendingPayments, todayBillCount };
  } catch (e: any) {
    logPbError('getDashboardStats', e);
    return { todaySales: 0, totalProducts: 0, lowStock: 0, totalCustomers: 0, monthlySales: 0, pendingPayments: 0, todayBillCount: 0 };
  }
}

// CRUD with safe error handling
export async function createProduct(data: Partial<Product>) {
  try {
    const record = await pb.collection('products').create({
      name: data.name?.trim(),
      sku: data.sku?.trim(),
      category: data.category || 'General',
      purchase_price: Number(data.purchase_price || 0),
      selling_price: Number(data.selling_price || 0),
      labour_charge: Number(data.labour_charge || 0),
      stock: Number(data.stock || 0),
      min_stock: Number(data.min_stock || 10),
      unit: data.unit || 'pcs',
      description: data.description || '',
    });
    return mapProduct(record);
  } catch (e: any) {
    logPbError('createProduct', e);
    throw e;
  }
}

export async function updateProduct(id: string, data: Partial<Product>) {
  try {
    const record = await pb.collection('products').update(id, {
      name: data.name?.trim(),
      sku: data.sku?.trim(),
      category: data.category,
      purchase_price: data.purchase_price,
      selling_price: data.selling_price,
      labour_charge: data.labour_charge,
      stock: data.stock,
      min_stock: data.min_stock,
      unit: data.unit,
      description: data.description,
    });
    return mapProduct(record);
  } catch (e: any) {
    logPbError('updateProduct', e);
    throw e;
  }
}

export async function deleteProduct(id: string) {
  try {
    const refs = await pb.collection('bill_items').getList(1, 1, { filter: `product = "${escapeFilterValue(id)}" || product_id = "${escapeFilterValue(id)}"` });
    if (refs.totalItems > 0) throw new Error('Cannot delete product with existing bill history');
  } catch (e: any) {
    if (e.message?.includes('Cannot delete')) throw e;
    // If filter fails, log but continue to delete attempt
    if (e?.status !== 400) logPbError('deleteProduct check', e);
  }
  try {
    await pb.collection('products').delete(id);
  } catch (e: any) {
    logPbError('deleteProduct', e);
    throw e;
  }
}

export async function createCustomer(data: Partial<Customer>) {
  try {
    const record = await pb.collection('customers').create({
      name: data.name?.trim(),
      mobile: data.mobile?.trim(),
      email: data.email?.trim() || '',
      address: data.address?.trim() || '',
    });
    return mapCustomer(record);
  } catch (e: any) {
    logPbError('createCustomer', e);
    throw e;
  }
}

export async function updateCustomer(id: string, data: Partial<Customer>) {
  try {
    const record = await pb.collection('customers').update(id, data);
    return mapCustomer(record);
  } catch (e: any) {
    logPbError('updateCustomer', e);
    throw e;
  }
}

export async function deleteCustomer(id: string) {
  try {
    const refs = await pb.collection('bills').getList(1, 1, { filter: `customer = "${escapeFilterValue(id)}" || customer_id = "${escapeFilterValue(id)}"` });
    if (refs.totalItems > 0) throw new Error('Cannot delete customer with existing bills');
  } catch (e: any) {
    if (e.message?.includes('Cannot delete')) throw e;
    if (e?.status !== 400) logPbError('deleteCustomer check', e);
  }
  try {
    await pb.collection('customers').delete(id);
  } catch (e: any) {
    logPbError('deleteCustomer', e);
    throw e;
  }
}

export async function getPaymentsForBill(billId: string): Promise<import('../types').Payment[]> {
  if (!pb.authStore.isValid) return [];
  try {
    const recs = await pb.collection('payments').getFullList({ filter: `bill = "${escapeFilterValue(billId)}"`, sort: '-payment_date' });
    return recs.map(mapPayment);
  } catch (e: any) {
    logPbError('getPaymentsForBill', e);
    return [];
  }
}

export async function getPaymentsForCustomer(customerId: string): Promise<import('../types').Payment[]> {
  if (!pb.authStore.isValid) return [];
  try {
    const recs = await pb.collection('payments').getFullList({ filter: `customer = "${escapeFilterValue(customerId)}"`, sort: '-payment_date' });
    return recs.map(mapPayment);
  } catch (e: any) {
    logPbError('getPaymentsForCustomer', e);
    return [];
  }
}

export async function addPayment(billId: string, amount: number, method: string, date: string, notes?: string): Promise<import('../types').Payment> {
  if (!pb.authStore.isValid) throw new Error('Not authenticated');
  const bill: any = await pb.collection('bills').getOne(billId);
  const total = Number(bill.total || 0);
  const currentPaid = Number(bill.paid_amount ?? (bill.payment_status === 'Paid' ? total : 0));
  const newPaid = currentPaid + Number(amount);
  const remaining = Math.max(0, total - newPaid);
  const newStatus = remaining <= 0.01 ? 'Paid' : 'Pending';

  // Create payment record
  const payment = await pb.collection('payments').create({
    bill: billId,
    bill_number: bill.bill_number,
    customer: bill.customer,
    customer_name: bill.customer_name,
    customer_mobile: bill.customer_mobile,
    amount: Number(amount),
    payment_method: method,
    payment_date: date,
    notes: notes || '',
  });

  // Update bill
  await pb.collection('bills').update(billId, {
    paid_amount: newPaid,
    remaining_amount: remaining,
    payment_status: newStatus,
    payment_method: newStatus === 'Paid' ? method : bill.payment_method,
  });

  return mapPayment(payment);
}

export async function getCustomerCreditSummary(customerId: string) {
  if (!pb.authStore.isValid) return { bills: [] as Bill[], totalCredit: 0, totalPaid: 0, totalRemaining: 0, totalBills: 0, pendingBills: 0 };
  try {
    const bills = await pb.collection('bills').getFullList({ filter: `customer = "${escapeFilterValue(customerId)}"`, sort: '-date' });
    const mapped = bills.map((r: any) => mapBill(r, []));
    let totalCredit = 0;
    let totalPaid = 0;
    let totalRemaining = 0;
    let pendingBills = 0;
    for (const b of mapped) {
      totalCredit += Number(b.total || 0);
      const paid = Number((b as any).paid_amount ?? (b.payment_status === 'Paid' ? b.total : 0));
      const remaining = Number((b as any).remaining_amount ?? (b.total - paid));
      totalPaid += paid;
      totalRemaining += Math.max(0, remaining);
      if (b.payment_status === 'Pending' || remaining > 0.01) pendingBills++;
    }
    return { bills: mapped, totalCredit, totalPaid, totalRemaining, totalBills: mapped.length, pendingBills };
  } catch (e: any) {
    logPbError('getCustomerCreditSummary', e);
    return { bills: [] as Bill[], totalCredit: 0, totalPaid: 0, totalRemaining: 0, totalBills: 0, pendingBills: 0 };
  }
}

export async function getAllCreditCustomers(): Promise<Array<{ customer_id: string; customer_name: string; customer_mobile: string; totalRemaining: number; totalPaid: number; totalCredit: number; pendingBills: number; lastDueDate?: string }>> {
  if (!pb.authStore.isValid) return [];
  try {
    const bills = await pb.collection('bills').getFullList({ filter: `remaining_amount > 0 || payment_status = 'Pending'` });
    const map: Record<string, any> = {};
    for (const b of bills) {
      const cid = b.customer || b.customer_id || b.customer_name;
      const key = b.customer || `${b.customer_name}||${b.customer_mobile}`;
      if (!map[key]) {
        map[key] = { customer_id: b.customer || '', customer_name: b.customer_name, customer_mobile: b.customer_mobile, totalRemaining: 0, totalPaid: 0, totalCredit: 0, pendingBills: 0, lastDueDate: '' };
      }
      const total = Number(b.total || 0);
      const paid = Number(b.paid_amount ?? (b.payment_status === 'Paid' ? total : 0));
      const remaining = Number(b.remaining_amount ?? (total - paid));
      map[key].totalCredit += total;
      map[key].totalPaid += paid;
      map[key].totalRemaining += Math.max(0, remaining);
      map[key].pendingBills += 1;
      if (b.due_date && (!map[key].lastDueDate || b.due_date > map[key].lastDueDate)) map[key].lastDueDate = b.due_date;
    }
    return Object.values(map).filter((c: any) => c.totalRemaining > 0.01).sort((a: any, b: any) => b.totalRemaining - a.totalRemaining);
  } catch (e: any) {
    logPbError('getAllCreditCustomers', e);
    return [];
  }
}

export async function getNextBillNumber(): Promise<string> {
  if (!pb.authStore.isValid) return 'INV-1001';
  try {
    const result = await pb.collection('bills').getList(1, 1, { sort: '-bill_number', fields: 'bill_number' });
    if (result.items.length === 0) return 'INV-1001';
    const last = result.items[0].bill_number as string;
    const num = parseInt(last.replace('INV-', ''), 10);
    if (isNaN(num)) return 'INV-1001';
    return `INV-${num + 1}`;
  } catch (e: any) {
    logPbError('getNextBillNumber', e);
    return 'INV-1001';
  }
}

export function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportToCSV(bills: Bill[], filename: string) {
  const header = ['Bill No', 'Customer', 'Mobile', 'Date', 'Subtotal', 'Labour', 'Total', 'Payment Status'];
  const rows = bills.map(b => [
    b.bill_number,
    b.customer_name,
    b.customer_mobile,
    b.date,
    b.subtotal,
    b.labour_total,
    b.total,
    b.payment_status
  ]);
  const csv = [header, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  downloadFile('\uFEFF' + csv, filename, 'text/csv');
}

export async function getSetting(key: string): Promise<string | null> {
  if (!pb.authStore.isValid) return null;
  try {
    const result = await pb.collection('settings').getList(1, 1, { filter: `key = "${escapeFilterValue(key)}"` });
    if (result.items.length === 0) return null;
    return result.items[0].value as string;
  } catch (e: any) {
    if (!isAuthError(e)) logPbError('getSetting', e);
    return null;
  }
}

export async function setSetting(key: string, value: string) {
  if (!pb.authStore.isValid) throw new Error('Not authenticated');
  try {
    const existing = await pb.collection('settings').getList(1, 1, { filter: `key = "${escapeFilterValue(key)}"` });
    if (existing.items.length > 0) {
      await pb.collection('settings').update(existing.items[0].id, { value });
    } else {
      await pb.collection('settings').create({ key, value });
    }
  } catch (e: any) {
    logPbError('setSetting', e);
    throw e;
  }
}
