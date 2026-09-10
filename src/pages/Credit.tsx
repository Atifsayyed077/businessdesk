import React, { useEffect, useState } from 'react';
import { CreditCard, Users, TrendingUp, AlertTriangle, CheckCircle, Clock, Search, Eye, DollarSign, Calendar, X, Plus, Phone, Printer, FileText } from 'lucide-react';
import { formatCurrency, formatDisplayDate, getAllCreditCustomers, getCustomerCreditSummary, getISTDate, addPayment } from '../lib/utils';
import { pb } from '../lib/pocketbase';
import type { Bill } from '../types';
import CreditTransactionBill from '../components/CreditTransactionBill';

export default function Credit() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showPayModal, setShowPayModal] = useState<Bill | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('Cash');
  const [payDate, setPayDate] = useState(getISTDate());
  const [payNotes, setPayNotes] = useState('');
  const [showCreditBill, setShowCreditBill] = useState(false);

  const load = async () => {
    setLoading(true);
    const data = await getAllCreditCustomers();
    setCustomers(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCustomer = async (cust: any) => {
    setSelectedCustomer(cust);
    // Load bills and payments for this customer
    try {
      const summary = await getCustomerCreditSummary(cust.customer_id || '');
      // Fallback: filter by name/mobile if no id
      let custBills = summary.bills;
      if (custBills.length === 0) {
        const all = await pb.collection('bills').getFullList({ filter: `customer_name = "${cust.customer_name.replace(/"/g, '\\"')}"` }).catch(() => []);
        custBills = all.map((r: any) => ({
          id: r.id, bill_number: r.bill_number, customer_name: r.customer_name, customer_mobile: r.customer_mobile,
          date: r.date, total: r.total, paid_amount: r.paid_amount, remaining_amount: r.remaining_amount,
          payment_status: r.payment_status, due_date: r.due_date, created: r.created
        })) as any;
      }
      setBills(custBills as Bill[]);
      // Payments
      const payRecs = await pb.collection('payments').getFullList({ filter: `customer_name = "${cust.customer_name.replace(/"/g, '\\"')}"`, sort: '-payment_date' }).catch(() => []);
      setPayments(payRecs);
    } catch (e) {
      console.error(e);
      setBills([]);
      setPayments([]);
    }
  };

  const handleAddPayment = async () => {
    if (!showPayModal) return;
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) { alert('Enter valid amount'); return; }
    const remaining = Number((showPayModal as any).remaining_amount ?? (showPayModal.total - (Number((showPayModal as any).paid_amount) || 0)));
    if (amount > remaining + 0.01) { alert(`Amount exceeds remaining ${formatCurrency(remaining)}`); return; }
    try {
      await addPayment(showPayModal.id, amount, payMethod, payDate, payNotes);
      alert(`Payment of ${formatCurrency(amount)} recorded for ${showPayModal.bill_number}`);
      setShowPayModal(null);
      setPayAmount(''); setPayNotes(''); setPayDate(getISTDate());
      // Reload
      if (selectedCustomer) await openCustomer(selectedCustomer);
      await load();
    } catch (e: any) {
      alert(e.message || 'Failed to add payment');
    }
  };

  const filtered = customers.filter(c =>
    c.customer_name.toLowerCase().includes(search.toLowerCase()) ||
    c.customer_mobile.includes(search)
  );

  const totalRemaining = customers.reduce((s, c) => s + c.totalRemaining, 0);
  const totalCredit = customers.reduce((s, c) => s + c.totalCredit, 0);
  const totalPendingBills = customers.reduce((s, c) => s + c.pendingBills, 0);

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading credit data...</div>;

  return (
    <div className="p-6 space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs uppercase tracking-wide"><CreditCard className="w-4 h-4" /> Total Credit Customers</div>
          <p className="text-2xl font-bold text-gray-900 mt-1">{customers.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-amber-600 text-xs uppercase tracking-wide"><AlertTriangle className="w-4 h-4" /> Total Remaining</div>
          <p className="text-2xl font-bold text-amber-600 mt-1">{formatCurrency(totalRemaining)}</p>
          <p className="text-xs text-gray-400">{totalPendingBills} pending bills</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-green-600 text-xs uppercase tracking-wide"><TrendingUp className="w-4 h-4" /> Total Credit Given</div>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totalCredit)}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs uppercase tracking-wide"><CheckCircle className="w-4 h-4" /> Total Collected</div>
          <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(totalCredit - totalRemaining)}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2"><Users className="w-4 h-4 text-blue-600" /> Credit Customers</h3>
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customer..." className="pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="table-header px-4 py-2.5">Customer</th>
                <th className="table-header px-4 py-2.5">Mobile</th>
                <th className="table-header px-4 py-2.5 text-right">Pending Bills</th>
                <th className="table-header px-4 py-2.5 text-right">Total Credit</th>
                <th className="table-header px-4 py-2.5 text-right">Paid</th>
                <th className="table-header px-4 py-2.5 text-right">Remaining</th>
                <th className="table-header px-4 py-2.5">Due Date</th>
                <th className="table-header px-4 py-2.5">Status</th>
                <th className="table-header px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.customer_name + c.customer_mobile} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-sm font-medium text-gray-800">{c.customer_name}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-600">{c.customer_mobile}</td>
                  <td className="px-4 py-2.5 text-sm text-center">{c.pendingBills}</td>
                  <td className="px-4 py-2.5 text-sm text-right">{formatCurrency(c.totalCredit)}</td>
                  <td className="px-4 py-2.5 text-sm text-right text-green-600">{formatCurrency(c.totalPaid)}</td>
                  <td className="px-4 py-2.5 text-sm text-right font-bold text-amber-600">{formatCurrency(c.totalRemaining)}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{c.lastDueDate ? formatDisplayDate(c.lastDueDate) : '-'}</td>
                  <td className="px-4 py-2.5"><span className={c.totalRemaining <= 0 ? 'badge-paid' : 'badge-pending'}>{c.totalRemaining <= 0 ? 'Clear' : 'Credit'}</span></td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => openCustomer(c)} className="p-1.5 rounded text-blue-600 hover:bg-blue-50" title="View Details"><Eye className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500">No credit customers — all bills are clear</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer Detail Modal */}
      {selectedCustomer && (
        <div className="modal-overlay" onClick={() => setSelectedCustomer(null)}>
          <div className="modal-content max-w-4xl" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{selectedCustomer.customer_name}</h3>
                <p className="text-sm text-gray-500 flex items-center gap-2"><Phone className="w-3 h-3" /> {selectedCustomer.customer_mobile} • Remaining: <span className="font-bold text-amber-600">{formatCurrency(selectedCustomer.totalRemaining)}</span> {selectedCustomer.totalRemaining <= 0 ? <span className="badge-paid">Clear</span> : <span className="badge-pending">Credit</span>}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowCreditBill(true)} className="btn-primary text-xs"><FileText className="w-3 h-3" /> Credit Bill</button>
                <button onClick={() => setSelectedCustomer(null)} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
              </div>
            </div>

            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* Bills */}
              <div>
                <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2"><Calendar className="w-4 h-4" /> Bills ({bills.length})</h4>
                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="table-header px-3 py-2">Bill No</th>
                        <th className="table-header px-3 py-2">Date</th>
                        <th className="table-header px-3 py-2 text-right">Total</th>
                        <th className="table-header px-3 py-2 text-right">Paid</th>
                        <th className="table-header px-3 py-2 text-right">Remaining</th>
                        <th className="table-header px-3 py-2">Due</th>
                        <th className="table-header px-3 py-2">Status</th>
                        <th className="table-header px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {bills.map((b: any) => {
                        const paid = Number(b.paid_amount ?? (b.payment_status === 'Paid' ? b.total : 0));
                        const remaining = Number(b.remaining_amount ?? (b.total - paid));
                        const isClear = remaining <= 0.01;
                        return (
                          <tr key={b.id} className="border-t border-gray-100">
                            <td className="px-3 py-2 text-sm font-mono text-blue-600">{b.bill_number}</td>
                            <td className="px-3 py-2 text-sm">{formatDisplayDate(b.date)}</td>
                            <td className="px-3 py-2 text-sm text-right">{formatCurrency(b.total)}</td>
                            <td className="px-3 py-2 text-sm text-right text-green-600">{formatCurrency(paid)}</td>
                            <td className="px-3 py-2 text-sm text-right font-bold text-amber-600">{formatCurrency(remaining)}</td>
                            <td className="px-3 py-2 text-xs">{b.due_date ? formatDisplayDate(b.due_date) : '-'}</td>
                            <td className="px-3 py-2">{isClear ? <span className="badge-paid">Clear</span> : <span className="badge-pending">Credit</span>}</td>
                            <td className="px-3 py-2">
                              {!isClear && (
                                <button onClick={() => { setShowPayModal(b); setPayAmount(String(Math.round(remaining))); }} className="btn-primary text-xs py-1"><DollarSign className="w-3 h-3" /> Pay</button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {bills.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-sm text-gray-500">No bills</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Payments history */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-gray-800 flex items-center gap-2"><DollarSign className="w-4 h-4 text-green-600" /> Payment History ({payments.length})</h4>
                  <button onClick={() => setShowCreditBill(true)} className="btn-secondary text-xs"><Printer className="w-3 h-3" /> Print Credit Bill</button>
                </div>
                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="table-header px-3 py-2">Date</th>
                        <th className="table-header px-3 py-2">Bill No</th>
                        <th className="table-header px-3 py-2 text-right">Amount</th>
                        <th className="table-header px-3 py-2">Method</th>
                        <th className="table-header px-3 py-2">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p: any) => (
                        <tr key={p.id} className="border-t border-gray-100">
                          <td className="px-3 py-2 text-sm">{p.payment_date ? formatDisplayDate(p.payment_date) : formatDisplayDate(p.created)}</td>
                          <td className="px-3 py-2 text-sm font-mono">{p.bill_number}</td>
                          <td className="px-3 py-2 text-sm text-right font-medium text-green-600">{formatCurrency(p.amount)}</td>
                          <td className="px-3 py-2 text-sm"><span className="px-2 py-0.5 bg-gray-100 rounded text-xs">{p.payment_method}</span></td>
                          <td className="px-3 py-2 text-sm text-gray-500">{p.notes || '-'}</td>
                        </tr>
                      ))}
                      {payments.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-gray-500">No payments yet — full credit</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Credit Transaction Summary */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <h4 className="font-semibold text-amber-800 mb-2 flex items-center gap-2"><CreditCard className="w-4 h-4" /> Credit Transaction Summary</h4>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Total Credit</p>
                    <p className="font-bold text-gray-900">{formatCurrency(selectedCustomer.totalCredit)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-green-600 uppercase">Total Paid</p>
                    <p className="font-bold text-green-700">{formatCurrency(selectedCustomer.totalPaid)}</p>
                    <p className="text-xs text-gray-400">{payments.length} payments</p>
                  </div>
                  <div>
                    <p className="text-xs text-amber-600 uppercase">Net Remaining</p>
                    <p className={`font-bold ${selectedCustomer.totalRemaining <= 0 ? 'text-green-700' : 'text-amber-700'}`}>{formatCurrency(selectedCustomer.totalRemaining)}</p>
                    <p className="text-xs">{selectedCustomer.totalRemaining <= 0 ? '✓ Clear' : 'Credit Due'}</p>
                  </div>
                </div>
                <button onClick={() => setShowCreditBill(true)} className="btn-primary w-full mt-3"><FileText className="w-4 h-4" /> Generate Credit Transaction Bill (with all totals)</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Credit Transaction Bill Modal */}
      {showCreditBill && selectedCustomer && (
        <CreditTransactionBill
          customerName={selectedCustomer.customer_name}
          customerMobile={selectedCustomer.customer_mobile}
          bills={bills}
          payments={payments}
          totals={{
            totalCredit: selectedCustomer.totalCredit,
            totalPaid: selectedCustomer.totalPaid,
            totalRemaining: selectedCustomer.totalRemaining,
            pendingBills: selectedCustomer.pendingBills
          }}
          onClose={() => setShowCreditBill(false)}
        />
      )}

      {/* Pay Modal */}
      {showPayModal && (
        <div className="modal-overlay" onClick={() => setShowPayModal(null)}>
          <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Record Payment</h3>
              <p className="text-sm text-gray-500">{showPayModal.bill_number} • Remaining: <span className="font-bold text-amber-600">{formatCurrency(Number((showPayModal as any).remaining_amount ?? showPayModal.total))}</span></p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="label">Amount Paid Now (₹) *</label>
                <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} className="input-field" placeholder="e.g. 20000" min="0" step="0.01" />
              </div>
              <div>
                <label className="label">Payment Method</label>
                <select value={payMethod} onChange={e => setPayMethod(e.target.value)} className="input-field cursor-pointer">
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="Card">Card</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </div>
              <div>
                <label className="label">Payment Date</label>
                <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="label">Notes</label>
                <input type="text" value={payNotes} onChange={e => setPayNotes(e.target.value)} className="input-field" placeholder="e.g., Second installment" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowPayModal(null)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={handleAddPayment} className="btn-primary flex-1"><Plus className="w-4 h-4" /> Add Payment</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
