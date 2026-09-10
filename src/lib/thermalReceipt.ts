// Thermal Receipt Data Model and Renderer for 80mm / 58mm
import { formatCurrency, formatDisplayDate, getISTTime } from './utils';
import type { Bill } from '../types';
import { getSetting } from './utils';

export type PaperSize = '80mm' | '58mm';
export type DocumentType = 'Estimate' | 'Cash Memo' | 'Tax Invoice' | 'Sales Bill' | 'Receipt';
export type PaymentMethod = 'Cash' | 'UPI' | 'Credit' | 'Card' | 'Bank Transfer' | 'Pending' | string;

export interface PaperProfile {
  size: PaperSize;
  contentWidthMm: number;
  columns: number;
  charWidthMm: number;
}

export const PAPER_PROFILES: Record<PaperSize, PaperProfile> = {
  '80mm': { size: '80mm', contentWidthMm: 72, columns: 48, charWidthMm: 72 / 48 },
  '58mm': { size: '58mm', contentWidthMm: 48, columns: 32, charWidthMm: 48 / 32 },
};

export interface ThermalBusiness {
  name: string;
  address: string;
  phone: string;
  email: string;
  taxNumber: string;
  website: string;
  logo?: string;
}

export interface ThermalCustomer {
  name: string;
  phone: string;
  address: string;
}

export interface ThermalItem {
  name: string;
  sku?: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
  discount?: number;
  tax?: number;
}

export interface ThermalTotals {
  subtotal: number;
  discount: number;
  tax: number;
  charges: number;
  roundOff: number;
  grandTotal: number;
  paid: number;
  balance: number;
  currency: string;
}

export interface ThermalPayment {
  method: PaymentMethod;
  paid: number;
  balance: number;
}

export interface ThermalFooter {
  thankYouMessage: string;
  terms: string;
  showLogo: boolean;
  showCustomerDetails: boolean;
  showSku: boolean;
  showTax: boolean;
  showFooter: boolean;
}

export interface ThermalReceiptData {
  documentType: DocumentType;
  documentNumber: string;
  date: string;
  time: string;
  business: ThermalBusiness;
  customer: ThermalCustomer;
  items: ThermalItem[];
  totals: ThermalTotals;
  payment: ThermalPayment;
  footer: ThermalFooter;
  isReprint?: boolean;
  salesperson?: string;
}

// Helper: pad string
function pad(str: string, len: number, align: 'left' | 'right' | 'center' = 'left'): string {
  if (str.length >= len) return str.slice(0, len);
  const diff = len - str.length;
  if (align === 'left') return str + ' '.repeat(diff);
  if (align === 'right') return ' '.repeat(diff) + str;
  const left = Math.floor(diff / 2);
  const right = diff - left;
  return ' '.repeat(left) + str + ' '.repeat(right);
}

function formatAmount(amount: number, currency: string = '₹'): string {
  const formatted = Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency + formatted;
}

