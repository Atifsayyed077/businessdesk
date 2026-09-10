import React, { useRef, useState, useEffect } from 'react';
import { X, Printer, Download, Share2, Clock, CreditCard, DollarSign } from 'lucide-react';
import { formatCurrency, formatDisplayDate, getISTTime, getSetting } from '../lib/utils';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';

interface CreditTransactionBillProps {
  customerName: string;
  customerMobile: string;
  bills: any[];
  payments: any[];
  totals: { totalCredit: number; totalPaid: number; totalRemaining: number; pendingBills: number };
  onClose: () => void;
}

export default function CreditTransactionBill({ customerName, customerMobile, bills, payments, totals, onClose }: CreditTransactionBillProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [storeInfo, setStoreInfo] = useState({ name: 'BusinessDesk', address: '', phone: '', email: '' });
  const [downloading, setDownloading] = useState(false);

  const now = new Date();
  const billTime = getISTTime(now.toISOString());
  const displayDate = formatDisplayDate(now.toISOString().slice(0, 10));
  const creditBillNo = `CRD-${Date.now().toString().slice(-6)}`;

  useEffect(() => {
    async function load() {
      const [name, address, phone, email] = await Promise.all([
        getSetting('store_name'),
        getSetting('store_address'),
        getSetting('store_phone'),
        getSetting('store_email'),
      ]);
      setStoreInfo({
        name: name || 'BusinessDesk',
        address: address || '',
        phone: phone || '',
        email: email || ''
      });
    }
    load();
  }, []);

  const handlePrint = () => window.print();

  const handleDownload = async () => {
    if (!printRef.current) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(printRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const margin = 5;
      const imgWidth = pdfWidth - margin * 2;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', margin, margin, imgWidth, imgHeight);
      let heightLeft = imgHeight - (pdf.internal.pageSize.getHeight() - margin * 2);
      while (heightLeft > 0) {
        pdf.addPage();
        const y = margin - (imgHeight - heightLeft);
        pdf.addImage(imgData, 'PNG', margin, y, imgWidth, imgHeight);
        heightLeft -= (pdf.internal.pageSize.getHeight() - margin * 2);
      }
      pdf.save(`${creditBillNo}_${customerName.replace(/\s+/g, '_')}.pdf`);
    } finally {
      setDownloading(false);
    }
  };

  const isClear = totals.totalRemaining <= 0.01;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-3xl" onClick={e => e.stopPropagation()}>
        <div className="no-print flex items-center justify-between p-3 border-b border-gray-100 bg-gray-50 rounded-t-xl">
          <div>
            <h3 className="font-semibold text-gray-800 flex items-center gap-2"><CreditCard className="w-4 h-4 text-amber-600" /> Credit Transaction Bill</h3>
            <p className="text-xs text-gray-500">{creditBillNo} • {displayDate} {billTime} IST</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={handlePrint} className="btn-secondary text-xs py-1.5"><Printer className="w-3.5 h-3.5" /> Print</button>
            <button onClick={handleDownload} disabled={downloading} className="btn-secondary text-xs py-1.5 disabled:opacity-50"><Download className="w-3.5 h-3.5" />{downloading ? '...' : ' PDF'}</button>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded-lg"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div ref={printRef} className="p-6 sm:p-8 bg-white">
          <div className="border border-amber-200 rounded-lg overflow-hidden bg-white">
            {/* Header */}
            <div className="bg-amber-600 text-white px-6 py-4">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2"><CreditCard className="w-5 h-5" /> {storeInfo.name}</h2>
                  {storeInfo.address && <p className="text-xs text-amber-100 mt-1">{storeInfo.address}</p>}
                  {(storeInfo.phone || storeInfo.email) && <p className="text-xs text-amber-100 mt-1">{storeInfo.phone ? `Ph: ${storeInfo.phone}` : ''} {storeInfo.phone && storeInfo.email ? ' • ' : ''} {storeInfo.email || ''}</p>}
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold tracking-widest">CREDIT STATEMENT</p>
                  <p className="text-xs text-amber-100 mt-1 font-mono">{creditBillNo}</p>
                  <p className="text-xs text-amber-100">{displayDate}</p>
                  <p className="text-xs text-amber-200 flex items-center justify-end gap-1"><Clock className="w-3 h-3" /> {billTime} IST</p>
                </div>
              </div>
            </div>

            {/* Customer */}
            <div className="px-6 py-4 grid grid-cols-2 gap-6 bg-amber-50/50 border-b border-amber-100">
              <div>
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Customer</p>
                <p className="font-bold text-gray-900 text-lg">{customerName}</p>
                <p className="text-sm text-gray-600">Mobile: {customerMobile}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Status</p>
                <span className={`inline-flex px-3 py-1.5 rounded-full text-sm font-bold ${isClear ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-amber-100 text-amber-700 border border-amber-200'}`}>
                  {isClear ? '✓ CLEAR' : '● CREDIT'}
                </span>
                <p className="text-xs text-gray-500 mt-1">{bills.length} bills • {payments.length} payments</p>
              </div>
            </div>

            {/* Totals Cards */}
            <div className="px-6 py-4 grid grid-cols-3 gap-3 bg-white border-b border-gray-100">
              <div className="bg-gray-50 rounded-lg p-3 text-center border">
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">Total Credit</p>
                <p className="text-lg font-bold text-gray-900">{formatCurrency(totals.totalCredit)}</p>
                <p className="text-xs text-gray-400">{totals.pendingBills} pending bills</p>
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center border border-green-200">
                <p className="text-[10px] text-green-600 uppercase tracking-wide">Total Paid</p>
                <p className="text-lg font-bold text-green-700">{formatCurrency(totals.totalPaid)}</p>
                <p className="text-xs text-green-600">{payments.length} payments</p>
              </div>
              <div className={`rounded-lg p-3 text-center border ${isClear ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                <p className={`text-[10px] uppercase tracking-wide ${isClear ? 'text-green-600' : 'text-amber-600'}`}>Remaining Due</p>
                <p className={`text-lg font-bold ${isClear ? 'text-green-700' : 'text-amber-700'}`}>{formatCurrency(totals.totalRemaining)}</p>
                <p className={`text-xs ${isClear ? 'text-green-600' : 'text-amber-600'}`}>{isClear ? 'All Clear ✓' : 'Outstanding'}</p>
              </div>
            </div>

            {/* Bills Table */}
            <div className="px-6 py-4">
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2 flex items-center gap-1">📋 Bills Included ({bills.length})</h4>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-amber-600 text-white">
                    <th className="py-2 px-2 text-left">Bill No</th>
                    <th className="py-2 px-2 text-left">Date</th>
                    <th className="py-2 px-2 text-right">Total</th>
                    <th className="py-2 px-2 text-right">Paid</th>
                    <th className="py-2 px-2 text-right">Due</th>
                    <th className="py-2 px-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map((b: any, i: number) => {
                    const paid = Number(b.paid_amount ?? (b.payment_status === 'Paid' ? b.total : 0));
                    const remaining = Number(b.remaining_amount ?? (b.total - paid));
                    const isBillClear = remaining <= 0.01;
                    return (
                      <tr key={b.id || i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="py-2 px-2 font-mono text-blue-600">{b.bill_number}</td>
                        <td className="py-2 px-2">{formatDisplayDate(b.date)}</td>
                        <td className="py-2 px-2 text-right">{formatCurrency(b.total)}</td>
                        <td className="py-2 px-2 text-right text-green-600">{formatCurrency(paid)}</td>
                        <td className="py-2 px-2 text-right font-bold text-amber-600">{formatCurrency(remaining)}</td>
                        <td className="py-2 px-2 text-center">{isBillClear ? <span className="text-green-600 text-[10px] font-bold">✓ CLEAR</span> : <span className="text-amber-600 text-[10px] font-bold">CREDIT</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                    <td colSpan={2} className="py-2 px-2 text-right">TOTAL:</td>
                    <td className="py-2 px-2 text-right">{formatCurrency(totals.totalCredit)}</td>
                    <td className="py-2 px-2 text-right text-green-700">{formatCurrency(totals.totalPaid)}</td>
                    <td className="py-2 px-2 text-right text-amber-700">{formatCurrency(totals.totalRemaining)}</td>
                    <td className="py-2 px-2 text-center">{isClear ? 'CLEAR' : 'CREDIT'}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Payment History */}
            {payments.length > 0 && (
              <div className="px-6 pb-4">
                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2 flex items-center gap-1"><DollarSign className="w-3 h-3" /> Payment History ({payments.length})</h4>
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-green-600 text-white">
                      <th className="py-2 px-2 text-left">Date</th>
                      <th className="py-2 px-2 text-left">Bill No</th>
                      <th className="py-2 px-2 text-right">Amount</th>
                      <th className="py-2 px-2 text-center">Method</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p: any, i: number) => (
                      <tr key={p.id || i} className={i % 2 === 0 ? 'bg-white' : 'bg-green-50/50'}>
                        <td className="py-1.5 px-2">{p.payment_date ? formatDisplayDate(p.payment_date) : formatDisplayDate(p.created)}</td>
                        <td className="py-1.5 px-2 font-mono">{p.bill_number}</td>
                        <td className="py-1.5 px-2 text-right font-bold text-green-700">{formatCurrency(p.amount)}</td>
                        <td className="py-1.5 px-2 text-center"><span className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px]">{p.payment_method}</span></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-green-50 font-bold border-t border-green-200">
                      <td colSpan={2} className="py-2 px-2 text-right">Total Paid:</td>
                      <td className="py-2 px-2 text-right text-green-700">{formatCurrency(totals.totalPaid)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Footer */}
            <div className="px-6 py-3 bg-amber-50 border-t border-amber-100 flex justify-between items-center">
              <div className="text-xs text-gray-600">
                <p>Thank you! {isClear ? 'All dues cleared ✓' : `Please pay remaining ${formatCurrency(totals.totalRemaining)} at earliest`}</p>
                <p className="text-[10px] text-gray-400 mt-1">Generated: {displayDate} {billTime} IST • {storeInfo.name} • System: BusinessDesk</p>
              </div>
              <div className="text-right">
                <div className="w-32 h-6 border-b border-gray-400 mb-1"></div>
                <p className="text-[10px] font-semibold text-gray-600">Authorized Signatory</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
