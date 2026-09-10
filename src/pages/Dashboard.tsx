import React, { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { getBills, getDashboardStats, formatCurrency, formatDisplayDate, formatNumber } from '../lib/utils';
import { pb } from '../lib/pocketbase';
import type { Bill } from '../types';

interface DashboardProps {
  onNavigate: (page: string) => void;
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const [stats, setStats] = useState({ todaySales: 0, totalProducts: 0, lowStock: 0, totalCustomers: 0, monthlySales: 0, pendingPayments: 0, todayBillCount: 0 });
  const [bills, setBills] = useState<Bill[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [s, allBills] = await Promise.all([getDashboardStats(), getBills()]);
        if (!mounted) return;
        setStats(s);
        setBills(allBills);
        // low stock from products
        try {
          const products = await pb.collection('products').getFullList();
          const low = products.filter((p: any) => Number(p.stock || 0) <= Number(p.min_stock || 10));
          setLowStockProducts(low);
        } catch {}
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  const recentBills = bills.slice(0, 10);

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Loading dashboard...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Today's Sales</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(stats.todaySales)}</p>
          <p className="text-xs text-gray-400 mt-1">{stats.todayBillCount} bills today</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Monthly Sales</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(stats.monthlySales)}</p>
          <p className="text-xs text-gray-400 mt-1">This month</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Pending Payments</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{formatCurrency(stats.pendingPayments)}</p>
          <p className="text-xs text-gray-400 mt-1">Outstanding</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Products</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatNumber(stats.totalProducts)}</p>
          <p className="text-xs text-gray-400 mt-1">{stats.lowStock} low stock</p>
        </div>
      </div>

      {/* Low Stock Alert */}
      {lowStockProducts.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Low Stock Alert</h3>
            <button
              onClick={() => onNavigate('inventory')}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 cursor-pointer"
            >
              View Inventory <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Product</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">SKU</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Current Stock</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Min Level</th>
                </tr>
              </thead>
              <tbody>
                {lowStockProducts.map((product: any) => (
                  <tr key={product.id} className="border-t border-gray-50">
                    <td className="px-4 py-2.5 text-sm text-gray-800">{product.name}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-500 font-mono">{product.sku}</td>
                    <td className="px-4 py-2.5 text-sm font-semibold text-red-600 text-right">{formatNumber(product.stock)} {product.unit}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-500 text-right">{formatNumber(product.min_stock)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Bills */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Recent Bills</h3>
          <button
            onClick={() => onNavigate('bills-history')}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 cursor-pointer"
          >
            View All <ArrowRight className="w-3 h-3" />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Bill No.</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Customer</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Amount</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody>
              {recentBills.map(bill => (
                <tr key={bill.id} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-sm font-medium text-blue-600">{bill.bill_number}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-800">{bill.customer_name}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-500">{formatDisplayDate(bill.date)}</td>
                  <td className="px-4 py-2.5 text-sm font-medium text-gray-800 text-right">{formatCurrency(bill.total)}</td>
                  <td className="px-4 py-2.5">
                    {bill.payment_status === 'Paid' ? (
                      <span className="badge-paid">Paid</span>
                    ) : (
                      <span className="badge-pending">Pending</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => onNavigate('bills-history')}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {recentBills.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                    No bills yet. Create your first sale to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
