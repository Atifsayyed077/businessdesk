import { pb } from './pocketbase';
import { getSetting } from './utils';
import type { Bill } from '../types';

export interface SmsConfig {
  url: string;
  token: string;
  template: string;
}

export async function getSmsConfig(): Promise<SmsConfig | null> {
  const [url, token, template] = await Promise.all([
    getSetting('sms_http_url'),
    getSetting('sms_http_token'),
    getSetting('sms_http_template'),
  ]);
  if (!url || !token) return null;
  return {
    url: url.trim(),
    token: token.trim(),
    template: (template || '{ "to": "{phone}", "message": "{message}" }').trim(),
  };
}

export function formatSmsMessage(bill: Bill): string {
  const storeName = 'BusinessDesk';
  // Keep message compact for SMS (160 chars per segment, but allow longer)
  return `Dear ${bill.customer_name}, Your bill ${bill.bill_number} dated ${bill.date} for ${formatCurrency(bill.total)} is pending. Please pay at earliest. - ${storeName} Ph: ${bill.customer_mobile}`;
}

function formatCurrency(amount: number): string {
  return `Rs ${Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
}

export async function sendSmsViaGateway(phone: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const config = await getSmsConfig();
  if (!config) {
    return { ok: false, error: 'SMS Gateway not configured. Set URL and Token in Settings.' };
  }

  // Normalize phone: keep last 10 digits, ensure 10 digits
  const cleanPhone = phone.replace(/\D/g, '').slice(-10);
  if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
    return { ok: false, error: `Invalid phone: ${phone}` };
  }

  // Build body from template: replace {phone} and {message}
  let bodyStr = config.template
    .replaceAll('{phone}', cleanPhone)
    .replaceAll('{message}', message.replaceAll('"', '\\"').replaceAll('\n', '\\n'));

  // Try to parse as JSON, fallback to string
  let body: any;
  try {
    body = JSON.parse(bodyStr);
  } catch {
    body = bodyStr;
  }

  // Try Electron main process first (no CORS, works for local IP like 192.0.0.4:8082)
  const electron = (window as any).electron;
  if (electron?.smsSend) {
    try {
      const result = await electron.smsSend({ url: config.url, token: config.token, phone: cleanPhone, message, template: config.template });
      if (result.ok) return { ok: true };
      return { ok: false, error: result.error || 'Electron SMS failed' };
    } catch (e: any) {
      // Fall through to proxy/direct
      console.warn('Electron SMS failed, trying proxy/direct', e);
    }
  }

  // Try PocketBase proxy (avoids CORS, works for both local IP and cloud)
  try {
    const proxyRes = await fetch(`${pb.baseUrl}/api/sms/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': pb.authStore.token ? `Bearer ${pb.authStore.token}` : '' },
      body: JSON.stringify({ phone: cleanPhone, message, bill_id: '', bill_number: '', customer_name: '' }),
    });
    const proxyData = await proxyRes.json().catch(() => ({}));
    if (proxyRes.ok && proxyData.ok) {
      return { ok: true };
    }
    if (proxyRes.status !== 404) {
      const errMsg = proxyData.error || `Proxy ${proxyRes.status}: ${proxyRes.statusText}`;
      if (!errMsg.includes('not configured') && !errMsg.includes('404')) {
        if (errMsg.includes('Gateway') || errMsg.includes('timed out') || errMsg.includes('Cannot reach')) {
          return { ok: false, error: errMsg };
        }
      }
      if (proxyRes.status !== 404) {
        return { ok: false, error: errMsg };
      }
    }
  } catch (e) {
    // Proxy not available, fall back to direct fetch
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (config.token) {
      headers['Authorization'] = config.token.startsWith('Bearer ') || config.token.startsWith('Basic ') ? config.token : `${config.token}`;
    }

    const isLocalIp = /^(http:\/\/)?(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|127\.0\.0\.1|localhost)/i.test(config.url);

    const controller = new AbortController();
    const timeoutMs = 8000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(config.url, {
        method: 'POST',
        headers,
        body: typeof body === 'string' ? body : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      const msg = fetchError?.message || '';
      const name = fetchError?.name || '';

      if (name === 'AbortError' || msg.includes('aborted')) {
        const isTarget192 = config.url.includes('192.0.0.4');
        const isTarget10 = config.url.includes('10.84.189.168');
        const isCloud = config.url.includes('traccar.org');
        return {
          ok: false,
          error: `Connection timed out to ${config.url} (8s). ` +
            (isCloud
              ? `Cloud gateway timeout — check internet and that Traccar SMS Gateway app is configured to poll ${config.url} (App → Settings → Server URL) and phone has internet.`
              : isLocalIp
                ? `Local IP requires SAME WiFi — to send WITHOUT same WiFi, switch to Cloud: https://www.traccar.org/sms/ in Settings (phone then only needs internet, not same WiFi). ` +
                  (isTarget192 ? `Your 192.0.0.4 is wrong — use http://10.84.189.168:8082 for local OR https://www.traccar.org/sms/ for remote. ` : '') +
                  (isTarget10 ? `For remote, change to https://www.traccar.org/sms/ — local 10.84.x.x only works when PC+phone on same 10.84 WiFi. ` : '') +
                  `Proxy also failed — ensure PocketBase hook is loaded (restart pocketbase) or use Cloud.`
                : `Check URL, internet, and gateway.`),
        };
      }

      if (msg.includes('Failed to fetch') || msg.includes('ERR_CONNECTION') || msg.includes('NetworkError')) {
        const isTarget192 = config.url.includes('192.0.0.4');
        const isCloud = config.url.includes('traccar.org');
        return {
          ok: false,
          error:
            `Cannot reach gateway at ${config.url} (browser CORS blocked). ` +
            (isCloud
              ? `Cloud also blocked by CORS — this should work via proxy, but proxy not available. Restart PocketBase to load sms hook, or try local IP with same WiFi.`
              : isLocalIp
                ? `Browser blocked local IP (CORS). ` +
                  (isTarget192 ? `192.0.0.4 is wrong — for local use http://10.84.189.168:8082, for REMOTE use https://www.traccar.org/sms/. ` : '') +
                  `Fix: Use PocketBase proxy (restart pocketbase) OR ensure PC+phone same 10.84.x.x and gateway allows CORS. ` +
                  `For WITHOUT same WiFi, use https://www.traccar.org/sms/`
                : `Network error: ${msg}. Check URL.`),
        };
      }

      return { ok: false, error: `Network error: ${msg || 'Failed to fetch gateway'}` };
    }
    clearTimeout(timeoutId);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `Gateway ${res.status}: ${text.slice(0, 300) || res.statusText}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message || 'Network error' };
  }
}

export async function sendBillSms(bill: Bill, customMessage?: string): Promise<{ ok: boolean; error?: string }> {
  const message = customMessage || formatSmsMessage(bill);
  const result = await sendSmsViaGateway(bill.customer_mobile, message);
  
  // Log to sms_logs collection if exists, else to localStorage
  try {
    if (pb.authStore.isValid) {
      await pb.collection('sms_logs').create({
        bill_id: bill.id,
        bill_number: bill.bill_number,
        customer_name: bill.customer_name,
        phone: bill.customer_mobile,
        message,
        status: result.ok ? 'sent' : 'failed',
        error: result.error || '',
        sent_at: new Date().toISOString(),
      }).catch(() => {});
    }
  } catch {}

  // Also track in localStorage for 48h deduplication
  try {
    const key = `sms_sent_${bill.id}`;
    if (result.ok) {
      localStorage.setItem(key, JSON.stringify({ at: Date.now(), bill_number: bill.bill_number }));
    }
  } catch {}

  return result;
}

export async function bulkSendPendingBills(bills: Bill[], onProgress?: (sent: number, total: number, bill: Bill, result: any) => void): Promise<{ sent: number; failed: number; results: any[] }> {
  const pending = bills.filter(b => b.payment_status === 'Pending');
  let sent = 0;
  let failed = 0;
  const results: any[] = [];

  for (let i = 0; i < pending.length; i++) {
    const bill = pending[i];
    // Small delay to avoid flooding gateway
    if (i > 0) await new Promise(r => setTimeout(r, 600));
    
    const result = await sendBillSms(bill);
    if (result.ok) sent++;
    else failed++;
    results.push({ bill, result });
    onProgress?.(sent + failed, pending.length, bill, result);
  }

  return { sent, failed, results };
}

export function isBillOverdue48h(bill: Bill): boolean {
  try {
    const created = bill.created_at || bill.date;
    if (!created) return false;
    let d: Date;
    if (created.includes(' ') && created.includes('Z')) {
      d = new Date(created.replace(' ', 'T'));
    } else {
      d = new Date(created);
      // If only date string YYYY-MM-DD, treat as start of day IST
      if (/^\d{4}-\d{2}-\d{2}$/.test(created)) {
        d = new Date(created + 'T00:00:00+05:30');
      }
    }
    if (isNaN(d.getTime())) return false;
    const diffHours = (Date.now() - d.getTime()) / (1000 * 60 * 60);
    return diffHours >= 48 && bill.payment_status === 'Pending';
  } catch {
    return false;
  }
}

export function hasSmsBeenSentRecently(billId: string, hours: number = 48): boolean {
  try {
    const raw = localStorage.getItem(`sms_sent_${billId}`);
    if (!raw) return false;
    const { at } = JSON.parse(raw);
    const diffHours = (Date.now() - at) / (1000 * 60 * 60);
    return diffHours < hours;
  } catch {
    return false;
  }
}

export async function getOverdueBillsForAutoSms(bills: Bill[]): Promise<Bill[]> {
  return bills.filter(b => isBillOverdue48h(b) && !hasSmsBeenSentRecently(b.id, 48));
}

export async function testGatewayConnection(): Promise<{ ok: boolean; message: string }> {
  const config = await getSmsConfig();
  if (!config) {
    return { ok: false, message: 'Gateway not configured. Set URL and Token in Settings → Traccar SMS Gateway.' };
  }

  // Try Electron main process first (no CORS)
  const electron = (window as any).electron;
  if (electron?.smsTest) {
    try {
      const result = await electron.smsTest({ url: config.url, token: config.token, template: config.template });
      if (result.ok) return { ok: true, message: result.message || `Gateway reachable at ${config.url} (via Electron)` };
      return { ok: false, message: result.error || result.message || `Electron test failed for ${config.url}` };
    } catch (e: any) {
      console.warn('Electron test failed, trying direct', e);
    }
  }

  // Actually try the connection for the configured URL (no early return, real fetch below)

  const isLocal = /^(http:\/\/)?(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|127\.0\.0\.1)/i.test(config.url);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    // Try a simple POST with test payload to see if gateway is reachable
    // We send a minimal test - gateway will likely return 400 for invalid phone, but that means it's reachable
    const testBody = config.template
      .replaceAll('{phone}', '9999999999')
      .replaceAll('{message}', 'test');

    let body: any;
    try {
      body = JSON.parse(testBody);
    } catch {
      body = testBody;
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.token) {
      headers['Authorization'] = config.token;
    }

    const res = await fetch(config.url, {
      method: 'POST',
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    // Even 400 means gateway is reachable (it processed the request)
    if (res.status === 400 || res.status === 200 || res.status === 202) {
      return { ok: true, message: `Gateway reachable at ${config.url} (responded ${res.status}). Ready to send SMS.` };
    }

    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: `Gateway reached but authorization failed (HTTP ${res.status}). Check Token in Settings.` };
    }

    const text = await res.text().catch(() => '');
    return { ok: false, message: `Gateway responded ${res.status}: ${text.slice(0, 150) || res.statusText}` };
  } catch (e: any) {
    const msg = e?.message || '';
    const name = e?.name || '';

    if (name === 'AbortError' || msg.includes('aborted')) {
      return {
        ok: false,
        message: `Connection timed out to ${config.url} (5s). ` +
          (isLocal
            ? `Local gateway requires same WiFi, app open, correct IP. Check phone's WiFi IP in Gateway Configuration.`
            : `Check URL and that gateway is running.`),
      };
    }

    if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      return {
        ok: false,
        message: `Cannot reach ${config.url} (Failed to fetch). ` +
          (isLocal
            ? `Browser blocked local IP due to CORS/network isolation. ` +
              `Fix: Use Traccar Server URL as proxy OR ensure phone/PC same WiFi and test http://${config.url.replace(/^https?:\/\//, '').split('/')[0]} in browser. ` +
              `For cloud, use https://www.traccar.org/sms/`
            : `Check URL, CORS, and gateway status.`),
      };
    }

    return { ok: false, message: `Test failed: ${msg || 'Unknown error'}` };
  }
}

