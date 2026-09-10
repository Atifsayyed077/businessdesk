import React, { useEffect, useState } from 'react';
import { Send, Clock, CheckCircle, AlertTriangle, RefreshCw, MessageSquare, Users, Zap, Wifi, Settings as SettingsIcon } from 'lucide-react';
import { getBills, formatCurrency, formatDisplayDate } from '../lib/utils';
import { bulkSendPendingBills, getOverdueBillsForAutoSms, isBillOverdue48h, sendBillSms, getSmsConfig, testGatewayConnection, testAllGateways } from '../lib/sms';
import type { Bill } from '../types';

export default function SmsPanel() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ sent: number; total: number; log: string[] }>({ sent: 0, total: 0, log: [] });
  const [autoEnabled, setAutoEnabled] = useState(localStorage.getItem('sms_auto_48h') !== 'false');
  const [configOk, setConfigOk] = useState<boolean | null>(null);
  const [gatewayUrl, setGatewayUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testingAll, setTestingAll] = useState(false);
  const [allTestResults, setAllTestResults] = useState<Array<{ url: string; label: string; ok: boolean; message: string }> | null>(null);

  const load = async () => {
    setLoading(true);
    const [allBills, cfg] = await Promise.all([getBills(), getSmsConfig()]);
    setBills(allBills);
    setConfigOk(!!cfg);
    if (cfg) setGatewayUrl(cfg.url);
    setLoading(false);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await testGatewayConnection();
    setTestResult(result);
    setTesting(false);
  };

  const handleTestAll = async () => {
    setTestingAll(true);
    setAllTestResults(null);
    const results = await testAllGateways();
    setAllTestResults(results);
    setTestingAll(false);
  };

  useEffect(() => { load(); }, []);

  const pendingBills = bills.filter(b => b.payment_status === 'Pending');
  const overdueBills = bills.filter(b => isBillOverdue48h(b));

  const handleBulkSend = async (targetBills: Bill[], label: string) => {
    if (targetBills.length === 0) {
      alert(`No ${label} bills to send`);
      return;
    }
    if (!confirm(`Send SMS to ${targetBills.length} ${label} bill(s)?\n\nThis will use your Traccar SMS Gateway.`)) return;

    const cfg = await getSmsConfig();
    if (!cfg) {
      alert('SMS Gateway not configured. Go to Settings → Traccar SMS Gateway and set URL and Token.');
      return;
    }

    setSending(true);
    setProgress({ sent: 0, total: targetBills.length, log: [`Starting bulk send for ${targetBills.length} bills...`] });

    const result = await bulkSendPendingBills(targetBills, (sent, total, bill, res) => {
      setProgress(prev => ({
        sent,
        total,
        log: [...prev.log, `${res.ok ? '✓' : '✗'} ${bill.bill_number} → ${bill.customer_name} (${bill.customer_mobile}): ${res.ok ? 'sent' : res.error}`].slice(-50)
      }));
    });

    setProgress(prev => ({
      ...prev,
      log: [...prev.log, `--- Done: ${result.sent} sent, ${result.failed} failed ---`]
    }));
    setSending(false);
    if (result.failed === 0) {
      alert(`All ${result.sent} messages sent successfully!`);
    } else {
      alert(`Sent: ${result.sent}, Failed: ${result.failed}. Check log.`);
    }
    load();
  };

  const handleAutoToggle = (enabled: boolean) => {
    setAutoEnabled(enabled);
    localStorage.setItem('sms_auto_48h', String(enabled));
  };

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading bills...</div>;

  return (
    <div className="p-6 space-y-6">
      {/* Config status */}
      {configOk === false && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">SMS Gateway not configured</p>
            <p className="text-xs text-amber-700 mt-1">Go to Settings → Traccar SMS Gateway to set your Gateway URL/IP and Token. Without this, SMS cannot be sent.</p>
          </div>
        </div>
      )}
      {configOk === true && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <div className="flex items-center gap-2 text-sm text-green-700">
            <CheckCircle className="w-4 h-4" /> SMS Gateway configured
          </div>
          <p className="text-xs text-green-600 mt-1 font-mono break-all">URL: {gatewayUrl}</p>
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleTestConnection}
              disabled={testing || testingAll}
              className="btn-secondary text-xs py-1"
            >
              <Wifi className="w-3 h-3" />
              {testing ? 'Testing...' : 'Test Current'}
            </button>
            <button
              onClick={handleTestAll}
              disabled={testing || testingAll}
              className="btn-secondary text-xs py-1 border-blue-200 text-blue-700 hover:bg-blue-50"
            >
              <Wifi className="w-3 h-3" />
              {testingAll ? 'Testing All...' : 'Test All Gateways'}
            </button>
          </div>
          {testResult && (
            <div className={`mt-2 p-2 rounded text-xs ${testResult.ok ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              <p className="font-medium">Current: {testResult.ok ? `✓ ${testResult.message}` : `✗ ${testResult.message}`}</p>
              {!testResult.ok && testResult.message.includes('192.0.0.4') && (
                <div className="mt-1 text-xs">
                  <p>Fix: Check HTTP API URL in Gateway app (should be 192.168.x.x, not 192.0.0.4)</p>
                </div>
              )}
            </div>
          )}
          {allTestResults && (
            <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-2 py-1.5 text-xs font-medium text-gray-700">All Gateways — Real Connection Test</div>
              <div className="divide-y divide-gray-100">
                {allTestResults.map((r, i) => (
                  <div key={i} className={`px-2 py-2 flex items-start gap-2 text-xs ${r.ok ? 'bg-green-50' : 'bg-red-50'}`}>
                    <span className={r.ok ? 'text-green-600' : 'text-red-600'}>{r.ok ? '✓' : '✗'}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium truncate ${r.ok ? 'text-green-800' : 'text-red-800'}`}>{r.label}</p>
                      <p className="text-gray-600 break-words font-mono text-[11px]">{r.url}</p>
                      <p className={r.ok ? 'text-green-700' : 'text-red-700'}>{r.message}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="px-2 py-1.5 text-[11px] text-gray-500 bg-gray-50">Tried actual POST to each URL (5s timeout) — ✓ = reachable, ✗ = failed. Use the one with ✓.</p>
            </div>
          )}
        </div>
      )}
      {configOk === true && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
          <SettingsIcon className="w-4 h-4 text-blue-600 mt-0.5" />
          <div className="text-xs text-blue-700">
            <p className="font-medium">Gateway: {gatewayUrl}</p>
            <p className="mt-1">If using local IP (192.168.x.x), phone and PC must be on same WiFi and app must be open. For cloud, use <code className="bg-white px-1 rounded">https://www.traccar.org/sms/</code></p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs uppercase tracking-wide">
            <MessageSquare className="w-4 h-4" /> Pending (Unpaid)
          </div>
          <p className="text-2xl font-bold text-amber-600 mt-1">{pendingBills.length}</p>
          <p className="text-xs text-gray-400 mt-1">Bills awaiting payment</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs uppercase tracking-wide">
            <Clock className="w-4 h-4" /> Overdue &gt; 48h
          </div>
          <p className="text-2xl font-bold text-red-600 mt-1">{overdueBills.length}</p>
          <p className="text-xs text-gray-400 mt-1">Auto-send pending</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs uppercase tracking-wide">
            <Users className="w-4 h-4" /> Total Bills
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-1">{bills.length}</p>
          <p className="text-xs text-gray-400 mt-1">{formatCurrency(bills.reduce((s,b)=>s+b.total,0))} total</p>
        </div>
      </div>

      {/* Bulk actions */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2">
          <Send className="w-4 h-4 text-blue-600" /> Bulk SMS Sending
        </h3>
        <p className="text-sm text-gray-500 mt-1">Send payment reminders via your Android Traccar SMS Gateway</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div className="border border-amber-200 bg-amber-50 rounded-lg p-4">
            <h4 className="font-medium text-amber-800">All Unpaid (Pending)</h4>
            <p className="text-xs text-amber-700 mt-1">{pendingBills.length} bills will receive SMS</p>
            <button
              onClick={() => handleBulkSend(pendingBills, 'Pending')}
              disabled={sending || pendingBills.length === 0}
              className="btn-primary mt-3 w-full justify-center disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              {sending ? `Sending ${progress.sent}/${progress.total}...` : `Send to All Pending (${pendingBills.length})`}
            </button>
          </div>

          <div className="border border-red-200 bg-red-50 rounded-lg p-4">
            <h4 className="font-medium text-red-800">Overdue &gt; 48 Hours</h4>
            <p className="text-xs text-red-700 mt-1">{overdueBills.length} bills overdue for auto-send</p>
            <button
              onClick={() => handleBulkSend(overdueBills, 'Overdue 48h')}
              disabled={sending || overdueBills.length === 0}
              className="btn-danger mt-3 w-full justify-center disabled:opacity-50"
            >
              <Clock className="w-4 h-4" />
              {sending ? `Sending ${progress.sent}/${progress.total}...` : `Send Overdue Only (${overdueBills.length})`}
            </button>
          </div>
        </div>

        {/* Auto 48h toggle */}
        <div className="mt-6 border border-gray-200 rounded-lg p-4 bg-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
              <Zap className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800">Auto-send after 48 hours</p>
              <p className="text-xs text-gray-500">Pending bills older than 48h are sent automatically every 30 min</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" checked={autoEnabled} onChange={e => handleAutoToggle(e.target.checked)} className="sr-only peer" />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>
      </div>

      {/* Progress log */}
      {(sending || progress.log.length > 0) && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-700">Send Log</h4>
            <button onClick={() => setProgress({ sent: 0, total: 0, log: [] })} className="text-xs text-gray-500 hover:text-gray-700">Clear</button>
          </div>
          {sending && (
            <div className="w-full bg-gray-100 rounded-full h-2 mb-3">
              <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${progress.total ? (progress.sent/progress.total)*100 : 0}%` }} />
            </div>
          )}
          <div className="bg-gray-900 text-green-400 rounded-lg p-3 font-mono text-xs max-h-64 overflow-y-auto space-y-1">
            {progress.log.length === 0 ? <p className="text-gray-500">No activity yet</p> : progress.log.map((line, i) => (
              <div key={i} className={line.startsWith('✗') ? 'text-red-400' : line.startsWith('---') ? 'text-amber-400' : ''}>{line}</div>
            ))}
          </div>
        </div>
      )}

      {/* Pending bills table */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Pending Bills</h3>
          <button onClick={load} className="btn-secondary text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="table-header px-4 py-2.5">Bill No.</th>
                <th className="table-header px-4 py-2.5">Customer</th>
                <th className="table-header px-4 py-2.5">Mobile</th>
                <th className="table-header px-4 py-2.5">Date</th>
                <th className="table-header px-4 py-2.5 text-right">Total</th>
                <th className="table-header px-4 py-2.5">Age</th>
                <th className="table-header px-4 py-2.5">Action</th>
              </tr>
            </thead>
            <tbody>
              {pendingBills.map(bill => {
                const overdue = isBillOverdue48h(bill);
                const hours = bill.created_at ? Math.floor((Date.now() - new Date(bill.created_at.replace(' ','T')).getTime())/3600000) : 0;
                return (
                  <tr key={bill.id} className="border-t border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-sm font-medium text-blue-600">{bill.bill_number}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-800">{bill.customer_name}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-600">{bill.customer_mobile}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-500">{formatDisplayDate(bill.date)}</td>
                    <td className="px-4 py-2.5 text-sm font-medium text-right">{formatCurrency(bill.total)}</td>
                    <td className="px-4 py-2.5 text-xs">
                      {overdue ? <span className="badge-low">{hours}h overdue</span> : <span className="text-gray-500">{hours}h</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={async () => {
                          if (!confirm(`Send SMS to ${bill.customer_name} (${bill.customer_mobile}) for ${bill.bill_number}?`)) return;
                          const res = await sendBillSms(bill);
                          alert(res.ok ? `SMS sent to ${bill.customer_mobile}` : `Failed: ${res.error}`);
                        }}
                        className="btn-secondary text-xs py-1"
                      >
                        <Send className="w-3 h-3" /> SMS
                      </button>
                    </td>
                  </tr>
                );
              })}
              {pendingBills.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">No pending bills</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
