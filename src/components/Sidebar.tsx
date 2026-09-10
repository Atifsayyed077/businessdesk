import React from 'react';
import {
  LayoutDashboard,
  Package,
  Boxes,
  Users,
  ShoppingCart,
  FileText,
  History,
  BarChart3,
  DatabaseBackup,
  Settings,
  Store,
  LogOut,
  MessageSquare,
  CreditCard
} from 'lucide-react';
import { useApp } from '../context/AppContext';

interface SidebarProps {
  page: string;
  onNavigate: (page: string) => void;
}

const navItems = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'products', label: 'Products', icon: Package },
  { key: 'inventory', label: 'Inventory', icon: Boxes },
  { key: 'customers', label: 'Customers', icon: Users },
  { key: 'sales', label: 'New Sale', icon: ShoppingCart },
  { key: 'billing', label: 'Billing', icon: FileText },
  { key: 'bills-history', label: 'Bills History', icon: History },
  { key: 'credit', label: 'Credit', icon: CreditCard },
  { key: 'reports', label: 'Reports', icon: BarChart3 },
  { key: 'sms', label: 'SMS Center', icon: MessageSquare },
  { key: 'backup', label: 'Backup', icon: DatabaseBackup },
  { key: 'settings', label: 'Settings', icon: Settings },
];

export default function Sidebar({ page, onNavigate }: SidebarProps) {
  const { user, logout } = useApp();

  return (
    <aside className="w-56 bg-[#1e293b] flex flex-col flex-shrink-0">
      <div className="h-14 flex items-center px-4 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Store className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-white font-semibold text-sm leading-tight">BusinessDesk</h1>
            <p className="text-slate-400 text-[10px]">Inventory & Billing</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 py-3 overflow-y-auto">
        <p className="px-4 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">Menu</p>
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = page === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors duration-150 cursor-pointer border-l-2 ${
                isActive
                  ? 'bg-[#0f172a] text-white border-blue-500'
                  : 'text-slate-300 hover:bg-[#334155] hover:text-white border-transparent'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-slate-400'}`} />
              <span className="font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-slate-700/50 p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-xs">
            {user?.name?.charAt(0) || 'A'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-medium truncate">{user?.name || 'Administrator'}</p>
            <p className="text-slate-400 text-[10px] truncate">{user?.role || 'Administrator'}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-1.5 text-[11px] text-slate-400 hover:text-white hover:bg-slate-700/50 rounded py-1.5 transition-colors cursor-pointer"
        >
          <LogOut className="w-3 h-3" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
