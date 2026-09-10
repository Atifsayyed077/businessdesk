import React, { useRef, useState, useEffect } from 'react';
import {
  X,
  Printer,
  Download,
  Share2,
  FileText,
  MessageCircle,
  Clock
} from 'lucide-react';
import { formatCurrency, formatDisplayDate, getISTTime, getSetting } from '../lib/utils';
import type { Bill } from '../types';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';

interface InvoicePreviewProps {
  bill: Bill;
  onClose: () => void;
}

export default function InvoicePreview({ bill, onClose }: InvoicePreviewProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [storeInfo, setStoreInfo] = useState({ name: 'BusinessDesk', address: '', phone: '', email: '' });
  const [sharing, setSharing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const billTime = bill.created_at ? getISTTime(bill.created_at) : getISTTime();
  const billDateTime = `${formatDisplayDate(bill.date)} at ${billTime} IST`;
  const safeBillNumber = bill.bill_number || 'INV-1001';

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

  const handlePrint = () => {
    window.print();
  };

  // Single definition: preview HTML is the PDF source - full page A4
  const downloadPDFFromPreview = async (): Promise<Blob | null> => {
    if (!printRef.current) return null;
    try {
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: printRef.current.scrollWidth,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const margin = 5;
      const imgWidth = pdfWidth - margin * 2;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      // Full page width, top-aligned with small margin - no huge blank
      pdf.addImage(imgData, 'PNG', margin, margin, imgWidth, imgHeight);
      // If content overflows, add new page (for multi-product invoices)
      let heightLeft = imgHeight - (pdfHeight - margin * 2);
      let y = margin;
      while (heightLeft > 0) {
        pdf.addPage();
        y = margin - (imgHeight - heightLeft);
        pdf.addImage(imgData, 'PNG', margin, y, imgWidth, imgHeight);
        heightLeft -= (pdfHeight - margin * 2);
      }
      return pdf.output('blob');
    } catch (e) {
      console.error('PDF generation from preview failed', e);
      return null;
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const blob = await downloadPDFFromPreview();
      if (!blob) {
        alert('Failed to generate PDF');
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeBillNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setDownloading(false);
    }
  };

  const handleWhatsAppText = () => {
    const phone = bill.customer_mobile?.replace(/\D/g, '').slice(-10);
    if (!phone) {
      alert('Customer has no mobile number to share the invoice.');
      return;
    }

    const lines = [
      `*TAX INVOICE*`,
      `${storeInfo.name}`,
      storeInfo.address ? `${storeInfo.address}` : '',
      storeInfo.phone ? `Ph: ${storeInfo.phone}` : '',
      `============================`,
      `Invoice No: ${bill.bill_number}`,
      `Date: ${formatDisplayDate(bill.date)}  Time: ${billTime} IST`,
      `---------------------------`,
      `Bill To: ${bill.customer_name}`,
      `Mobile: ${bill.customer_mobile}`,
      `===========================`,
      ...bill.items.map((item, i) => `${i + 1}. ${item.product_name}\n   Qty: ${item.quantity} x ${formatCurrency(item.unit_price)}\n   Add. Charge: ${formatCurrency(item.labour_charge)}/unit\n   Amount: ${formatCurrency(item.unit_price * item.quantity)}`),
      `===========================`,
      `Subtotal: ${formatCurrency(bill.subtotal)}`,
      `Additional Charges: ${formatCurrency(bill.labour_total)}`,
      `*GRAND TOTAL: ${formatCurrency(bill.total)}*`,
      `Payment: ${bill.payment_status}`,
      `===========================`,
      `Thank you for your business!`,
      `Generated: ${billDateTime}`
    ].filter(l => l !== '').join('\n');

    const encoded = encodeURIComponent(lines);
    const waUrl = `https://wa.me/91${phone}?text=${encoded}`;
    window.open(waUrl, '_blank');
  };

  const handleWhatsAppPDF = async () => {
    if (!bill.customer_mobile) {
      alert('Customer has no mobile number.');
      return;
    }
    setSharing(true);
    try {
      const blob = await downloadPDFFromPreview();
      if (!blob) {
        handleWhatsAppText();
        return;
      }
      const file = new File([blob], `${safeBillNumber}.pdf`, { type: 'application/pdf' });

      // Try Web Share API with file (mobile - directly shares PDF to WhatsApp)
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `Invoice ${safeBillNumber}`,
            text: `Invoice ${safeBillNumber} for ${bill.customer_name} - Total ${formatCurrency(bill.total)} • ${formatDisplayDate(bill.date)} ${billTime} IST`,
          });
          return;
        } catch (e: any) {
          if (e?.name === 'AbortError') return;
          console.warn('Web Share failed, falling back', e);
        }
      }

      // Desktop fallback: download PDF and open WhatsApp
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeBillNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);

      // Detect mobile vs desktop for WhatsApp URL
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const phone = bill.customer_mobile.replace(/\D/g, '').slice(-10);
      const text = `*TAX INVOICE* ${safeBillNumber}\nCustomer: ${bill.customer_name}\nDate: ${formatDisplayDate(bill.date)} ${billTime} IST\nAmount: ${formatCurrency(bill.total)} (${bill.payment_status})\n\nPDF downloaded - please attach ${safeBillNumber}.pdf in WhatsApp and send.`;
      const waUrl = isMobile
        ? `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`
        : `https://web.whatsapp.com/send?phone=91${phone}&text=${encodeURIComponent(text)}`;
      
      // Small delay to ensure download starts before opening WhatsApp
      setTimeout(() => window.open(waUrl, '_blank'), 500);
    } catch (e) {
      console.error('WhatsApp PDF failed', e);
      handleWhatsAppText();
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-3xl" onClick={e => e.stopPropagation()}>
        {/* Action toolbar */}
        <div className="no-print flex items-center justify-between p-3 border-b border-gray-100 bg-gray-50 rounded-t-xl flex-wrap gap-2">
          <div>
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              Invoice Preview
            </h3>
            <p className="text-xs text-gray-500 flex items-center gap-1">
              {bill.bill_number} <span className="hidden sm:inline">•</span> <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {billDateTime}</span>
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button onClick={handlePrint} className="btn-secondary text-xs py-1.5">
              <Printer className="w-3.5 h-3.5" />
              Print
            </button>
            <button onClick={handleDownload} disabled={downloading} className="btn-secondary text-xs py-1.5 disabled:opacity-50">
              <Download className="w-3.5 h-3.5" />
              {downloading ? 'Generating...' : 'Download PDF'}
            </button>
            <button onClick={handleWhatsAppPDF} disabled={sharing} className="btn-success text-xs py-1.5 disabled:opacity-50">
              <Share2 className="w-3.5 h-3.5" />
              {sharing ? 'Sharing...' : 'WhatsApp PDF'}
            </button>
            <button onClick={handleWhatsAppText} className="btn-secondary text-xs py-1.5 border-green-200 text-green-700 hover:bg-green-50">
              <MessageCircle className="w-3.5 h-3.5" />
              Text
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-200 cursor-pointer ml-1">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Invoice document - SINGLE DEFINITION for preview, print, and PDF */}
        <div ref={printRef} className="p-6 sm:p-8 print:p-0 bg-white">
          <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
            {/* Header */}
            <div className="bg-slate-800 text-white px-6 py-4">
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold leading-tight">{storeInfo.name}</h2>
                  {storeInfo.address && <p className="text-xs text-slate-300 mt-1">{storeInfo.address}</p>}
                  {(storeInfo.phone || storeInfo.email) && (
                    <p className="text-xs text-slate-300 mt-1">
                      {storeInfo.phone ? `Ph: ${storeInfo.phone}` : ''} {storeInfo.phone && storeInfo.email ? ' • ' : ''} {storeInfo.email || ''}
                    </p>
                  )}
                  <p className="text-[10px] text-slate-400 mt-1">Inventory & Billing Management</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold tracking-widest">TAX INVOICE</p>
                  <p className="text-xs text-slate-300 mt-1 font-mono">{bill.bill_number}</p>
                  <p className="text-xs text-slate-300">{formatDisplayDate(bill.date)}</p>
                  <p className="text-xs text-slate-400 flex items-center justify-end gap-1">
                    <Clock className="w-3 h-3" /> {billTime} IST
                  </p>
                </div>
              </div>
            </div>

            {/* Bill To */}
            <div className="px-6 py-4 grid grid-cols-2 gap-6 bg-slate-50/50 border-b border-gray-200">
              <div>
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Bill To</p>
                <p className="font-semibold text-gray-900">{bill.customer_name}</p>
                <p className="text-sm text-gray-600">Mobile: {bill.customer_mobile}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Payment</p>
                <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${bill.payment_status === 'Paid' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-amber-100 text-amber-700 border border-amber-200'}`}>
                  {(bill as any).payment_method ? (bill as any).payment_method.toUpperCase() : bill.payment_status.toUpperCase()}
                </span>
                <p className="text-xs text-gray-500 mt-2">
                  {(bill as any).payment_method === 'Cash' ? 'Paid via Cash' : (bill as any).payment_method === 'UPI' ? 'Paid via UPI' : bill.payment_status === 'Paid' ? 'Paid in Full' : 'Payment Pending'}
                </p>
                {(bill as any).payment_method && (bill as any).payment_method !== bill.payment_status && (
                  <p className="text-[10px] text-gray-400">Status: {bill.payment_status}</p>
                )}
              </div>
            </div>

            {/* Items table */}
            <div className="px-6">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-y border-gray-200">
                    <th className="py-2.5 px-2 text-left text-[11px] font-semibold text-gray-700 uppercase">#</th>
                    <th className="py-2.5 px-2 text-left text-[11px] font-semibold text-gray-700 uppercase">Product</th>
                    <th className="py-2.5 px-2 text-center text-[11px] font-semibold text-gray-700 uppercase">Qty</th>
                    <th className="py-2.5 px-2 text-right text-[11px] font-semibold text-gray-700 uppercase">Rate</th>
                    <th className="py-2.5 px-2 text-right text-[11px] font-semibold text-gray-700 uppercase">Add. Charge</th>
                    <th className="py-2.5 px-2 text-right text-[11px] font-semibold text-gray-700 uppercase">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {bill.items.map((item, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="py-2.5 px-2 text-sm text-gray-500 text-center">{i + 1}</td>
                      <td className="py-2.5 px-2">
                        <p className="text-sm font-medium text-gray-900 break-words">{item.product_name}</p>
                      </td>
                      <td className="py-2.5 px-2 text-sm text-gray-700 text-center font-medium">{item.quantity}</td>
                      <td className="py-2.5 px-2 text-sm text-gray-600 text-right">{formatCurrency(item.unit_price)}</td>
                      <td className="py-2.5 px-2 text-sm text-gray-600 text-right">{formatCurrency(item.labour_charge)}</td>
                      <td className="py-2.5 px-2 text-sm font-bold text-gray-900 text-right">{formatCurrency(item.unit_price * item.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="px-6 py-4 flex justify-end bg-white">
              <div className="w-72">
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="p-3 space-y-2 bg-white">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Subtotal</span>
                      <span className="font-medium text-gray-900">{formatCurrency(bill.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Additional Charges</span>
                      <span className="font-medium text-gray-900">{formatCurrency(bill.labour_total)}</span>
                    </div>
                  </div>
                  <div className="bg-slate-800 text-white px-3 py-2.5 flex justify-between items-center">
                    <span className="font-bold text-sm tracking-wide">GRAND TOTAL</span>
                    <span className="font-bold text-sm">{formatCurrency(bill.total)}</span>
                  </div>
                  <div className="px-3 py-2 bg-gray-50 flex justify-between text-xs">
                    <span className="text-gray-500">Payment</span>
                    <span className={`font-bold ${bill.payment_status === 'Paid' ? 'text-green-600' : 'text-amber-600'}`}>
                      {(bill as any).payment_method ? `${(bill as any).payment_method} • ${bill.payment_status}` : bill.payment_status}
                    </span>
                  </div>
                </div>
                <p className="text-[10px] text-gray-400 mt-2 text-right flex items-center justify-end gap-1">
                  <Clock className="w-3 h-3" /> Generated: {billDateTime}
                </p>
              </div>
            </div>

            {/* Notes */}
            {bill.notes && (
              <div className="px-6 pb-3">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes / Remarks</p>
                <p className="text-sm text-gray-600 bg-gray-50 border border-gray-100 rounded p-2 break-words">{bill.notes}</p>
              </div>
            )}

            {/* Terms */}
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-100">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Terms & Conditions</p>
              <p className="text-[11px] text-gray-500 mt-1">1. Payment due as per terms above. 2. Computer-generated invoice — no signature required for digital copy.</p>
              <p className="text-[10px] text-gray-400 mt-1">Invoice: {bill.bill_number} • Date: {formatDisplayDate(bill.date)} • Time: {billTime} IST • System: BusinessDesk</p>
            </div>

            {/* Footer Signatures */}
            <div className="px-6 py-4 flex justify-between items-end text-sm border-t border-gray-200">
              <div className="text-xs text-gray-500">
                <p>Thank you for your business!</p>
                <p className="mt-1">For <span className="font-semibold text-gray-700">{storeInfo.name}</span></p>
              </div>
              <div className="text-right">
                <div className="w-40 h-8 border-b border-gray-300 mb-1"></div>
                <p className="text-xs font-semibold text-gray-700">Authorized Signatory</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
