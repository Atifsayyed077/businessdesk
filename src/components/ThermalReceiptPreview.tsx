import React, { useState, useEffect } from 'react';
import { Printer, X, Settings, Copy } from 'lucide-react';
import type { ThermalReceiptData, PaperSize } from '../lib/thermalReceipt';
import { renderThermalText, PAPER_PROFILES } from '../lib/thermalReceipt';
import { printerManager } from '../lib/printer';

interface ThermalReceiptPreviewProps {
  receiptData: ThermalReceiptData;
  onClose: () => void;
  onPrint?: () => void;
}

export default function ThermalReceiptPreview({ receiptData, onClose, onPrint }: ThermalReceiptPreviewProps) {
  const [paperSize, setPaperSize] = useState<PaperSize>('80mm');
  const [printing, setPrinting] = useState(false);
  const [copies, setCopies] = useState(1);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const settings = printerManager.getSettings();
    setPaperSize(settings.paperSize);
    setCopies(settings.copies);
  }, []);

  const handlePrint = async () => {
    setPrinting(true);
    setStatus(null);
    try {
      const text = renderThermalText(receiptData, paperSize);
      // Update copies in settings
      printerManager.saveSettings({ copies, paperSize });
      await printerManager.printText(text);
      setStatus('Print sent successfully');
      if (onPrint) onPrint();
      setTimeout(() => setStatus(null), 3000);
    } catch (e: any) {
      setStatus(`Print failed: ${e.message || 'Unknown error'}`);
    } finally {
      setPrinting(false);
    }
  };

  const text = renderThermalText(receiptData, paperSize);
  const profile = PAPER_PROFILES[paperSize];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-4xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50 rounded-t-xl no-print">
          <div>
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <Printer className="w-4 h-4 text-blue-600" />
              Thermal Print Preview — {paperSize}
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              {profile.columns} columns • {profile.contentWidthMm}mm content • Auto height • {receiptData.items.length} items
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-lg cursor-pointer">
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        <div className="p-6 bg-gray-100 flex justify-center overflow-auto max-h-[70vh]">
          {/* Narrow thermal receipt preview */}
          <div
            className="bg-white shadow-lg border border-gray-300 overflow-hidden"
            style={{
              width: paperSize === '80mm' ? '80mm' : '58mm',
              minHeight: 'auto',
            }}
          >
            <div
              className="p-2"
              style={{
                width: `${profile.contentWidthMm}mm`,
                margin: '0 auto',
                fontFamily: '"Courier New", monospace',
                fontSize: paperSize === '80mm' ? '11px' : '9px',
                lineHeight: '1.3',
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word',
                color: 'black',
                background: 'white',
              }}
            >
              <pre style={{ margin: 0, fontFamily: 'inherit', fontSize: 'inherit', lineHeight: 'inherit', whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
                {text}
              </pre>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="p-4 border-t border-gray-200 bg-white rounded-b-xl no-print">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-700">Paper:</label>
              <select
                value={paperSize}
                onChange={e => setPaperSize(e.target.value as PaperSize)}
                className="text-xs border border-gray-300 rounded px-2 py-1 bg-white cursor-pointer"
              >
                <option value="80mm">80mm (48 cols)</option>
                <option value="58mm">58mm (32 cols)</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-700">Copies:</label>
              <input
                type="number"
                min="1"
                max="10"
                value={copies}
                onChange={e => setCopies(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                className="w-16 text-xs border border-gray-300 rounded px-2 py-1 text-center"
              />
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-gray-500">{receiptData.documentNumber} • {receiptData.items.length} items</span>
            </div>
          </div>

          {status && (
            <div className={`mb-3 text-xs p-2 rounded ${status.includes('failed') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
              {status}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              disabled={printing}
              className="flex-1 btn-primary justify-center py-2.5 disabled:opacity-50"
            >
              <Printer className="w-4 h-4" />
              {printing ? 'Printing...' : `Print ${copies > 1 ? `(${copies} copies)` : ''}`}
            </button>
            <button onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button
              onClick={() => {
                const settings = printerManager.getSettings();
                window.open('', '_blank');
              }}
              className="btn-secondary"
              title="Printer Settings"
              onClickCapture={() => {
                // This will be handled by parent
              }}
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">
            Preview = printed receipt • Monospace • Auto height • {paperSize} • Ctrl+P
          </p>
        </div>
      </div>
    </div>
  );
}
