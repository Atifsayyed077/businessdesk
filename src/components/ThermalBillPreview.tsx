import React, { useRef, useState } from 'react';
import { X, Printer, Settings } from 'lucide-react';
import type { ThermalReceiptData } from '../lib/thermalReceipt';
import { renderThermalText } from '../lib/thermalReceipt';
import { printerManager } from '../lib/printer';

interface ThermalBillPreviewProps {
  receiptData: ThermalReceiptData;
  onClose: () => void;
  billNumber: string;
}

export default function ThermalBillPreview({ receiptData, onClose, billNumber }: ThermalBillPreviewProps) {
  const [printing, setPrinting] = useState(false);
  const text = renderThermalText(receiptData, '80mm');

  const handlePrint = async () => {
    setPrinting(true);
    try {
      await printerManager.printText(text);
    } catch (e: any) {
      alert(e.message || 'Print failed. Check printer connection.');
    } finally {
      setPrinting(false);
    }
  };

  const handleTestPrint = async () => {
    try {
      await printerManager.testPrint();
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white rounded-t-lg">
          <div>
            <h3 className="font-semibold text-gray-800">Thermal Print Preview — 80mm</h3>
            <p className="text-xs text-gray-500">{billNumber} • {receiptData.items.length} items • Auto height</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 bg-gray-100 flex justify-center overflow-auto max-h-[65vh]">
          <div className="bg-white shadow border border-gray-300" style={{ width: '80mm', minHeight: 'auto' }}>
            <pre
              style={{
                fontFamily: '"Courier New", monospace',
                fontSize: '11px',
                lineHeight: '1.3',
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word',
                margin: 0,
                padding: '4mm',
                width: '72mm',
                marginLeft: 'auto',
                marginRight: 'auto',
                color: 'black',
                background: 'white',
              }}
            >
              {text}
            </pre>
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 bg-white rounded-b-lg">
          <div className="flex gap-2">
            <button onClick={handlePrint} disabled={printing} className="flex-1 btn-primary justify-center py-2.5 disabled:opacity-50">
              <Printer className="w-4 h-4" />
              {printing ? 'Printing...' : 'Print Bill (80mm)'}
            </button>
            <button onClick={onClose} className="btn-secondary">
              Close
            </button>
          </div>
          <div className="flex gap-2 mt-2">
            <button onClick={handleTestPrint} className="flex-1 btn-secondary text-xs py-1.5 justify-center">
              Test Print
            </button>
            <span className="text-xs text-gray-400 flex items-center">
              {receiptData.items.length} items • Dynamic height • 80mm
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">
            Preview = printed receipt • Monospace • Thermal • Ctrl+P
          </p>
        </div>
      </div>
    </div>
  );
}
