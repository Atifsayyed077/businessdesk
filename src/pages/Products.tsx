import React, { useEffect, useState } from 'react';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  X,
  Package
} from 'lucide-react';
import { getProducts, createProduct, updateProduct, deleteProduct, formatNumber, formatCurrency } from '../lib/utils';
import type { Product } from '../types';

interface ProductsProps {
  inventoryMode?: boolean;
}

export default function Products({ inventoryMode = false }: ProductsProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    name: '',
    sku: '',
    category: 'General',
    purchase_price: 0,
    selling_price: 0,
    labour_charge: 0,
    stock: 0,
    min_stock: 10,
    unit: 'pcs',
    description: ''
  });

  const loadProducts = async () => {
    setLoading(true);
    const data = await getProducts();
    setProducts(data);
    setLoading(false);
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const categories = [...new Set(products.map(p => p.category))];

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;
    const matchesStock = stockFilter === 'all' ||
      (stockFilter === 'low' ? p.stock <= p.min_stock : p.stock > p.min_stock);
    return matchesSearch && matchesCategory && matchesStock;
  });

  const openAddModal = () => {
    setEditingProduct(null);
    setForm({ name: '', sku: '', category: 'General', purchase_price: 0, selling_price: 0, labour_charge: 0, stock: 0, min_stock: 10, unit: 'pcs', description: '' });
    setFormError('');
    setShowModal(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setForm({
      name: product.name,
      sku: product.sku,
      category: product.category,
      purchase_price: product.purchase_price,
      selling_price: product.selling_price,
      labour_charge: product.labour_charge,
      stock: product.stock,
      min_stock: product.min_stock,
      unit: product.unit,
      description: product.description
    });
    setFormError('');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!form.name.trim()) {
      setFormError('Product name is required');
      return;
    }
    if (!form.sku.trim()) {
      setFormError('SKU is required');
      return;
    }
    if (form.selling_price < 0 || form.purchase_price < 0 || form.labour_charge < 0) {
      setFormError('Prices cannot be negative');
      return;
    }
    if (form.stock < 0 || form.min_stock < 0) {
      setFormError('Stock values cannot be negative');
      return;
    }

    try {
      if (editingProduct) {
        await updateProduct(editingProduct.id, form);
      } else {
        await createProduct(form);
      }
      await loadProducts();
      setShowModal(false);
    } catch (err: any) {
      const msg = err?.data?.data?.sku?.message || err?.message || 'Error saving product. SKU might already exist.';
      setFormError(msg);
    }
  };

  const handleDelete = async (product: Product) => {
    if (!confirm(`Delete product "${product.name}"? This cannot be undone.`)) return;
    try {
      await deleteProduct(product.id);
      await loadProducts();
    } catch (err: any) {
      alert(err.message || 'Cannot delete product with existing bills.');
    }
  };

  const totalStockValue = products.reduce((sum, p) => sum + (p.stock * p.selling_price), 0);
  const totalStockQty = products.reduce((s, p) => s + p.stock, 0);
  const lowStockCount = products.filter(p => p.stock <= p.min_stock).length;

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Loading products...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Stats header for inventory view */}
      {inventoryMode && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Products</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{formatNumber(products.length)}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Units</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{formatNumber(totalStockQty)}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Low Stock</p>
            <p className="text-2xl font-bold text-red-600 mt-1">{formatNumber(lowStockCount)}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Stock Value</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totalStockValue)}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200">
        {/* Toolbar */}
        <div className="p-4 flex flex-wrap items-center gap-3 border-b border-gray-100">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or SKU..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white cursor-pointer"
          >
            <option value="all">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select
            value={stockFilter}
            onChange={e => setStockFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white cursor-pointer"
          >
            <option value="all">All Stock</option>
            <option value="low">Low Stock</option>
            <option value="ok">In Stock</option>
          </select>

          <button onClick={openAddModal} className="btn-primary">
            <Plus className="w-4 h-4" />
            Add Product
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="table-header px-4 py-2.5">Product</th>
                <th className="table-header px-4 py-2.5">SKU</th>
                <th className="table-header px-4 py-2.5">Category</th>
                <th className="table-header px-4 py-2.5 text-right">Sell Price</th>
                <th className="table-header px-4 py-2.5 text-right">Cost Price</th>
                <th className="table-header px-4 py-2.5 text-right">Add. Charge</th>
                <th className="table-header px-4 py-2.5 text-right">Stock</th>
                <th className="table-header px-4 py-2.5">Unit</th>
                <th className="table-header px-4 py-2.5 text-right">Min Level</th>
                <th className="table-header px-4 py-2.5">Status</th>
                <th className="table-header px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map(product => (
                <tr key={product.id} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <p className="text-sm font-medium text-gray-800">{product.name}</p>
                    {product.description && <p className="text-xs text-gray-400 max-w-[200px] truncate">{product.description}</p>}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-gray-500 font-mono">{product.sku}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-600">{product.category}</td>
                  <td className="px-4 py-2.5 text-sm font-medium text-gray-800 text-right">{formatCurrency(product.selling_price)}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-500 text-right">{formatCurrency(product.purchase_price)}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-500 text-right">{formatCurrency(product.labour_charge)}</td>
                  <td className={`px-4 py-2.5 text-sm font-medium text-right ${product.stock <= product.min_stock ? 'text-red-600' : 'text-gray-800'}`}>
                    {formatNumber(product.stock)}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-gray-500">{product.unit}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-500 text-right">{formatNumber(product.min_stock)}</td>
                  <td className="px-4 py-2.5">
                    {product.stock <= product.min_stock ? (
                      <span className="badge-low">Low</span>
                    ) : (
                      <span className="badge-ok">OK</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(product)}
                        className="p-1.5 rounded text-gray-500 hover:bg-blue-50 hover:text-blue-600 cursor-pointer"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(product)}
                        className="p-1.5 rounded text-gray-500 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center">
                    <Package className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm">No products found</p>
                    <p className="text-gray-400 text-xs mt-1">Add your first product to get started</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Product Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content max-w-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-semibold text-gray-800">
                  {editingProduct ? 'Edit Product' : 'Add New Product'}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  {editingProduct ? 'Update product information' : 'Fill in the product details below'}
                </p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 cursor-pointer">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {formError && (
              <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="label">Product Name *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    className="input-field"
                    placeholder="Product name"
                    required
                  />
                </div>
                <div>
                  <label className="label">SKU / Code *</label>
                  <input
                    type="text"
                    value={form.sku}
                    onChange={e => setForm({ ...form, sku: e.target.value })}
                    className="input-field"
                    placeholder="e.g. PRD-001"
                    required
                  />
                </div>
                <div>
                  <label className="label">Category</label>
                  <input
                    type="text"
                    value={form.category}
                    onChange={e => setForm({ ...form, category: e.target.value })}
                    className="input-field"
                    placeholder="e.g. Electronics, Grocery, Hardware"
                  />
                </div>
                <div>
                  <label className="label">Selling Price *</label>
                  <input
                    type="number"
                    value={form.selling_price}
                    onChange={e => setForm({ ...form, selling_price: parseFloat(e.target.value) || 0 })}
                    className="input-field"
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    required
                  />
                </div>
                <div>
                  <label className="label">Cost / Purchase Price</label>
                  <input
                    type="number"
                    value={form.purchase_price}
                    onChange={e => setForm({ ...form, purchase_price: parseFloat(e.target.value) || 0 })}
                    className="input-field"
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="label">Additional Charge (per unit)</label>
                  <input
                    type="number"
                    value={form.labour_charge}
                    onChange={e => setForm({ ...form, labour_charge: parseFloat(e.target.value) || 0 })}
                    className="input-field"
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                  />
                  <p className="text-xs text-gray-400 mt-1">Service/handling charge per unit</p>
                </div>
                <div>
                  <label className="label">Unit</label>
                  <select
                    value={form.unit}
                    onChange={e => setForm({ ...form, unit: e.target.value })}
                    className="input-field cursor-pointer"
                  >
                    <option value="pcs">Pieces (Pcs)</option>
                    <option value="kg">Kilograms (Kg)</option>
                    <option value="g">Grams (G)</option>
                    <option value="litre">Litres (L)</option>
                    <option value="ml">Millilitres (Ml)</option>
                    <option value="box">Box</option>
                    <option value="bag">Bag</option>
                    <option value="roll">Roll</option>
                    <option value="carton">Carton</option>
                    <option value="pair">Pair</option>
                    <option value="set">Set</option>
                    <option value="units">Units</option>
                  </select>
                </div>
                <div>
                  <label className="label">Opening Stock</label>
                  <input
                    type="number"
                    value={form.stock}
                    onChange={e => setForm({ ...form, stock: parseFloat(e.target.value) || 0 })}
                    className="input-field"
                    placeholder="0"
                    min="0"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="label">Minimum Stock Level</label>
                  <input
                    type="number"
                    value={form.min_stock}
                    onChange={e => setForm({ ...form, min_stock: parseFloat(e.target.value) || 0 })}
                    className="input-field"
                    placeholder="10"
                    min="0"
                  />
                  <p className="text-xs text-gray-400 mt-1">Alert when stock falls below this</p>
                </div>
                <div className="col-span-2">
                  <label className="label">Description / Notes</label>
                  <textarea
                    value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                    className="input-field resize-none h-16"
                    placeholder="Optional product description..."
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  {editingProduct ? 'Save Changes' : 'Add Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
