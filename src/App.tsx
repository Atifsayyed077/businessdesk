import React, { useState, useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { getBills } from './lib/utils';
import { getOverdueBillsForAutoSms, bulkSendPendingBills } from './lib/sms';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Customers from './pages/Customers';
import Sales from './pages/Sales';
import Billing from './pages/Billing';
import BillsHistory from './pages/BillsHistory';
import Reports from './pages/Reports';
import Backup from './pages/Backup';
import Settings from './pages/Settings';
import SmsPanel from './pages/SmsPanel';
import Credit from './pages/Credit';

type Page = 'dashboard' | 'products' | 'inventory' | 'customers' | 'sales' | 'billing' | 'bills-history' | 'credit' | 'reports' | 'sms' | 'backup' | 'settings';

function MainLayout() {
  const { isInitialized, isAuthenticated, pbConnected } = useApp();
  const [page, setPage] = useState<Page>('dashboard');

  const navigate = (p: string) => {
    const valid: Page[] = ['dashboard','products','inventory','customers','sales','billing','bills-history','credit','reports','sms','backup','settings'];
    if (valid.includes(p as Page)) setPage(p as Page);
  };

  // Auto 48h SMS for pending bills (every 30 min)
  useEffect(() => {
    if (!isAuthenticated) return;
    if (localStorage.getItem('sms_auto_48h') === 'false') return;

    let cancelled = false;
    const checkAndSend = async () => {
      try {
        const bills = await getBills();
        if (cancelled) return;
        const overdue = await getOverdueBillsForAutoSms(bills);
        if (overdue.length > 0 && !cancelled) {
          console.log(`[SMS Auto] Found ${overdue.length} overdue bills (>48h), sending...`);
          await bulkSendPendingBills(overdue);
          console.log(`[SMS Auto] Done`);
        }
      } catch (e) {
        console.warn('[SMS Auto] check failed', e);
      }
    };

    // Run after 1 min, then every 30 min
    const timeout = setTimeout(checkAndSend, 60 * 1000);
    const interval = setInterval(checkAndSend, 30 * 60 * 1000);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [isAuthenticated]);

  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-3 text-gray-600 text-sm">Connecting to PocketBase...</p>
          {!pbConnected && <p className="mt-2 text-xs text-amber-600">PocketBase not reachable at http://127.0.0.1:8090 — is it running?</p>}
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  const pageTitles: Record<Page, string> = {
    dashboard: 'Dashboard',
    products: 'Products',
    inventory: 'Inventory',
    customers: 'Customers',
    sales: 'New Sale',
    billing: 'Billing',
    'bills-history': 'Bills History',
    credit: 'Credit',
    reports: 'Reports',
    sms: 'SMS Center',
    backup: 'Backup & Restore',
    settings: 'Settings'
  };

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <Dashboard onNavigate={navigate} />;
      case 'products': return <Products />;
      case 'inventory': return <Products inventoryMode={true} />;
      case 'customers': return <Customers />;
      case 'sales': return <Sales />;
      case 'billing': return <Billing />;
      case 'bills-history': return <BillsHistory />;
      case 'reports': return <Reports />;
      case 'credit': return <Credit />;
      case 'sms': return <SmsPanel />;
      case 'backup': return <Backup />;
      case 'settings': return <Settings />;
      default: return <Dashboard onNavigate={navigate} />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar page={page} onNavigate={navigate} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title={pageTitles[page]} />
        <main className="flex-1 overflow-y-auto">
          {!pbConnected && (
            <div className="mx-6 mt-4 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-2">
              PocketBase offline — data may not load. Check that pocketbase.exe is running at http://127.0.0.1:8090
            </div>
          )}
          {renderPage()}
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
}

export default App;
