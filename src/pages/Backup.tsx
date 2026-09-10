import React, { useState, useRef } from 'react';
import {
  Download,
  Upload,
  Check,
  AlertTriangle,
  X,
  FileSpreadsheet,
  FileJson
} from 'lucide-react';
import { pb } from '../lib/pocketbase';
import { getPbUrl } from '../lib/pocketbase';
import * as XLSX from 'xlsx';

export default function Backup() {
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeleteBills, setConfirmDeleteBills] = useState(false);
  const [loading, setLoading] = useState(false);
  const [excelLoading, setExcelLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleBackup = async () => {
    setLoading(true);
    try {
      const [products, customers, bills, billItems, settings] = await Promise.all([
        pb.collection('products').getFullList().catch(() => []),
        pb.collection('customers').getFullList().catch(() => []),
        pb.collection('bills').getFullList().catch(() => []),
        pb.collection('bill_items').getFullList().catch(() => []),
        pb.collection('settings').getFullList().catch(() => []),
      ]);
      const data = { products, customers, bills, bill_items: billItems, settings, exported_at: new Date().toISOString(), version: '1.0' };
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `businessdesk_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus({ type: 'success', message: `Backup downloaded (${products.length} products, ${customers.length} customers, ${bills.length} bills)` });
    } catch (e: any) {
      setStatus({ type: 'error', message: e.message || 'Backup failed' });
    } finally {
      setLoading(false);
    }
  };

  const handleExcelBackup = async () => {
    setExcelLoading(true);
    try {
      const [products, customers, bills, billItems, settings, smsLogs] = await Promise.all([
        pb.collection('products').getFullList().catch(() => []),
        pb.collection('customers').getFullList().catch(() => []),
        pb.collection('bills').getFullList().catch(() => []),
        pb.collection('bill_items').getFullList().catch(() => []),
        pb.collection('settings').getFullList().catch(() => []),
        pb.collection('sms_logs').getFullList().catch(() => []),
      ]);

      const wb = XLSX.utils.book_new();

      // Helper to clean PocketBase records for Excel
      const cleanProducts = products.map((p: any) => ({
        ID: p.id,
        Name: p.name,
        SKU: p.sku,
        Category: p.category,
        'Purchase Price': p.purchase_price,
        'Selling Price': p.selling_price,
        'Labour Charge': p.labour_charge,
        Stock: p.stock,
        'Min Stock': p.min_stock,
        Unit: p.unit,
        Description: p.description,
        Created: p.created ? new Date(p.created).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
      }));

      const cleanCustomers = customers.map((c: any) => ({
        ID: c.id,
        Name: c.name,
        Mobile: c.mobile,
        Email: c.email,
        Address: c.address,
        Created: c.created ? new Date(c.created).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
      }));

      const cleanBills = bills.map((b: any) => ({
        ID: b.id,
        'Bill Number': b.bill_number,
        'Customer Name': b.customer_name,
        'Customer Mobile': b.customer_mobile,
        Date: b.date,
        Subtotal: b.subtotal,
        'Labour Total': b.labour_total,
        Total: b.total,
        'Payment Status': b.payment_status,
        Notes: b.notes,
        Created: b.created ? new Date(b.created).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
      }));

      const cleanBillItems = billItems.map((bi: any) => ({
        ID: bi.id,
        'Bill ID': bi.bill_id || bi.bill,
        'Product ID': bi.product_id || bi.product,
        'Product Name': bi.product_name,
        Quantity: bi.quantity,
        'Unit Price': bi.unit_price,
        'Labour Charge': bi.labour_charge,
        Total: bi.total,
        Created: bi.created ? new Date(bi.created).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
      }));

      const cleanSettings = settings.map((s: any) => ({
        ID: s.id,
        Key: s.key,
        Value: s.value,
        Created: s.created ? new Date(s.created).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
      }));

      const cleanSmsLogs = smsLogs.map((l: any) => ({
        ID: l.id,
        'Bill ID': l.bill_id,
        'Bill Number': l.bill_number,
        'Customer Name': l.customer_name,
        Phone: l.phone,
        Message: l.message,
        Status: l.status,
        Error: l.error,
        'Sent At': l.sent_at ? new Date(l.sent_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : (l.created ? new Date(l.created).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : ''),
      }));

      // === DAILY & MONTHLY AGGREGATIONS ===
      // Group bills by date
      const billsByDate: Record<string, any[]> = {};
      const billsByMonth: Record<string, any[]> = {};
      bills.forEach((b: any) => {
        const dateKey = (b.date || '').split(' ')[0].split('T')[0] || 'Unknown';
        if (!billsByDate[dateKey]) billsByDate[dateKey] = [];
        billsByDate[dateKey].push(b);
        
        // Month key: YYYY-MM
        const monthKey = dateKey.slice(0, 7);
        if (!billsByMonth[monthKey]) billsByMonth[monthKey] = [];
        billsByMonth[monthKey].push(b);
      });

      // Map bill ID to date for billItems
      const billIdToDate: Record<string, string> = {};
      const billIdToCustomer: Record<string, { name: string; mobile: string }> = {};
      bills.forEach((b: any) => {
        const bid = b.id;
        const dateKey = (b.date || '').split(' ')[0].split('T')[0] || 'Unknown';
        billIdToDate[bid] = dateKey;
        // Also handle bill field
        const billField = b.bill_id || b.bill;
        if (billField) billIdToDate[billField] = dateKey;
        billIdToCustomer[bid] = { name: b.customer_name, mobile: b.customer_mobile };
      });

      // Daily Sales Summary
      const dailySalesData = Object.keys(billsByDate).sort().map(date => {
        const dayBills = billsByDate[date];
        const totalSales = dayBills.reduce((s: number, b: any) => s + Number(b.total || 0), 0);
        const paidAmount = dayBills.filter((b: any) => b.payment_status === 'Paid').reduce((s: number, b: any) => s + Number(b.total || 0), 0);
        const pendingAmount = dayBills.filter((b: any) => b.payment_status === 'Pending').reduce((s: number, b: any) => s + Number(b.total || 0), 0);
        const uniqueCustomers = new Set(dayBills.map((b: any) => b.customer_mobile || b.customer_name)).size;
        const totalItems = dayBills.reduce((s: number, b: any) => {
          const itemsForBill = billItems.filter((bi: any) => (bi.bill_id || bi.bill) === b.id);
          return s + itemsForBill.reduce((ss: number, bi: any) => ss + Number(bi.quantity || 0), 0);
        }, 0);
        return {
          Date: date,
          'Day': (() => { try { return new Date(date).toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'Asia/Kolkata' }); } catch { return ''; } })(),
          'Total Bills': dayBills.length,
          'Total Sales (₹)': totalSales,
          'Paid Amount (₹)': paidAmount,
          'Pending Amount (₹)': pendingAmount,
          'Unique Customers': uniqueCustomers,
          'Total Items Qty': totalItems,
        };
      });

      // Daily Customer Purchases
      const dailyCustomerData: any[] = [];
      Object.keys(billsByDate).sort().forEach(date => {
        const dayBills = billsByDate[date];
        const byCustomer: Record<string, any[]> = {};
        dayBills.forEach((b: any) => {
          const key = `${b.customer_name}||${b.customer_mobile}`;
          if (!byCustomer[key]) byCustomer[key] = [];
          byCustomer[key].push(b);
        });
        Object.entries(byCustomer).forEach(([key, custBills]: [string, any]) => {
          const [name, mobile] = key.split('||');
          const totalPurchase = (custBills as any[]).reduce((s: number, b: any) => s + Number(b.total || 0), 0);
          const paidPurchase = (custBills as any[]).filter((b: any) => b.payment_status === 'Paid').reduce((s: number, b: any) => s + Number(b.total || 0), 0);
          const pendingPurchase = (custBills as any[]).filter((b: any) => b.payment_status === 'Pending').reduce((s: number, b: any) => s + Number(b.total || 0), 0);
          const billNumbers = (custBills as any[]).map((b: any) => b.bill_number).join(', ');
          dailyCustomerData.push({
            Date: date,
            'Customer Name': name,
            Mobile: mobile,
            'Bill Numbers': billNumbers,
            'Bills Count': (custBills as any[]).length,
            'Total Purchase (₹)': totalPurchase,
            'Paid (₹)': paidPurchase,
            'Pending (₹)': pendingPurchase,
          });
        });
      });
      // Sort by date
      dailyCustomerData.sort((a, b) => a.Date.localeCompare(b.Date));

      // Daily Product Sales
      const dailyProductData: any[] = [];
      const dailyProductMap: Record<string, { date: string; product: string; qty: number; amount: number; bills: Set<string> }> = {};
      billItems.forEach((bi: any) => {
        const bid = bi.bill_id || bi.bill;
        const date = billIdToDate[bid] || 'Unknown';
        const key = `${date}||${bi.product_name}`;
        if (!dailyProductMap[key]) {
          dailyProductMap[key] = { date, product: bi.product_name, qty: 0, amount: 0, bills: new Set() };
        }
        dailyProductMap[key].qty += Number(bi.quantity || 0);
        dailyProductMap[key].amount += Number(bi.total || 0);
        dailyProductMap[key].bills.add(bid);
      });
      Object.values(dailyProductMap).sort((a, b) => a.date.localeCompare(b.date) || a.product.localeCompare(b.product)).forEach(entry => {
        dailyProductData.push({
          Date: entry.date,
          'Product Name': entry.product,
          'Quantity Sold': entry.qty,
          'Total Amount (₹)': entry.amount,
          'Bills Count': entry.bills.size,
        });
      });

      // Monthly Sales Summary
      const monthlySalesData = Object.keys(billsByMonth).sort().map(month => {
        const monthBills = billsByMonth[month];
        const totalSales = monthBills.reduce((s: number, b: any) => s + Number(b.total || 0), 0);
        const paidAmount = monthBills.filter((b: any) => b.payment_status === 'Paid').reduce((s: number, b: any) => s + Number(b.total || 0), 0);
        const pendingAmount = monthBills.filter((b: any) => b.payment_status === 'Pending').reduce((s: number, b: any) => s + Number(b.total || 0), 0);
        const uniqueCustomers = new Set(monthBills.map((b: any) => b.customer_mobile || b.customer_name)).size;
        // Month name
        let monthName = month;
        try {
          const [y, m] = month.split('-').map(Number);
          const d = new Date(y, m - 1, 1);
          monthName = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
        } catch {}
        return {
          Month: month,
          'Month Name': monthName,
          'Total Bills': monthBills.length,
          'Total Sales (₹)': totalSales,
          'Paid Collected (₹)': paidAmount,
          'Pending Amount (₹)': pendingAmount,
          'Pending Bills': monthBills.filter((b: any) => b.payment_status === 'Pending').length,
          'Unique Customers': uniqueCustomers,
        };
      });

      // Monthly Customer Bills (detailed)
      const monthlyCustomerData: any[] = [];
      Object.keys(billsByMonth).sort().forEach(month => {
        const monthBills = billsByMonth[month];
        const byCustomer: Record<string, any[]> = {};
        monthBills.forEach((b: any) => {
          const key = `${b.customer_name}||${b.customer_mobile}`;
          if (!byCustomer[key]) byCustomer[key] = [];
          byCustomer[key].push(b);
        });
        Object.entries(byCustomer).forEach(([key, custBills]: [string, any]) => {
          const [name, mobile] = key.split('||');
          const totalSales = (custBills as any[]).reduce((s: number, b: any) => s + Number(b.total || 0), 0);
          const paidAmount = (custBills as any[]).filter((b: any) => b.payment_status === 'Paid').reduce((s: number, b: any) => s + Number(b.total || 0), 0);
          const pendingAmount = (custBills as any[]).filter((b: any) => b.payment_status === 'Pending').reduce((s: number, b: any) => s + Number(b.total || 0), 0);
          const billNumbers = (custBills as any[]).map((b: any) => b.bill_number).join(', ');
          let monthName = month;
          try {
            const [y, m] = month.split('-').map(Number);
            const d = new Date(y, m - 1, 1);
            monthName = d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
          } catch {}
          monthlyCustomerData.push({
            Month: month,
            'Month Name': monthName,
            'Customer Name': name,
            Mobile: mobile,
            'Bills Count': (custBills as any[]).length,
            'Bill Numbers': billNumbers,
            'Total Sales (₹)': totalSales,
            'Paid (₹)': paidAmount,
            'Pending (₹)': pendingAmount,
            'Pending Bills': (custBills as any[]).filter((b: any) => b.payment_status === 'Pending').length,
          });
        });
      });
      monthlyCustomerData.sort((a, b) => a.Month.localeCompare(b.Month) || b['Total Sales (₹)'] - a['Total Sales (₹)']);

      // Customer Purchase History (overall)
      const customerHistoryData: any[] = [];
      const customerMap: Record<string, any[]> = {};
      bills.forEach((b: any) => {
        const key = `${b.customer_name}||${b.customer_mobile}`;
        if (!customerMap[key]) customerMap[key] = [];
        customerMap[key].push(b);
      });
      Object.entries(customerMap).forEach(([key, custBills]: [string, any]) => {
        const [name, mobile] = key.split('||');
        const billsArr = custBills as any[];
        const totalPurchase = billsArr.reduce((s: number, b: any) => s + Number(b.total || 0), 0);
        const paidPurchase = billsArr.filter((b: any) => b.payment_status === 'Paid').reduce((s: number, b: any) => s + Number(b.total || 0), 0);
        const pendingPurchase = billsArr.filter((b: any) => b.payment_status === 'Pending').reduce((s: number, b: any) => s + Number(b.total || 0), 0);
        const lastDate = billsArr.map((b: any) => b.date).sort().pop() || '';
        const pendingBills = billsArr.filter((b: any) => b.payment_status === 'Pending');
        const pendingNumbers = pendingBills.map((b: any) => b.bill_number).join(', ');
        customerHistoryData.push({
          'Customer Name': name,
          Mobile: mobile,
          'Total Bills': billsArr.length,
          'Total Purchase (₹)': totalPurchase,
          'Total Paid (₹)': paidPurchase,
          'Total Pending (₹)': pendingPurchase,
          'Pending Bills Count': pendingBills.length,
          'Pending Bills': pendingNumbers || '-',
          'Last Purchase Date': lastDate,
        });
      });
      customerHistoryData.sort((a, b) => b['Total Purchase (₹)'] - a['Total Purchase (₹)']);

      // Create sheets
      const addSheet = (data: any[], name: string) => {
        const ws = XLSX.utils.json_to_sheet(data.length > 0 ? data : [{ Info: `No ${name} data` }]);
        // Auto width
        const colWidths = Object.keys(data[0] || { Info: '' }).map(key => ({
          wch: Math.max(key.length, ...data.map((r: any) => String(r[key] || '').length).slice(0, 100), 12) + 2
        }));
        ws['!cols'] = colWidths;
        // Header style
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const address = XLSX.utils.encode_cell({ r: 0, c: C });
          if (!ws[address]) continue;
          ws[address].s = {
            font: { bold: true, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "2563EB" } },
            alignment: { horizontal: "center", vertical: "center" }
          };
        }
        XLSX.utils.book_append_sheet(wb, ws, name);
      };

      // Summary sheet
      const totalSalesAll = (bills as any[]).reduce((s: number, b: any) => s + Number(b.total || 0), 0);
      const totalPaidAll = (bills as any[]).filter((b: any) => b.payment_status === 'Paid').reduce((s: number, b: any) => s + Number(b.total || 0), 0);
      const totalPendingAll = (bills as any[]).filter((b: any) => b.payment_status === 'Pending').reduce((s: number, b: any) => s + Number(b.total || 0), 0);
      const summaryData = [
        { Metric: 'Export Date', Value: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) },
        { Metric: 'BusinessDesk Backup', Value: 'All Data + Daily/Monthly Reports' },
        { Metric: '', Value: '' },
        { Metric: 'Total Products', Value: products.length },
        { Metric: 'Total Customers', Value: customers.length },
        { Metric: 'Total Bills', Value: bills.length },
        { Metric: 'Total Bill Items', Value: billItems.length },
        { Metric: 'Total Sales (₹)', Value: totalSalesAll },
        { Metric: 'Total Collected - Paid (₹)', Value: totalPaidAll },
        { Metric: 'Total Pending (₹)', Value: totalPendingAll },
        { Metric: 'Total Settings', Value: settings.length },
        { Metric: 'Total SMS Logs', Value: smsLogs.length },
        { Metric: '', Value: '' },
        { Metric: 'Daily Reports', Value: `${Object.keys(billsByDate).length} days` },
        { Metric: 'Monthly Reports', Value: `${Object.keys(billsByMonth).length} months` },
        { Metric: 'Customers with Purchases', Value: Object.keys(customerMap).length },
        { Metric: '', Value: '' },
        { Metric: 'PocketBase URL', Value: getPbUrl() },
      ];
      const wsSummary = XLSX.utils.json_to_sheet(summaryData);
      wsSummary['!cols'] = [{ wch: 28 }, { wch: 35 }];
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

      addSheet(cleanProducts, 'Products');
      addSheet(cleanCustomers, 'Customers');
      addSheet(cleanBills, 'Bills');
      addSheet(cleanBillItems, 'Bill Items');
      // Daily sheets
      addSheet(dailySalesData, 'Daily Sales');
      addSheet(dailyCustomerData, 'Daily Customer Purchase');
      addSheet(dailyProductData, 'Daily Product Sales');
      // Monthly sheets
      addSheet(monthlySalesData, 'Monthly Sales');
      addSheet(monthlyCustomerData, 'Monthly Customer Bills');
      // Customer history
      addSheet(customerHistoryData, 'Customer Purchase History');
      addSheet(cleanSettings, 'Settings');
      if (smsLogs.length > 0) addSheet(cleanSmsLogs, 'SMS Logs');

      // Generate file
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `BusinessDesk_All_Data_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus({ type: 'success', message: `Excel downloaded: ${products.length} products, ${customers.length} customers, ${bills.length} bills, ${Object.keys(billsByDate).length} days, ${Object.keys(billsByMonth).length} months` });
    } catch (e: any) {
      console.error(e);
      setStatus({ type: 'error', message: e.message || 'Excel export failed' });
    } finally {
      setExcelLoading(false);
    }
  };

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.json')) {
      setStatus({ type: 'error', message: 'Please select a JSON backup file' });
      return;
    }
    setLoading(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.products && !data.customers && !data.bills) {
        throw new Error('Invalid backup file format');
      }
      if (!confirm(`Restore backup from ${data.exported_at || 'unknown date'}? This will add records (existing data kept). Continue?`)) {
        setLoading(false);
        return;
      }
      let restored = 0;
      if (data.products?.length) {
        for (const p of data.products) {
          try {
            await pb.collection('products').create({
              name: p.name, sku: p.sku, category: p.category, purchase_price: p.purchase_price,
              selling_price: p.selling_price, labour_charge: p.labour_charge, stock: p.stock,
              min_stock: p.min_stock, unit: p.unit, description: p.description
            });
            restored++;
          } catch {}
        }
      }
      if (data.customers?.length) {
        for (const c of data.customers) {
          try {
            await pb.collection('customers').create({ name: c.name, mobile: c.mobile, email: c.email, address: c.address });
            restored++;
          } catch {}
        }
      }
      setStatus({ type: 'success', message: `Restore completed. ${restored} records added.` });
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'Failed to restore backup' });
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteAllExceptBills = async () => {
    if (!confirm('Delete all products and customers? Bills will be kept.')) return;
    setLoading(true);
    try {
      const products = await pb.collection('products').getFullList();
      for (const p of products) await pb.collection('products').delete(p.id);
      const customers = await pb.collection('customers').getFullList();
      for (const c of customers) {
        try { await pb.collection('customers').delete(c.id); } catch (e: any) {
          if (!e.message?.includes('Cannot delete')) throw e;
        }
      }
      setStatus({ type: 'success', message: 'Products cleared. Customers with bills were kept.' });
      setConfirmDelete(false);
    } catch (e: any) {
      setStatus({ type: 'error', message: e.message || 'Failed to clear' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm('Delete EVERYTHING including all bills? This is permanent!')) return;
    if (!confirm('Are you absolutely sure? Type OK to confirm?')) return;
    setLoading(true);
    try {
      const billItems = await pb.collection('bill_items').getFullList();
      for (const bi of billItems) await pb.collection('bill_items').delete(bi.id);
      const bills = await pb.collection('bills').getFullList();
      for (const b of bills) await pb.collection('bills').delete(b.id);
      const products = await pb.collection('products').getFullList();
      for (const p of products) await pb.collection('products').delete(p.id);
      const customers = await pb.collection('customers').getFullList();
      for (const c of customers) await pb.collection('customers').delete(c.id);
      setStatus({ type: 'success', message: 'All data deleted' });
      setConfirmDeleteBills(false);
    } catch (e: any) {
      setStatus({ type: 'error', message: e.message || 'Delete failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      {status && (
        <div className={`p-3 rounded-lg text-sm flex items-center justify-between ${
          status.type === 'success'
            ? 'bg-green-50 border border-green-200 text-green-700'
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          <div className="flex items-center gap-2">
            {status.type === 'success' ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {status.message}
          </div>
          <button onClick={() => setStatus(null)} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
        <p className="font-medium">PocketBase Connected: {getPbUrl()}</p>
        <p className="text-xs mt-1">Backups are stored on the PocketBase server. Use PocketBase Admin UI at {getPbUrl()}/_/ for full DB backups.</p>
      </div>

      {/* Backup & Restore */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Backup & Restore</h3>
        <p className="text-sm text-gray-500 mb-4">Download full backup in JSON or Excel, or restore from file.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileJson className="w-4 h-4 text-blue-600" />
              <p className="font-medium text-gray-800 text-sm">JSON Backup</p>
            </div>
            <p className="text-xs text-gray-500 mb-3">Full data as JSON</p>
            <button onClick={handleBackup} disabled={loading || excelLoading} className="btn-primary text-xs py-1.5 w-full justify-center disabled:opacity-50">
              <Download className="w-3.5 h-3.5" />
              {loading ? '...' : 'Download JSON'}
            </button>
          </div>

          <div className="border border-green-200 rounded-lg p-4 bg-green-50/50">
            <div className="flex items-center gap-2 mb-2">
              <FileSpreadsheet className="w-4 h-4 text-green-600" />
              <p className="font-medium text-gray-800 text-sm">Excel Backup</p>
            </div>
            <p className="text-xs text-gray-500 mb-3">All data as .xlsx</p>
            <button onClick={handleExcelBackup} disabled={loading || excelLoading} className="btn-success text-xs py-1.5 w-full justify-center disabled:opacity-50">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              {excelLoading ? 'Generating...' : 'Download Excel'}
            </button>
          </div>

          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Upload className="w-4 h-4 text-amber-600" />
              <p className="font-medium text-gray-800 text-sm">Restore</p>
            </div>
            <p className="text-xs text-gray-500 mb-3">From JSON file</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleRestore}
              className="hidden"
            />
            <button onClick={() => fileInputRef.current?.click()} disabled={loading || excelLoading} className="btn-secondary text-xs py-1.5 w-full justify-center disabled:opacity-50">
              <Upload className="w-3.5 h-3.5" />
              Restore JSON
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-3">Excel contains 12 sheets: Summary, Products, Customers, Bills, Bill Items, <b>Daily Sales, Daily Customer Purchase, Daily Product Sales, Monthly Sales, Monthly Customer Bills, Customer Purchase History</b>, Settings, SMS Logs — with daily customer/product and end-of-month totals.</p>
      </div>

      {/* Database Info */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Server Status</h3>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="bg-gray-50 rounded p-3">
            <p className="text-gray-500 text-xs">Server</p>
            <p className="font-medium text-gray-800">PocketBase</p>
          </div>
          <div className="bg-gray-50 rounded p-3">
            <p className="text-gray-500 text-xs">URL</p>
            <p className="font-medium text-gray-800 text-xs break-all">{getPbUrl()}</p>
          </div>
          <div className="bg-gray-50 rounded p-3">
            <p className="text-gray-500 text-xs">Mode</p>
            <p className="font-medium text-green-600">Online Synced</p>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-white rounded-lg border border-red-200 p-6">
        <h3 className="text-sm font-semibold text-red-700 uppercase tracking-wide mb-3">Danger Zone</h3>
        <p className="text-xs text-gray-500 mb-4">These actions are permanent and cannot be undone.</p>

        <div className="space-y-3">
          <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3 gap-4">
            <div>
              <p className="font-medium text-gray-800 text-sm">Clear Data (Keep Bills)</p>
              <p className="text-xs text-gray-500">Remove all products and customers without bills</p>
            </div>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={loading}
                className="btn-secondary text-red-600 border-red-200 hover:bg-red-50 text-xs py-1.5 disabled:opacity-50"
              >
                Clear
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={handleDeleteAllExceptBills} disabled={loading} className="btn-danger text-xs py-1.5 disabled:opacity-50">
                  Confirm
                </button>
                <button onClick={() => setConfirmDelete(false)} className="btn-secondary text-xs py-1.5">
                  Cancel
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between bg-red-50 rounded-lg p-3 gap-4">
            <div>
              <p className="font-medium text-red-800 text-sm">Delete Everything</p>
              <p className="text-xs text-gray-500">Erase all data including bills</p>
            </div>
            {!confirmDeleteBills ? (
              <button
                onClick={() => setConfirmDeleteBills(true)}
                disabled={loading}
                className="btn-danger text-xs py-1.5 disabled:opacity-50"
              >
                Delete All
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={handleDeleteAll} disabled={loading} className="btn-danger text-xs py-1.5 disabled:opacity-50">
                  Confirm
                </button>
                <button onClick={() => setConfirmDeleteBills(false)} className="btn-secondary text-xs py-1.5">
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
