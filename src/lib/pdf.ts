import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Bill } from '../types';
import { formatCurrency, formatDisplayDate, getISTTime, getSetting } from './utils';
import html2canvas from 'html2canvas-pro';

// Single definition: invoice HTML is the source for both preview and PDF
// This HTML matches InvoicePreview.tsx exactly - change in one place updates both

function validateBill(bill: Bill): Bill {
  const safeBill = { ...bill };
  if (!safeBill.date || typeof safeBill.date !== 'string' || safeBill.date.includes('Invalid')) {
    const now = new Date();
    safeBill.date = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  } else {
    safeBill.date = safeBill.date.trim().split(' ')[0].split('T')[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(safeBill.date)) {
      const now = new Date();
      safeBill.date = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    }
  }
  safeBill.subtotal = Number(safeBill.subtotal) || 0;
  safeBill.labour_total = Number(safeBill.labour_total) || 0;
  safeBill.total = Number(safeBill.total) || (safeBill.subtotal + safeBill.labour_total);
  safeBill.items = (safeBill.items || []).map(item => ({
    ...item,
    quantity: Number(item.quantity) || 0,
    unit_price: Number(item.unit_price) || 0,
    labour_charge: Number(item.labour_charge) || 0,
    total: Number(item.total) || (Number(item.quantity) * Number(item.unit_price)),
  }));
  return safeBill;
}

async function getStoreInfo() {
  const [name, address, phone, email] = await Promise.all([
    getSetting('store_name'),
    getSetting('store_address'),
    getSetting('store_phone'),
    getSetting('store_email'),
  ]);
  return {
    name: name || 'BusinessDesk',
    address: address || '',
    phone: phone || '',
    email: email || '',
  };
}

function getBillTime(bill: Bill): string {
  if (bill.created_at) {
    try {
      const t = getISTTime(bill.created_at);
      if (t && !t.includes('Invalid')) return t;
    } catch {}
  }
  try {
    const t = getISTTime();
    if (t && !t.includes('Invalid')) return t;
  } catch {}
  return '';
}