function formatAmountPlain(amount: number): string {
  return Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function separator(columns: number, char: string = '='): string {
  return char.repeat(columns);
}

function centerText(text: string, columns: number): string {
  return pad(text, columns, 'center');
}

// Wrap long product names without breaking columns
function wrapProductName(name: string, maxWidth: number): string[] {
  const words = name.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length <= maxWidth) {
      current = (current + ' ' + word).trim();
    } else {
      if (current) lines.push(current);
      if (word.length > maxWidth) {
        // Hard wrap long word
        for (let i = 0; i < word.length; i += maxWidth) {
          lines.push(word.slice(i, i + maxWidth));
        }
        current = '';
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [name.slice(0, maxWidth)];
}

export async function buildReceiptData(bill: Bill, documentType: DocumentType = 'Tax Invoice'): Promise<ThermalReceiptData> {
  const businessName = (await getSetting('store_name')) || 'BusinessDesk';
  const businessAddress = (await getSetting('store_address')) || '';
  const businessPhone = (await getSetting('store_phone')) || '';
  const businessEmail = (await getSetting('store_email')) || '';
  const taxNumber = (await getSetting('store_tax_number')) || (await getSetting('store_gstin')) || '';
  const website = (await getSetting('store_website')) || '';
  const thankYou = (await getSetting('receipt_thank_you')) || '*** Thank You ***';
  const terms = (await getSetting('receipt_terms')) || '1. Payment due as per terms above.\n2. Computer-generated receipt.';
  const currency = (await getSetting('currency')) || '₹';

  // Check printer settings for what to show
  const showCustomerDetails = (await getSetting('print_customer_details')) !== 'false';
  const showSku = (await getSetting('print_sku')) === 'true';
  const showTax = (await getSetting('print_tax')) === 'true';
  const showFooter = (await getSetting('print_footer')) !== 'false';
  const showLogo = (await getSetting('print_logo')) === 'true';

  const billTime = bill.created_at ? getISTTime(bill.created_at) : getISTTime();
  const billDate = formatDisplayDate(bill.date);
  // Handle time separately
  const timeStr = billTime;

  const items: ThermalItem[] = bill.items.map(item => ({
    name: item.product_name,
    sku: (item as any).sku || '',
    quantity: item.quantity,
    unit: (item as any).unit || '',
    rate: item.unit_price,
    amount: item.unit_price * item.quantity,
    discount: 0,
    tax: 0,
  }));

  const paid = (bill as any).paid_amount != null ? Number((bill as any).paid_amount) : (bill.payment_status === 'Paid' ? bill.total : 0);
  const balance = Math.max(0, bill.total - paid);

  return {
    documentType,
    documentNumber: bill.bill_number,
    date: billDate,
    time: timeStr,
    business: {
      name: businessName,
      address: businessAddress,
      phone: businessPhone,
      email: businessEmail,
      taxNumber,
      website,
    },
    customer: {
      name: bill.customer_name || '',
      phone: bill.customer_mobile || '',
      address: (bill as any).customer_address || '',
    },
    items,
    totals: {
      subtotal: bill.subtotal,
      discount: 0,
      tax: 0,
      charges: bill.labour_total,
      roundOff: 0,
      grandTotal: bill.total,
      paid,
      balance,
      currency,
    },
    payment: {
      method: (bill as any).payment_method || bill.payment_status,
      paid,
      balance,
    },
    footer: {
      thankYouMessage: thankYou,
      terms,
      showLogo,
      showCustomerDetails,
      showSku,
      showTax,
      showFooter,
    },
    salesperson: (bill as any).salesperson || '',
  };
}

export function renderThermalText(data: ThermalReceiptData, paperSize: PaperSize = '80mm'): string {
  const profile = PAPER_PROFILES[paperSize];
  const cols = profile.columns;
  const lines: string[] = [];

  const sepEq = separator(cols, '=');
  const sepDash = separator(cols, '-');

  // Header
  lines.push(sepEq);
  lines.push(centerText(data.business.name.toUpperCase().slice(0, cols), cols));
  if (data.business.address) {
    const addrLines = wrapProductName(data.business.address, cols);
    addrLines.forEach(l => lines.push(centerText(l, cols)));
  }
  if (data.business.phone) lines.push(centerText(`Phone: ${data.business.phone}`, cols));
  if (data.business.email) lines.push(centerText(data.business.email, cols));
  if (data.business.taxNumber) lines.push(centerText(`GSTIN: ${data.business.taxNumber}`, cols));
  if (data.business.website) lines.push(centerText(data.business.website, cols));
  lines.push('');
  lines.push(centerText(data.documentType.toUpperCase(), cols));
  lines.push(sepEq);
  lines.push('');

  // Bill info
  const billNoLabel = data.documentType === 'Estimate' ? 'Estimate No' : data.documentType === 'Tax Invoice' ? 'Invoice No' : 'Bill No';
  lines.push(pad(`${billNoLabel} : ${data.documentNumber}`, cols, 'left'));
  lines.push(pad(`Date    : ${data.date}`, cols, 'left'));
  if (data.time) lines.push(pad(`Time    : ${data.time}`, cols, 'left'));
  if (data.salesperson) lines.push(pad(`Sales By: ${data.salesperson}`, cols, 'left'));
  lines.push('');

  // Customer
  if (data.footer.showCustomerDetails && (data.customer.name || data.customer.phone)) {
    if (data.customer.name) lines.push(pad(`Customer: ${data.customer.name}`, cols, 'left'));
    if (data.customer.phone) lines.push(pad(`Phone   : ${data.customer.phone}`, cols, 'left'));
    if (data.customer.address) {
      const addrLines = wrapProductName(data.customer.address, cols);
      addrLines.forEach((l, idx) => {
        if (idx === 0) lines.push(pad(`Address : ${l}`, cols, 'left'));
        else lines.push(pad(`          ${l}`, cols, 'left'));
      });
    }
    lines.push('');
  }

  if (data.isReprint) {
    lines.push(centerText('*** REPRINT ***', cols));
    lines.push('');
  }

  // Items header
  lines.push(sepDash);
  if (paperSize === '80mm') {
    // 80mm: ITEM NAME (24) | QTY (6) | RATE (10) | AMOUNT (12) = 52, but we have 48 cols, so adjust
    // Use: ITEM (20) QTY (5) RATE (9) AMOUNT (14) = 48
    lines.push(pad('ITEM NAME', 20, 'left') + pad('QTY', 5, 'right') + pad('RATE', 9, 'right') + pad('AMOUNT', 14, 'right'));
  } else {
    // 58mm: ITEM (14) QTY (4) RATE (7) AMOUNT (7) = 32
    lines.push(pad('ITEM', 14, 'left') + pad('QTY', 4, 'right') + pad('RATE', 7, 'right') + pad('AMT', 7, 'right'));
  }
  lines.push(sepDash);

  // Items
  const currency = data.totals.currency;
  for (const item of data.items) {
    const maxNameWidth = paperSize === '80mm' ? 20 : 14;
    const nameLines = wrapProductName(item.name, maxNameWidth);
    const qtyStr = String(item.quantity);
    const rateStr = formatAmountPlain(item.rate);
    const amtStr = formatAmountPlain(item.amount);

    if (paperSize === '80mm') {
      // First line with qty/rate/amount
      const firstName = nameLines[0] || '';
      lines.push(pad(firstName, 20, 'left') + pad(qtyStr, 5, 'right') + pad(rateStr, 9, 'right') + pad(amtStr, 14, 'right'));
      // Additional lines for long names (without qty/rate/amount)
      for (let i = 1; i < nameLines.length; i++) {
        lines.push(pad(nameLines[i], 20, 'left') + pad('', 5, 'right') + pad('', 9, 'right') + pad('', 14, 'right'));
      }
      if (data.footer.showSku && item.sku) {
        lines.push(pad(`  SKU: ${item.sku}`, cols, 'left'));
      }
    } else {
      const firstName = nameLines[0] || '';
      lines.push(pad(firstName, 14, 'left') + pad(qtyStr, 4, 'right') + pad(rateStr, 7, 'right') + pad(amtStr, 7, 'right'));
      for (let i = 1; i < nameLines.length; i++) {
        lines.push(pad(nameLines[i], 14, 'left') + pad('', 4, 'right') + pad('', 7, 'right') + pad('', 7, 'right'));
      }
    }
  }

  if (data.items.length === 0) {
    lines.push(centerText('No items', cols));
  }

  lines.push(sepDash);

  // Totals
  const totalLabelWidth = cols - 14;
  lines.push(pad('SUBTOTAL', totalLabelWidth, 'left') + pad(formatAmountPlain(data.totals.subtotal), 14, 'right'));
  if (data.totals.discount > 0) {
    lines.push(pad('DISCOUNT', totalLabelWidth, 'left') + pad(formatAmountPlain(data.totals.discount), 14, 'right'));
  }
  if (data.totals.charges > 0) {
    lines.push(pad('CHARGES', totalLabelWidth, 'left') + pad(formatAmountPlain(data.totals.charges), 14, 'right'));
  }
  if (data.totals.tax > 0) {
    lines.push(pad('TAX', totalLabelWidth, 'left') + pad(formatAmountPlain(data.totals.tax), 14, 'right'));
  }
  if (data.totals.roundOff !== 0) {
    lines.push(pad('ROUND OFF', totalLabelWidth, 'left') + pad(formatAmountPlain(data.totals.roundOff), 14, 'right'));
  }
  lines.push(sepDash);
  // Grand total bold simulation with ===
  lines.push(pad('TOTAL PAYABLE', totalLabelWidth, 'left') + pad(currency + formatAmountPlain(data.totals.grandTotal), 14, 'right'));
  lines.push(sepEq);

  // Payment
  if (data.totals.paid > 0 || data.totals.balance > 0) {
    if (data.totals.paid > 0) lines.push(pad(`PAID: ${currency}${formatAmountPlain(data.totals.paid)}`, cols, 'left'));
    if (data.totals.balance > 0) lines.push(pad(`BALANCE: ${currency}${formatAmountPlain(data.totals.balance)}`, cols, 'left'));
    else lines.push(pad(`BALANCE: ${currency}0.00`, cols, 'left'));
    lines.push('');
  }

  // Payment method
  const method = data.payment.method;
  if (method && method !== 'Pending') {
    if (paperSize === '80mm') {
      const cash = method === 'Cash' ? '[✓]' : '[ ]';
      const upi = method === 'UPI' ? '[✓]' : '[ ]';
      const credit = method === 'Credit' ? '[✓]' : '[ ]';
      lines.push(pad(`Payment: ${cash} Cash  ${upi} UPI  ${credit} Credit`, cols, 'left'));
    } else {
      lines.push(pad(`Payment: ${method}`, cols, 'left'));
    }
  } else if (method === 'Pending' || method === 'Credit') {
    lines.push(pad(`Payment: CREDIT`, cols, 'left'));
  }
  lines.push('');

  // Footer
  if (data.footer.showFooter) {
    if (data.footer.thankYouMessage) {
      lines.push(centerText(data.footer.thankYouMessage, cols));
      lines.push('');
    }
    if (data.footer.terms) {
      const termLines = wrapProductName(data.footer.terms, cols);
      termLines.forEach(l => lines.push(pad(l, cols, 'left')));
      lines.push('');
    }
  }

  lines.push(sepEq);
  lines.push('');

  return lines.join('\n');
}

export function getReceiptHtml(data: ThermalReceiptData, paperSize: PaperSize = '80mm'): string {
  const text = renderThermalText(data, paperSize);
  // Escape HTML and wrap in <pre>
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<pre style="font-family:'Courier New', monospace; font-size:11px; line-height:1.3; white-space:pre; margin:0; padding:0; background:white; color:black;">${escaped}</pre>`;
}
