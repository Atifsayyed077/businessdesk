import React, { useState, useEffect } from 'react';
import {
  Save,
  Lock,
  Check,
  Smartphone,
  Server,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  Info
} from 'lucide-react';
import { getSetting, setSetting } from '../lib/utils';
import { pb } from '../lib/pocketbase';
import { useApp } from '../context/AppContext';

export default function Settings() {
  const { user } = useApp();

  const [storeName, setStoreName] = useState('BusinessDesk');
  const [storeAddress, setStoreAddress] = useState('');
  const [storePhone, setStorePhone] = useState('');
  const [storeEmail, setStoreEmail] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Traccar SMS Gateway
  const [smsUrl, setSmsUrl] = useState('https://www.traccar.org/sms/');
  const [smsToken, setSmsToken] = useState('');
  const [smsTemplate, setSmsTemplate] = useState('{ "to": "{phone}", "message": "{message}" }');
  const [showToken, setShowToken] = useState(false);
  const [smsSaved, setSmsSaved] = useState(false);

  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [name, address, phone, email, url, token, template] = await Promise.all([
        getSetting('store_name'),
        getSetting('store_address'),
        getSetting('store_phone'),
        getSetting('store_email'),
        getSetting('sms_http_url'),
        getSetting('sms_http_token'),
        getSetting('sms_http_template'),
      ]);
      if (name) setStoreName(name);
      if (address) setStoreAddress(address);
      if (phone) setStorePhone(phone);
      if (email) setStoreEmail(email);
      if (url) setSmsUrl(url);
      if (token) setSmsToken(token);
      if (template) setSmsTemplate(template);
      setLoading(false);
    }
    load();
  }, []);

  const saveSettings = async () => {
    try {
      await Promise.all([
        setSetting('store_name', storeName),
        setSetting('store_address', storeAddress),
        setSetting('store_phone', storePhone),
        setSetting('store_email', storeEmail),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      alert(e.message || 'Failed to save settings');
    }
  };

  const saveSmsSettings = async () => {
    if (!smsUrl.trim()) {
      alert('SMS Gateway URL/IP is required');
      return;
    }
    if (!smsToken.trim()) {
      alert('Authorization Token is required');
      return;
    }
    try {
      await Promise.all([
        setSetting('sms_http_url', smsUrl.trim()),
        setSetting('sms_http_token', smsToken.trim()),
        setSetting('sms_http_template', smsTemplate.trim()),
      ]);
      setSmsSaved(true);
      setTimeout(() => setSmsSaved(false), 2000);
    } catch (e: any) {
      alert(e.message || 'Failed to save SMS settings');
    }
  };

  const copyTraccarConfig = () => {
    const config = `<entry key='notificator.types'>web,mail,sms</entry>
<entry key='sms.http.url'>${smsUrl}</entry>
<entry key='sms.http.authorization'>${smsToken}</entry>
<entry key='sms.http.template'>
  ${smsTemplate}
</entry>`;
    navigator.clipboard.writeText(config);
    alert('Traccar config copied to clipboard!');
  };

  const changePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      alert('New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      alert('Passwords do not match');
      return;
    }

    try {
      await pb.collection('users').update(user!.id, {
        oldPassword: currentPassword,
        password: newPassword,
        passwordConfirm: confirmPassword,
      });
      alert('Password changed successfully. Please login again.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e: any) {
      const msg = e?.data?.data?.oldPassword?.message || e?.message || 'Failed to change password';
      alert(msg);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Loading settings...</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      {saved && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">
          <Check className="w-4 h-4" />
          Settings saved successfully
        </div>
      )}

      {/* Store Information */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Store / Business Information</h3>
        <p className="text-xs text-gray-500 mb-4">This information appears on invoices and reports</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Business Name</label>
            <input
              type="text"
              value={storeName}
              onChange={e => setStoreName(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="label">Phone</label>
            <input
              type="text"
              value={storePhone}
              onChange={e => setStorePhone(e.target.value)}
              className="input-field"
              placeholder="Business phone number"
            />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              value={storeEmail}
              onChange={e => setStoreEmail(e.target.value)}
              className="input-field"
              placeholder="Business email"
            />
          </div>
          <div>
            <label className="label">Address</label>
            <textarea
              value={storeAddress}
              onChange={e => setStoreAddress(e.target.value)}
              className="input-field resize-none h-16"
              placeholder="Business address"
            />
          </div>
        </div>

        <div className="flex justify-end mt-4">
          <button onClick={saveSettings} className="btn-primary">
            <Save className="w-4 h-4" />
            Save Settings
          </button>
        </div>
      </div>

      {/* Traccar SMS Gateway */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center">
            <Smartphone className="w-4 h-4 text-green-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Traccar SMS Gateway</h3>
            <p className="text-xs text-gray-500">Configure Android SMS Gateway for Traccar notifications</p>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
          <p className="text-xs font-medium text-blue-800 flex items-center gap-1">
            <Info className="w-3 h-3" /> How to get Token & URL
          </p>
          <ol className="text-xs text-blue-700 mt-1.5 space-y-1 list-decimal list-inside">
            <li>Install <b>Traccar SMS Gateway</b> from Google Play Store on an Android device with active SIM</li>
            <li>Open app → <b>Settings</b> → <b>Gateway Configuration</b></li>
            <li>Note your <b>Token</b> and <b>HTTP API URL / Endpoint</b> shown on screen</li>
            <li>Paste them below and save</li>
          </ol>
          <a href="https://play.google.com/store/apps/details?id=org.traccar.gateway" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-2">
            <ExternalLink className="w-3 h-3" /> Open Play Store
          </a>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label flex items-center gap-1">
              <Server className="w-3 h-3 text-gray-500" /> SMS HTTP URL / IP *
            </label>
            <input
              type="text"
              value={smsUrl}
              onChange={e => setSmsUrl(e.target.value)}
              className="input-field font-mono text-sm"
              placeholder="https://www.traccar.org/sms/  or  http://192.168.1.50:8080"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="text-xs text-gray-400">Quick select:</span>
              <button type="button" onClick={() => { setSmsUrl('https://www.traccar.org/sms/'); setSmsToken('dQu_b2bOT72goD2k3WD8Cn:APA91bGF3wxsCqN0qxJSm25XJhR-Dq4ojpCk8iiol5g9uAcgsYIJWCVk0bowt1smFNI7ED9HSgh8Tf2GcBc9xLgdhT1s3hblcLG5dA-w6hmoXEL-y1gguaCY'); }} className={`text-xs px-2 py-1 rounded border ${smsUrl === 'https://www.traccar.org/sms/' ? 'bg-blue-100 border-blue-300 text-blue-700 font-bold' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'} cursor-pointer`}>☁️ Cloud (works anywhere)</button>
              <button type="button" onClick={() => { setSmsUrl('http://192.0.0.4:8082'); setSmsToken('adff0dde-0d9a-4d1c-90d9-8bc8716acdbb'); }} className={`text-xs px-2 py-1 rounded border ${smsUrl === 'http://192.0.0.4:8082' ? 'bg-green-100 border-green-300 text-green-700 font-bold' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'} cursor-pointer`}>192.0.0.4:8082 (from screenshot) ✓</button>
              <button type="button" onClick={() => setSmsUrl('http://10.84.189.168:8082')} className={`text-xs px-2 py-1 rounded border ${smsUrl === 'http://10.84.189.168:8082' ? 'bg-amber-100 border-amber-300 text-amber-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'} cursor-pointer`}>10.84.189.168</button>
            </div>
            <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs">
              <p className="font-medium text-blue-800">Want to send WITHOUT same WiFi? Use Cloud:</p>
              <p className="text-blue-700 mt-1">Select <b>Cloud</b> above (https://www.traccar.org/sms/) → Save → In Traccar Gateway app, set <b>Server URL</b> to <code className="bg-white px-1 rounded">https://www.traccar.org/sms/</code> (not local IP). Phone then only needs internet, not same WiFi.</p>
              <p className="text-blue-600 mt-1">Local IPs (10.84.x.x / 192.168.x.x) only work when phone & PC are on SAME WiFi.</p>
            </div>
            {smsUrl.includes('https://www.traccar.org/sms') && (
              <div className="mt-2 bg-blue-50 border border-blue-200 rounded p-2 text-xs text-blue-700">
                ✓ Cloud mode — works anywhere (no same WiFi needed). Ensure Gateway app → Server URL is https://www.traccar.org/sms/ and token matches.
              </div>
            )}
            {smsUrl.includes('192.0.0.4') && (
              <div className="mt-2 bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700">
                ⚠️ 192.0.0.4 timeout — switch to <b>Cloud</b> for remote or <b>10.84.189.168:8082</b> for local same-WiFi.
              </div>
            )}
            {smsUrl.includes('10.84.189.168') && (
              <div className="mt-2 bg-amber-50 border-amber-200 rounded p-2 text-xs text-amber-700">
                ℹ️ Local mode — requires phone & PC on same 10.84.x.x WiFi. For remote (different WiFi/mobile data), switch to <b>Cloud</b> above.
              </div>
            )}
          </div>

          <div>
            <label className="label">Authorization Token *</label>
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={smsToken}
                onChange={e => setSmsToken(e.target.value)}
                className="input-field font-mono text-sm pr-10"
                placeholder="YOUR_APP_TOKEN from Gateway Configuration"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">Replace <code className="bg-gray-100 px-1 rounded">YOUR_APP_TOKEN</code> with token from mobile app</p>
          </div>

          <div>
            <label className="label">HTTP Template (JSON)</label>
            <textarea
              value={smsTemplate}
              onChange={e => setSmsTemplate(e.target.value)}
              className="input-field font-mono text-xs h-20"
              placeholder='{ "to": "{phone}", "message": "{message}" }'
            />
            <p className="text-xs text-gray-400 mt-1">Default: <code className="bg-gray-100 px-1 rounded">{`{ "to": "{phone}", "message": "{message}" }`}</code></p>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4">
          <button onClick={copyTraccarConfig} className="btn-secondary text-xs">
            <Copy className="w-3.5 h-3.5" />
            Copy traccar.xml
          </button>
          <div className="flex items-center gap-2">
            {smsSaved && <span className="text-xs text-green-600 flex items-center gap-1"><Check className="w-3 h-3" /> Saved</span>}
            <button onClick={saveSmsSettings} className="btn-primary">
              <Save className="w-4 h-4" />
              Save SMS Config
            </button>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-4">
          <p className="text-xs font-medium text-amber-800">Traccar Server — traccar.xml</p>
          <p className="text-xs text-amber-700 mt-1">Add these entries and restart Traccar:</p>
          <pre className="text-xs bg-white border border-amber-200 rounded p-2 mt-2 overflow-x-auto font-mono text-gray-700">
{`<entry key='notificator.types'>web,mail,sms</entry>
<entry key='sms.http.url'>${smsUrl || 'https://www.traccar.org/sms/'}</entry>
<entry key='sms.http.authorization'>${smsToken || 'YOUR_APP_TOKEN'}</entry>
<entry key='sms.http.template'>
  ${smsTemplate}
</entry>`}
          </pre>
          <p className="text-xs text-amber-600 mt-2">After saving, restart your Traccar server service to apply changes.</p>
        </div>
      </div>

      {/* Change Password */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Change Password</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="label">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="label">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="label">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="input-field"
            />
          </div>
        </div>

        <div className="flex justify-end mt-4">
          <button onClick={changePassword} className="btn-secondary">
            <Lock className="w-4 h-4" />
            Update Password
          </button>
        </div>
      </div>

      {/* System Info */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">System Information</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-gray-50 rounded p-3">
            <p className="text-gray-500 text-xs">Application</p>
            <p className="font-medium text-gray-800">BusinessDesk v1.0</p>
          </div>
          <div className="bg-gray-50 rounded p-3">
            <p className="text-gray-500 text-xs">Storage</p>
            <p className="font-medium text-gray-800">PocketBase</p>
          </div>
          <div className="bg-gray-50 rounded p-3">
            <p className="text-gray-500 text-xs">Currency</p>
            <p className="font-medium text-gray-800">Indian Rupee (INR)</p>
          </div>
          <div className="bg-gray-50 rounded p-3">
            <p className="text-gray-500 text-xs">Logged in as</p>
            <p className="font-medium text-gray-800">{user?.email}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
