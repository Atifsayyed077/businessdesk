import React, { useEffect, useState } from 'react';
import {
  Search,
  Download,
  FileDown,
  Eye,
  Check,
  History,
  Send,
  MessageSquare,
  Printer
} from 'lucide-react';
import { getBills, formatCurrency, formatDisplayDate, exportToCSV } from '../lib/utils';
import { generateInvoicePDF, generateBillsPDF } from '../lib/pdf';
import { pb } from '../lib/pocketbase';
import { sendBillSms, bulkSendPendingBills } from '../lib/sms';
import InvoicePreview from '../components/InvoicePreview';
import ThermalBillPreview from '../components/ThermalBillPreview';
import { buildReceiptData } from '../lib/thermalReceipt';
import type { Bill } from '../types';

export default function BillsHistory() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendingBulk, setSendingBulk] = useState(false);
  const [thermalBill, setThermalBill] = useState<Bill | null>(null);
  const [thermalData, setThermalData] = useState<any>(null);

  const loadBills = async () => {
    setLoading(true);
    const data = await getBills();
    setBills(data);
    setLoading(false);
  };

  useEffect(() => {
    loadBills();
  }, []);

  const filteredBills = bills.filter(b => {
    const matchesSearch = b.bill_number.toLowerCase().includes(search.toLowerCase()) ||
      b.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      b.customer_mobile.includes(search);
    const matchesStatus = statusFilter === 'all' || b.payment_status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalAmount = filteredBills.reduce((sum, b) => sum + b.total, 0);
  const paidAmount = filteredBills.filter(b => b.payment_status === 'Paid').reduce((sum, b) => sum + b.total, 0);
  const pendingAmount = filteredBills.filter(b => b.payment_status === 'Pending').reduce((sum, b) => sum + b.total, 0);

  const viewInvoice = (bill: Bill) => {
    setSelectedBill(bill);
  };

  const updateStatus = async (bill: Bill) => {
    if (!confirm(`Mark bill ${bill.bill_number} as Paid?`)) return;
    try {
      await pb.collection('bills').update(bill.id, { payment_status: 'Paid' });
      await loadBills();
    } catch (e: any) {
      alert(e.message || 'Failed to update status');
    }
  };

  const handleExportCSV = () => {
    exportToCSV(filteredBills, `Bills_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const handleExportPDF = async () => {
    await generateBillsPDF(filteredBills);
  };

  const handleDownloadPDF = async (bill: Bill) => {
    await generateInvoicePDF(bill);
  };

  const handleSendSms = async (bill: Bill) => {
    if (!confirm(`Send SMS to ${bill.customer_name} (${bill.customer_mobile}) for ${bill.bill_number}?`)) return;
    const res = await sendBillSms(bill);
    alert(res.ok ? `✓ SMS sent to ${bill.customer_mobile}` : `✗ Failed: ${res.error}`);
  };

  const handleThermalPrint = async (bill: Bill) => {
    const data = await buildReceiptData(bill, 'Sales Bill');
    // Mark as reprint if needed (could check settings)
    const isReprint = true;
    if (isReprint) data.isReprint = true;
    setThermalData(data);
    setThermalBill(bill);
  };

  const handleBulkSendPending = async () => {
    const pending = filteredBills.filter(b => b.payment_status === 'Pending');
    if (pending.length === 0) { alert('No pending bills in current filter'); return; }
    if (!confirm(`Send SMS to all ${pending.length} pending bills?\nThis will use your Traccar SMS Gateway.`)) return;
    setSendingBulk(true);
    const { sent, failed } = await bulkSendPendingBills(pending);
    setSendingBulk(false);
    alert(`Bulk send done: ${sent} sent, ${failed} failed`);
  };

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Loading bills...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totalAmount)}</p>
          <p className="text-xs text-gray-400 mt-1">{filteredBills.length} bills</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Collected</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(paidAmount)}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Pending</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{formatCurrency(pendingAmount)}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200">
        {/* Toolbar */}
        <div className="p-4 flex flex-wrap items-center justify-between gap-3 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search bill, customer, mobile..."
                className="w-56 pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none bg-white cursor-pointer"
            >
              <option value="all">All Status</option>
              <option value="Paid">Paid</option>
              <option value="Pending">Pending</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleBulkSendPending} disabled={sendingBulk} className="btn-secondary border-amber-200 text-amber-700 hover:bg-amber-50 disabled:opacity-50">
              <MessageSquare className="w-4 h-4" />
              {sendingBulk ? 'Sending...' : 'Bulk SMS Pending'}
            </button>
            <button onClick={handleExportCSV} className="btn-secondary">
              <FileDown className="w-4 h-4" />
              CSV
            </button>
            <button onClick={handleExportPDF} className="btn-secondary">
              <Download className="w-4 h-4" />
              PDF
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="table-header px-4 py-2.5">Bill No.</th>
                <th className="table-header px-4 py-2.5">Customer</th>
                <th className="table-header px-4 py-2.5">Mobile</th>
                <th className="table-header px-4 py-2.5">Date</th>
                <th className="table-header px-4 py-2.5 text-right">Items</th>
                <th className="table-header px-4 py-2.5 text-right">Subtotal</th>
                <th className="table-header px-4 py-2.5 text-right">Charges</th>
                <th className="table-header px-4 py-2.5 text-right">Total</th>
                <th className="table-header px-4 py-2.5">Status</th>
                <th className="table-header px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredBills.map(bill => (
                <tr key={bill.id} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-sm font-medium text-blue-600">{bill.bill_number}</td>
                  <td className="px-4 py-2.5 text-sm font-medium text-gray-800">{bill.customer_name}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-500">{bill.customer_mobile}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-500">{formatDisplayDate(bill.date)}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-600 text-right">{bill.items?.length || 0}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-600 text-right">{formatCurrency(bill.subtotal)}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-600 text-right">{formatCurrency(bill.labour_total)}</td>
                  <td className="px-4 py-2.5 text-sm font-medium text-gray-800 text-right">{formatCurrency(bill.total)}</td>
                  <td className="px-4 py-2.5">
                    {bill.payment_status === 'Paid' ? (
                      <span className="badge-paid">Paid</span>
                    ) : (
                      <span className="badge-pending">Pending</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => viewInvoice(bill)}
                        className="p-1.5 rounded text-gray-500 hover:bg-blue-50 hover:text-blue-600 cursor-pointer"
                        title="View Invoice"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleThermalPrint(bill)}
                        className="p-1.5 rounded text-gray-500 hover:bg-gray-800 hover:text-white cursor-pointer"
                        title="Thermal Print (80mm)"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDownloadPDF(bill)}
                        className="p-1.5 rounded text-gray-500 hover:bg-blue-50 hover:text-blue-600 cursor-pointer"
                        title="Download PDF"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleSendSms(bill)}
                        className="p-1.5 rounded text-gray-500 hover:bg-amber-50 hover:text-amber-600 cursor-pointer"
                        title="Send SMS"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                      {bill.payment_status === 'Pending' && (
                        <button
                          onClick={() => updateStatus(bill)}
                          className="p-1.5 rounded text-gray-500 hover:bg-green-50 hover:text-green-600 cursor-pointer"
                          title="Mark as Paid"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredBills.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center">
                    <History className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm">No bills found</p>
                    <p className="text-gray-400 text-xs mt-1">Create a sale to generate your first bill</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedBill && (
        <InvoicePreview bill={selectedBill} onClose={() => setSelectedBill(null)} />
      )}

      {thermalBill && thermalData && (
        <ThermalBillPreview receiptData={thermalData} billNumber={thermalBill.bill_number} onClose={() => { setThermalBill(null); setThermalData(null); }} />
      )}
    </div>
  );
}