export async function testAllGateways(): Promise<Array<{ url: string; label: string; ok: boolean; message: string }>> {
  const config = await getSmsConfig();
  const currentUrl = config?.url || '';
  const currentToken = config?.token || '';
  
  const gateways = [
    { url: currentUrl, label: `Current (${currentUrl || 'not set'})`, token: currentToken },
    { url: 'http://10.84.189.168:8082', label: 'Local 10.84.189.168:8082', token: currentToken },
    { url: 'http://192.0.0.4:8082', label: 'Local 192.0.0.4:8082', token: currentToken },
    { url: 'https://www.traccar.org/sms/', label: 'Cloud https://www.traccar.org/sms/', token: currentToken },
  ].filter((g, idx, arr) => idx === 0 || g.url !== currentUrl); // avoid duplicate current

  const results: Array<{ url: string; label: string; ok: boolean; message: string }> = [];

  for (const gw of gateways) {
    if (!gw.url) continue;
    // Temporarily override config for test
    const originalUrl = currentUrl;
    // We will test each gateway by directly fetching it, not via getSmsConfig
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const testBody = (config?.template || '{ "to": "{phone}", "message": "{message}" }')
        .replaceAll('{phone}', '9999999999')
        .replaceAll('{message}', 'test');
      let body: any;
      try { body = JSON.parse(testBody); } catch { body = testBody; }
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (gw.token) headers['Authorization'] = gw.token;
      
      const res = await fetch(gw.url, {
        method: 'POST',
        headers,
        body: typeof body === 'string' ? body : JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.status === 400 || res.status === 200 || res.status === 202) {
        results.push({ url: gw.url, label: gw.label, ok: true, message: `Reachable (HTTP ${res.status})` });
      } else if (res.status === 401 || res.status === 403) {
        results.push({ url: gw.url, label: gw.label, ok: false, message: `Auth failed (HTTP ${res.status}) — check Token` });
      } else {
        const text = await res.text().catch(() => '');
        results.push({ url: gw.url, label: gw.label, ok: false, message: `HTTP ${res.status}: ${text.slice(0,100) || res.statusText}` });
      }
    } catch (e: any) {
      const msg = e?.message || '';
      const name = e?.name || '';
      if (name === 'AbortError' || msg.includes('aborted')) {
        results.push({ url: gw.url, label: gw.label, ok: false, message: `Timeout (5s) — not reachable` });
      } else if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        results.push({ url: gw.url, label: gw.label, ok: false, message: `Cannot reach (CORS/network) — Failed to fetch` });
      } else {
        results.push({ url: gw.url, label: gw.label, ok: false, message: `Error: ${msg.slice(0,100) || 'Unknown'}` });
      }
    }
    // Small delay between tests
    await new Promise(r => setTimeout(r, 300));
  }

  return results;
}