// Generate invoice HTML string - identical to InvoicePreview.tsx
function getInvoiceHTML(bill: Bill, store: { name: string; address: string; phone: string; email: string }): string {
  const time = getBillTime(bill);
  const displayDate = formatDisplayDate(bill.date);
  const safeDisplayDate = displayDate.includes('Invalid') ? formatDisplayDate(new Date().toISOString().slice(0, 10)) : displayDate;
  const dateTime = `${safeDisplayDate} at ${time} IST`;

  const itemsRows = bill.items.map((item, i) => `
    <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}">
      <td style="padding:10px 8px; font-size:13px; color:#64748b; text-align:center; border-bottom:1px solid #f1f5f9;">${i + 1}</td>
      <td style="padding:10px 8px; font-size:13px; font-weight:500; color:#0f172a; border-bottom:1px solid #f1f5f9; word-break:break-word;">${item.product_name}</td>
      <td style="padding:10px 8px; font-size:13px; color:#334155; text-align:center; font-weight:500; border-bottom:1px solid #f1f5f9;">${item.quantity}</td>
      <td style="padding:10px 8px; font-size:13px; color:#475569; text-align:right; border-bottom:1px solid #f1f5f9;">${formatCurrency(item.unit_price)}</td>
      <td style="padding:10px 8px; font-size:13px; color:#475569; text-align:right; border-bottom:1px solid #f1f5f9;">${formatCurrency(item.labour_charge)}</td>
      <td style="padding:10px 8px; font-size:13px; font-weight:700; color:#0f172a; text-align:right; border-bottom:1px solid #f1f5f9;">${formatCurrency(item.unit_price * item.quantity)}</td>
    </tr>
  `).join('');

  return `
    <div style="border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; background:white; font-family:Inter, sans-serif; width:740px;">
      <div style="background:#1e293b; color:white; padding:20px 24px; display:flex; justify-content:space-between; align-items:flex-start;">
        <div style="flex:1;">
          <div style="font-size:18px; font-weight:700; line-height:1.2;">${store.name}</div>
          ${store.address ? `<div style="font-size:11px; color:#cbd5e1; margin-top:4px;">${store.address}</div>` : ''}
          ${(store.phone || store.email) ? `<div style="font-size:11px; color:#cbd5e1; margin-top:4px;">${store.phone ? `Ph: ${store.phone}` : ''} ${store.phone && store.email ? ' • ' : ''} ${store.email || ''}</div>` : ''}
          <div style="font-size:9px; color:#94a3b8; margin-top:4px;">Inventory & Billing Management</div>
        </div>
        <div style="text-align:right; flex-shrink:0; margin-left:16px;">
          <div style="font-size:13px; font-weight:700; letter-spacing:0.1em;">TAX INVOICE</div>
          <div style="font-size:11px; color:#cbd5e1; margin-top:4px; font-family:monospace;">${bill.bill_number}</div>
          <div style="font-size:11px; color:#cbd5e1;">${safeDisplayDate}</div>
          <div style="font-size:11px; color:#94a3b8; display:flex; align-items:center; justify-content:flex-end; gap:4px;"><span>🕒</span> ${time} IST</div>
        </div>
      </div>

      <div style="padding:16px 24px; display:flex; gap:24px; background:#f8fafc; border-bottom:1px solid #e2e8f0;">
        <div style="flex:1;">
          <div style="font-size:9px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Bill To</div>
          <div style="font-weight:600; color:#0f172a; font-size:14px;">${bill.customer_name}</div>
          <div style="font-size:13px; color:#475569;">Mobile: ${bill.customer_mobile}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:9px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Payment</div>
          <span style="display:inline-block; padding:4px 10px; border-radius:9999px; font-size:11px; font-weight:700; ${bill.payment_status === 'Paid' ? 'background:#dcfce7; color:#15803d; border:1px solid #bbf7d0;' : 'background:#fef3c7; color:#b45309; border:1px solid #fde68a;'}">${bill.payment_status.toUpperCase()}</span>
          <div style="font-size:11px; color:#64748b; margin-top:6px;">${bill.payment_status === 'Paid' ? 'Paid in Full' : 'Payment Pending'}</div>
        </div>
      </div>

      <div style="padding:0 24px;">
        <table style="width:100%; border-collapse:collapse; margin-top:8px;">
          <thead>
            <tr style="background:#2563eb; color:white;">
              <th style="padding:10px 8px; text-align:left; font-size:10px; font-weight:600; text-transform:uppercase;">#</th>
              <th style="padding:10px 8px; text-align:left; font-size:10px; font-weight:600; text-transform:uppercase;">Product</th>
              <th style="padding:10px 8px; text-align:center; font-size:10px; font-weight:600; text-transform:uppercase;">Qty</th>
              <th style="padding:10px 8px; text-align:right; font-size:10px; font-weight:600; text-transform:uppercase;">Rate</th>
              <th style="padding:10px 8px; text-align:right; font-size:10px; font-weight:600; text-transform:uppercase;">Add. Charge</th>
              <th style="padding:10px 8px; text-align:right; font-size:10px; font-weight:600; text-transform:uppercase;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows || `<tr><td colspan="6" style="padding:20px; text-align:center; color:#94a3b8;">No items</td></tr>`}
          </tbody>
        </table>
      </div>

      <div style="padding:16px 24px 8px 24px; display:flex; justify-content:flex-end; background:white;">
        <div style="width:280px; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;">
          <div style="padding:12px; background:white;">
            <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:8px;"><span style="color:#64748b;">Subtotal</span><span style="font-weight:500; color:#0f172a;">${formatCurrency(bill.subtotal)}</span></div>
            <div style="display:flex; justify-content:space-between; font-size:13px;"><span style="color:#64748b;">Additional Charges</span><span style="font-weight:500; color:#0f172a;">${formatCurrency(bill.labour_total)}</span></div>
          </div>
          <div style="background:#1e293b; color:white; padding:10px 12px; display:flex; justify-content:space-between; align-items:center;">
            <span style="font-weight:700; font-size:13px; letter-spacing:0.05em;">GRAND TOTAL</span>
            <span style="font-weight:700; font-size:13px;">${formatCurrency(bill.total)}</span>
          </div>
          <div style="padding:8px 12px; background:#f8fafc; display:flex; justify-content:space-between; font-size:11px;"><span style="color:#64748b;">Status</span><span style="font-weight:700; ${bill.payment_status === 'Paid' ? 'color:#15803d;' : 'color:#b45309;'}">${bill.payment_status}</span></div>
        </div>
      </div>
      <div style="padding:8px 24px 16px 24px; text-align:right; font-size:10px; color:#64748b; background:white;">Generated: ${dateTime}</div>

      ${bill.notes ? `<div style="padding:12px 24px;"><div style="font-size:9px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Notes / Remarks</div><div style="font-size:13px; color:#475569; background:#f8fafc; border:1px solid #f1f5f9; border-radius:6px; padding:8px;">${bill.notes}</div></div>` : ''}

      <div style="padding:12px 24px; background:#f8fafc; border-top:1px solid #f1f5f9;">
        <div style="font-size:9px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.05em;">Terms & Conditions</div>
        <div style="font-size:11px; color:#64748b; margin-top:4px;">1. Payment due as per terms above. 2. Computer-generated invoice — no signature required for digital copy.</div>
        <div style="font-size:10px; color:#94a3b8; margin-top:4px;">Invoice: ${bill.bill_number} • Date: ${safeDisplayDate} • Time: ${time} IST • System: BusinessDesk</div>
      </div>

      <div style="padding:16px 24px; display:flex; justify-content:space-between; align-items:flex-end; border-top:1px solid #e2e8f0; font-size:12px;">
        <div style="font-size:11px; color:#64748b;"><div>Thank you for your business!</div><div style="margin-top:4px;">For <span style="font-weight:600; color:#334155;">${store.name}</span></div></div>
        <div style="text-align:right;"><div style="width:160px; height:32px; border-bottom:1px solid #cbd5e1; margin-bottom:4px;"></div><div style="font-size:11px; font-weight:600; color:#334155;">Authorized Signatory</div></div>
      </div>
    </div>
  `;
}

// Helper: generate PDF from HTML element via html2canvas (single definition)
async function generatePDFFromElement(element: HTMLElement, filename: string): Promise<Blob> {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  });
  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pdfWidth;
  const imgHeight = (canvas.height * pdfWidth) / canvas.width;

  if (imgHeight <= pdfHeight) {
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, imgHeight);
  } else {
    // Scale to fit one page for now (professional single-page invoice)
    // For multi-page, we would split, but single-page is required
    const scale = pdfHeight / imgHeight;
    const scaledWidth = imgWidth * scale;
    const scaledHeight = pdfHeight;
    const x = (pdfWidth - scaledWidth) / 2;
    pdf.addImage(imgData, 'PNG', x, 0, scaledWidth, scaledHeight);
  }
  return pdf.output('blob');
}

export async function generateInvoicePDF(bill: Bill): Promise<string> {
  const safeBill = validateBill(bill);
  const store = await getStoreInfo();
  // Create hidden container with single-definition HTML
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '800px';
  container.style.background = 'white';
  container.innerHTML = getInvoiceHTML(safeBill, store);
  document.body.appendChild(container);
  try {
    await document.fonts.ready;
    const canvas = await html2canvas(container, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const margin = 5;
    const imgWidth = pdfWidth - margin * 2;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    // Full page width, top-aligned with small margin - fills page width
    pdf.addImage(imgData, 'PNG', margin, margin, imgWidth, imgHeight);
    // Handle overflow to next page if needed
    let heightLeft = imgHeight - (pdf.internal.pageSize.getHeight() - margin * 2);
    let y = margin;
    while (heightLeft > 0) {
      pdf.addPage();
      y = margin - (imgHeight - heightLeft);
      pdf.addImage(imgData, 'PNG', margin, y, imgWidth, imgHeight);
      heightLeft -= (pdf.internal.pageSize.getHeight() - margin * 2);
    }
    const filename = `${safeBill.bill_number}.pdf`;
    pdf.save(filename);
    return filename;
  } finally {
    document.body.removeChild(container);
  }
}

export async function generateInvoicePDFBlob(bill: Bill): Promise<Blob> {
  const safeBill = validateBill(bill);
  const store = await getStoreInfo();
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '800px';
  container.style.background = 'white';
  container.innerHTML = getInvoiceHTML(safeBill, store);
  document.body.appendChild(container);
  try {
    await document.fonts.ready;
    const canvas = await html2canvas(container, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const margin = 5;
    const imgWidth = pdfWidth - margin * 2;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    pdf.addImage(imgData, 'PNG', margin, margin, imgWidth, imgHeight);
    let heightLeft = imgHeight - (pdf.internal.pageSize.getHeight() - margin * 2);
    let y = margin;
    while (heightLeft > 0) {
      pdf.addPage();
      y = margin - (imgHeight - heightLeft);
      pdf.addImage(imgData, 'PNG', margin, y, imgWidth, imgHeight);
      heightLeft -= (pdf.internal.pageSize.getHeight() - margin * 2);
    }
    return pdf.output('blob');
  } finally {
    document.body.removeChild(container);
  }
}

export async function shareInvoicePDFViaWhatsApp(bill: Bill): Promise<boolean> {
  try {
    const safeBill = validateBill(bill);
    const blob = await generateInvoicePDFBlob(safeBill);
    const file = new File([blob], `${safeBill.bill_number}.pdf`, { type: 'application/pdf' });

    // Mobile: directly share PDF file to WhatsApp via Web Share API
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `Invoice ${safeBill.bill_number}`,
          text: `Invoice ${safeBill.bill_number} for ${safeBill.customer_name} - Total ${formatCurrency(safeBill.total)} • ${formatDisplayDate(safeBill.date)} ${getBillTime(safeBill)} IST`,
        });
        return true;
      } catch (e: any) {
        if (e?.name === 'AbortError') return true;
        console.warn('Web Share with file failed, falling back', e);
      }
    }

    // Desktop/mobile fallback: download PDF and open WhatsApp
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeBill.bill_number}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);

    const phone = safeBill.customer_mobile?.replace(/\D/g, '').slice(-10);
    if (phone) {
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const text = `*TAX INVOICE* ${safeBill.bill_number}\nCustomer: ${safeBill.customer_name}\nDate: ${formatDisplayDate(safeBill.date)} ${getBillTime(safeBill)} IST\nAmount: ${formatCurrency(safeBill.total)} (${safeBill.payment_status})\n\nPDF downloaded - please open WhatsApp, select ${safeBill.customer_name}, and attach ${safeBill.bill_number}.pdf`;
      const waUrl = isMobile
        ? `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`
        : `https://web.whatsapp.com/send?phone=91${phone}&text=${encodeURIComponent(text)}`;
      setTimeout(() => window.open(waUrl, '_blank'), 600);
    } else {
      alert(`PDF downloaded as ${safeBill.bill_number}.pdf - please share it manually on WhatsApp.`);
    }
    return true;
  } catch (e: any) {
    console.error('shareInvoicePDFViaWhatsApp error', e);
    // Last resort: try text share
    try {
      const safeBill = validateBill(bill);
      const phone = safeBill.customer_mobile?.replace(/\D/g, '').slice(-10);
      if (phone) {
        const text = `Invoice ${safeBill.bill_number} for ${safeBill.customer_name} - ${formatCurrency(safeBill.total)}`;
        window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(text)}`, '_blank');
      }
    } catch {}
    return false;
  }
}

export async function generateBillsPDF(bills: Bill[]) {
  // Report PDF can keep table-based generation (different from invoice)
  const doc = new jsPDF();
  // Use helvetica for report (no ₹ issue as much, but we keep Noto if available)
  doc.setFont('helvetica', 'normal');
  const storeName = (await getSetting('store_name')) || 'BusinessDesk';
  const now = new Date();
  const time = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(`${storeName} - Sales Report`, 14, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(180, 190, 210);
  doc.text(`Generated: ${dateStr} at ${time} IST  •  ${bills.length} bills`, 14, 17);

  autoTable(doc, {
    startY: 26,
    head: [['Bill No', 'Customer', 'Mobile', 'Date', 'Time', 'Items', 'Subtotal', 'Charges', 'Total', 'Status']],
    body: bills.map(b => [
      b.bill_number,
      b.customer_name,
      b.customer_mobile,
      formatDisplayDate(b.date),
      b.created_at ? getISTTime(b.created_at) : '',
      String(b.items?.length || 0),
      formatCurrency(b.subtotal),
      formatCurrency(b.labour_total),
      formatCurrency(b.total),
      b.payment_status
    ]),
    theme: 'grid',
    headStyles: { fillColor: [37, 99, 235], fontStyle: 'bold', fontSize: 6.5, halign: 'center' },
    bodyStyles: { fontSize: 7, cellPadding: 1.8 },
    columnStyles: {
      0: { halign: 'left' },
      4: { halign: 'center' },
      6: { halign: 'right' },
      7: { halign: 'right' },
      8: { halign: 'right', fontStyle: 'bold' },
      9: { halign: 'center' },
    },
    styles: { lineColor: [226, 232, 240], lineWidth: 0.15, overflow: 'linebreak' },
    margin: { left: 8, right: 8 },
  });

  const finalY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 6 : 40;
  if (finalY > 265) doc.addPage();
  const y = finalY > 270 ? 15 : finalY;

  const totalAmount = bills.reduce((sum, b) => sum + Number(b.total || 0), 0);
  const totalSubtotal = bills.reduce((sum, b) => sum + Number(b.subtotal || 0), 0);
  const totalCharges = bills.reduce((sum, b) => sum + Number(b.labour_total || 0), 0);
  const paidAmount = bills.filter(b => b.payment_status === 'Paid').reduce((sum, b) => sum + Number(b.total || 0), 0);
  const pendingAmount = bills.filter(b => b.payment_status === 'Pending').reduce((sum, b) => sum + Number(b.total || 0), 0);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(`Total Bills: ${bills.length}`, 14, y);
  doc.text(`Subtotal: ${formatCurrency(totalSubtotal)}`, 14, y + 5);
  doc.text(`Charges: ${formatCurrency(totalCharges)}`, 14, y + 10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Grand Total: ${formatCurrency(totalAmount)}`, 14, y + 15);
  doc.setFont('helvetica', 'normal');
  doc.text(`Paid: ${formatCurrency(paidAmount)}`, 110, y);
  doc.text(`Pending: ${formatCurrency(pendingAmount)}`, 110, y + 5);
  doc.setFontSize(6);
  doc.setTextColor(100, 116, 139);
  doc.text(`Report time: ${dateStr} ${time} IST`, 14, y + 20);

  const filename = `Sales_Report_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
  return filename;
}
