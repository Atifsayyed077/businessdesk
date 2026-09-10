import React, { useState, useEffect } from 'react';
import { Printer, Save, TestTube, Scissors, DollarSign, Package, User, FileText, AlignLeft, Copy } from 'lucide-react';
import { printerManager } from '../lib/printer';
import type { PrinterSettings } from '../lib/printer';
import { PAPER_PROFILES } from '../lib/thermalReceipt';

export default function PrinterSettings() {
  const [settings, setSettings] = useState<PrinterSettings>(printerManager.getSettings());
  const [printers, setPrinters] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    setSettings(printerManager.getSettings());
    printerManager.getPrinters().then(setPrinters).catch(() => setPrinters([]));
  }, []);

  const handleSave = () => {
    setSaving(true);
    printerManager.saveSettings(settings);
    setStatus('Settings saved successfully');
    setTimeout(() => setStatus(null), 3000);
    setSaving(false);
  };

  const handleTestPrint = async () => {
    setTesting(true);
    setStatus(null);
    try {
      await printerManager.testPrint();
      setStatus('Test print sent');
    } catch (e: any) {
      setStatus(`Test failed: ${e.message || 'Printer not available'}`);
    } finally {
      setTesting(false);
      setTimeout(() => setStatus(null), 4000);
    }
  };

  const update = (patch: Partial<PrinterSettings>) => {
    setSettings(prev => ({ ...prev, ...patch }));
  };

  return (
    <div className="p-6 max-w-3xl space-y-6">
      {status && (
        <div className={`p-3 rounded-lg text-sm ${status.includes('failed') ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-green-50 border border-green-200 text-green-700'}`}>
          {status}
        </div>
      )}

      {/* Printer */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4 flex items-center gap-2">
          <Printer className="w-4 h-4 text-blue-600" /> Printer
        </h3>
        <div className="space-y-4">
          <div>
            <label className="label">Printer</label>
            <select
              value={settings.printerName}
              onChange={e => update({ printerName: e.target.value })}
              className="input-field cursor-pointer"
            >
              <option value="">System Default (Browser Dialog)</option>
              {printers.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
              {printers.length === 0 && <option disabled>No printers detected - will use system dialog</option>}
            </select>
            <p className="text-xs text-gray-400 mt-1">Select your 80mm thermal printer (e.g., XPrinter XP-80C, EPSON TM-T20)</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Paper Size</label>
              <div className="flex gap-3 mt-1">
                {(['80mm', '58mm'] as const).map(size => (
                  <label key={size} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="paperSize"
                      checked={settings.paperSize === size}
                      onChange={() => update({ paperSize: size })}
                      className="text-blue-600"
                    />
                    <span className="text-sm">{size} {size === '80mm' ? '(48 cols)' : '(32 cols)'}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">Content: {PAPER_PROFILES[settings.paperSize].contentWidthMm}mm • {PAPER_PROFILES[settings.paperSize].columns} cols</p>
            </div>
            <div>
              <label className="label">Print Mode</label>
              <div className="flex gap-3 mt-1">
                {(['Thermal', 'Normal'] as const).map(mode => (
                  <label key={mode} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="printMode" checked={settings.printMode === mode} onChange={() => update({ printMode: mode })} />
                    <span className="text-sm">{mode}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="label">Copies</label>
            <input type="number" min="1" max="10" value={settings.copies} onChange={e => update({ copies: Math.max(1, Math.min(10, parseInt(e.target.value) || 1)) })} className="input-field w-24" />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4 flex items-center gap-2">
          <Scissors className="w-4 h-4 text-gray-600" /> Actions
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
            <input type="checkbox" checked={settings.autoCut} onChange={e => update({ autoCut: e.target.checked })} className="rounded" />
            <div>
              <p className="text-sm font-medium">Auto Cut</p>
              <p className="text-xs text-gray-500">Cut paper after print</p>
            </div>
          </label>
          <label className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
            <input type="checkbox" checked={settings.openCashDrawer} onChange={e => update({ openCashDrawer: e.target.checked })} />
            <div>
              <p className="text-sm font-medium">Open Cash Drawer</p>
              <p className="text-xs text-gray-500">Pulse drawer after print</p>
            </div>
          </label>
        </div>
      </div>

      {/* Content */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Content</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { key: 'printLogo', label: 'Print Logo', icon: Package, desc: 'Business logo on receipt' },
            { key: 'printCustomerDetails', label: 'Print Customer Details', icon: User, desc: 'Name, phone, address' },
            { key: 'printSku', label: 'Print Item SKU', icon: Package, desc: 'SKU/code under item name' },
            { key: 'printTax', label: 'Print Tax', icon: DollarSign, desc: 'CGST/SGST/IGST/VAT' },
            { key: 'printFooter', label: 'Print Footer', icon: FileText, desc: 'Thank you, terms, website' },
          ].map(item => {
            const Icon = item.icon;
            return (
              <label key={item.key} className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                <input type="checkbox" checked={(settings as any)[item.key]} onChange={e => update({ [item.key]: e.target.checked } as any)} />
                <Icon className="w-4 h-4 text-gray-500" />
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-gray-500">{item.desc}</p>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Alignment */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4 flex items-center gap-2">
          <AlignLeft className="w-4 h-4" /> Alignment
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(['headerAlignment', 'bodyAlignment', 'footerAlignment'] as const).map(field => (
            <div key={field}>
              <label className="label capitalize">{field.replace('Alignment', '')}</label>
              <select value={(settings as any)[field]} onChange={e => update({ [field]: e.target.value } as any)} className="input-field cursor-pointer">
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Advanced */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Advanced</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Character Width (columns)</label>
            <input type="number" min="24" max="64" value={settings.columns} onChange={e => update({ columns: parseInt(e.target.value) || 48 })} className="input-field" />
            <p className="text-xs text-gray-400 mt-1">80mm=48, 58mm=32</p>
          </div>
          <div>
            <label className="label">Feed Lines After Print</label>
            <input type="number" min="0" max="10" value={settings.feedLines} onChange={e => update({ feedLines: parseInt(e.target.value) || 0 })} className="input-field" />
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={settings.autoPrint} onChange={e => update({ autoPrint: e.target.checked })} />
            <span className="text-sm">Print automatically after saving bill</span>
          </label>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={handleTestPrint} disabled={testing} className="btn-secondary flex-1 justify-center">
          <TestTube className="w-4 h-4" />
          {testing ? 'Printing...' : 'Test Print'}
        </button>
        <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 justify-center">
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
      <p className="text-xs text-gray-400 text-center">Settings persist after restarting the EXE (localStorage)</p>
    </div>
  );
}
