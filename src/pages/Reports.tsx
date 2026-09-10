import React, { useEffect, useState } from 'react';
import { FileDown, Download } from 'lucide-react';
import { getBills, formatCurrency, formatNumber, exportToCSV } from '../lib/utils';
import { generateBillsPDF } from '../lib/pdf';
import { pb } from '../lib/pocketbase';
import type { Bill, Product } from '../types';

export default function Reports() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [b, p] = await Promise.all([
        getBills(),
        pb.collection('products').getFullList().then((r: any[]) => r.map((x: any) => ({
          id: x.id, name: x.name, sku: x.sku, category: x.category,
          selling_price: Number(x.selling_price || 0), purchase_price: Number(x.purchase_price || 0),
          labour_charge: Number(x.labour_charge || 0), stock: Number(x.stock || 0),
          min_stock: Number(x.min_stock || 10), unit: x.unit, description: x.description || '', created_at: x.created
        }))).catch(() => [])
      ]);
      setBills(b);
      setProducts(p as Product[]);
      setLoading(false);
    }
    load();
  }, []);

  const totalSales = bills.reduce((sum, b) => sum + Number(b.total || 0), 0);
  const pendingTotal = bills.filter(b => b.payment_status === 'Pending').reduce((sum, b) => sum + Number(b.total || 0), 0);
  const paidTotal = totalSales - pendingTotal;
  const totalBills = bills.length;

  // Product sales - group by product_id to avoid name collision
  const productSales: Record<string, { name: string; qty: number; amount: number; sku: string }> = {};
  bills.forEach(bill => {
    bill.items?.forEach(item => {
      const key = item.product_id || item.product_name;
      if (!productSales[key]) {
        productSales[key] = { name: item.product_name, qty: 0, amount: 0, sku: '' };
      }
      productSales[key].qty += Number(item.quantity || 0);
      // Revenue = line total (unit_price * qty) - labour is tracked separately in bill.labour_total
      // For product report, show line total
      productSales[key].amount += Number(item.total || 0);
    });
  });
  const topProducts = Object.values(productSales).sort((a, b) => b.amount - a.amount);

  // Customer aggregation - group by customer_id/mobile to avoid name collision
  const customerTotals: Record<string, { name: string; amount: number; mobile: string; bills: number }> = {};
  bills.forEach(bill => {
    const key = bill.customer_id || bill.customer_mobile || bill.customer_name;
    if (!customerTotals[key]) {
      customerTotals[key] = { name: bill.customer_name, amount: 0, mobile: bill.customer_mobile, bills: 0 };
    }
    customerTotals[key].amount += Number(bill.total || 0);
    customerTotals[key].bills += 1;
  });
  const topCustomers = Object.values(customerTotals).sort((a, b) => b.amount - a.amount);

  const handleExportReport = async () => {
    await generateBillsPDF(bills);
  };

  const handleExportCSV = () => {
    exportToCSV(bills, `Sales_Report_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Loading reports...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Sales</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totalSales)}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Bills</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{totalBills}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Collected</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(paidTotal)}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Outstanding</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{formatCurrency(pendingTotal)}</p>
        </div>
      </div>

      {/* Top Products */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Product Sales Summary</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">#</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Product</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Qty Sold</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {topProducts.map((product, i) => (
                <tr key={i} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-sm text-gray-500">{i + 1}</td>
                  <td className="px-4 py-2.5 text-sm font-medium text-gray-800">{product.name}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-600 text-right">{formatNumber(product.qty)}</td>
                  <td className="px-4 py-2.5 text-sm font-medium text-gray-800 text-right">{formatCurrency(product.amount)}</td>
                </tr>
              ))}
              {topProducts.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">No sales data yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top Customers */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Customer Summary</h3>
          <div className="flex gap-2">
            <button onClick={handleExportCSV} className="btn-secondary">
              <FileDown className="w-4 h-4" />
              CSV
            </button>
            <button onClick={handleExportReport} className="btn-secondary">
              <Download className="w-4 h-4" />
              PDF Report
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Customer</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Mobile</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Bills</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Total Purchases</th>
              </tr>
            </thead>
            <tbody>
              {topCustomers.map((customer, i) => (
                <tr key={i} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-sm font-medium text-gray-800">{customer.name}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-600">{customer.mobile}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-600 text-right">{customer.bills}</td>
                  <td className="px-4 py-2.5 text-sm font-medium text-gray-800 text-right">{formatCurrency(customer.amount)}</td>
                </tr>
              ))}
              {topCustomers.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">
                    No customer data available yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inventory Status */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Inventory Status</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Product</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">SKU</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Stock</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Min</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Value</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody>
              {products.map(product => (
                <tr key={product.id} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-sm font-medium text-gray-800">{product.name}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-500 font-mono">{product.sku}</td>
                  <td className={`px-4 py-2.5 text-sm font-medium text-right ${product.stock <= product.min_stock ? 'text-red-600' : 'text-gray-800'}`}>
                    {product.stock} {product.unit}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-gray-500 text-right">{product.min_stock}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-800 text-right">{formatCurrency(product.stock * product.selling_price)}</td>
                  <td className="px-4 py-2.5">
                    {product.stock <= product.min_stock ? (
                      <span className="badge-low">Low</span>
                    ) : (
                      <span className="badge-ok">OK</span>
                    )}
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                    No products in inventory
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
