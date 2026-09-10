import React, { useEffect, useState } from 'react';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  X,
  Users,
  Eye
} from 'lucide-react';
import { getCustomers, createCustomer, updateCustomer, deleteCustomer, formatCurrency, getCustomerLedger } from '../lib/utils';
import type { Customer } from '../types';

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    name: '',
    mobile: '',
    email: '',
    address: ''
  });

  const loadCustomers = async () => {
    setLoading(true);
    const data = await getCustomers();
    setCustomers(data);
    setLoading(false);
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.mobile.includes(search)
  );

  const openAddModal = () => {
    setEditingCustomer(null);
    setForm({ name: '', mobile: '', email: '', address: '' });
    setFormError('');
    setShowModal(true);
  };

  const openEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setForm({
      name: customer.name,
      mobile: customer.mobile,
      email: customer.email,
      address: customer.address
    });
    setFormError('');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!form.name.trim()) {
      setFormError('Customer name is required');
      return;
    }
    const mobileRegex = /^[6-9]\d{9}$/;
    if (!mobileRegex.test(form.mobile)) {
      setFormError('Please enter a valid 10-digit Indian mobile number');
      return;
    }

    try {
      if (editingCustomer) {
        await updateCustomer(editingCustomer.id, form);
      } else {
        await createCustomer(form);
      }
      await loadCustomers();
      setShowModal(false);
    } catch (err: any) {
      const msg = err?.data?.data?.mobile?.message || err?.message || 'Error saving customer';
      setFormError(msg);
    }
  };

  const handleDelete = async (customer: Customer) => {
    if (!confirm(`Delete customer "${customer.name}"? This cannot be undone.`)) return;
    try {
      await deleteCustomer(customer.id);
      await loadCustomers();
    } catch (err: any) {
      alert(err.message || 'Cannot delete customer with existing bills.');
    }
  };

  const viewLedger = (customer: Customer) => {
    setSelectedCustomer(customer);
  };

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Loading customers...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Customers</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{customers.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">With Mobile</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{customers.filter(c => c.mobile).length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Outstanding</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">View ledger</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200">
        {/* Toolbar */}
        <div className="p-4 flex flex-wrap items-center justify-between gap-3 border-b border-gray-100">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or mobile..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button onClick={openAddModal} className="btn-primary">
            <Plus className="w-4 h-4" />
            Add Customer
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="table-header px-4 py-2.5">Name</th>
                <th className="table-header px-4 py-2.5">Mobile</th>
                <th className="table-header px-4 py-2.5">Email</th>
                <th className="table-header px-4 py-2.5">Address</th>
                <th className="table-header px-4 py-2.5">Added</th>
                <th className="table-header px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map(customer => (
                <tr key={customer.id} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-sm font-medium text-gray-800">{customer.name}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-600">{customer.mobile}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-500">{customer.email || '—'}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-500 max-w-[200px] truncate">{customer.address || '—'}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-500">{customer.created_at?.slice(0, 10) || '—'}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => viewLedger(customer)}
                        className="p-1.5 rounded text-gray-500 hover:bg-blue-50 hover:text-blue-600 cursor-pointer"
                        title="View Ledger"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => openEditModal(customer)}
                        className="p-1.5 rounded text-gray-500 hover:bg-blue-50 hover:text-blue-600 cursor-pointer"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(customer)}
                        className="p-1.5 rounded text-gray-500 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredCustomers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm">No customers found</p>
                    <p className="text-gray-400 text-xs mt-1">Add your first customer to get started</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Customer Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-semibold text-gray-800">
                  {editingCustomer ? 'Edit Customer' : 'Add Customer'}
                </h3>
                <p className="text-sm text-gray-500 mt-1">Mobile number is required</p>
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
              <div>
                <label className="label">Customer Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="input-field"
                  placeholder="Customer / Company name"
                  required
                />
              </div>
              <div>
                <label className="label">Mobile Number *</label>
                <input
                  type="tel"
                  value={form.mobile}
                  onChange={e => setForm({ ...form, mobile: e.target.value })}
                  className="input-field"
                  placeholder="10-digit mobile number"
                  pattern="[6-9][0-9]{9}"
                  maxLength={10}
                  required
                />
                <p className="text-xs text-gray-400 mt-1">Valid 10-digit Indian mobile number</p>
              </div>
              <div>
                <label className="label">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  className="input-field"
                  placeholder="customer@example.com"
                />
              </div>
              <div>
                <label className="label">Address</label>
                <textarea
                  value={form.address}
                  onChange={e => setForm({ ...form, address: e.target.value })}
                  className="input-field resize-none h-16"
                  placeholder="Customer address..."
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  {editingCustomer ? 'Save Changes' : 'Add Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer Ledger Modal */}
      {selectedCustomer && (
        <CustomerLedger customer={selectedCustomer} onClose={() => setSelectedCustomer(null)} />
      )}
    </div>
  );
}

function CustomerLedger({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const [ledger, setLedger] = useState<{ bills: any[]; totalOutstanding: number; totalPaid: number } | null>(null);

  useEffect(() => {
    getCustomerLedger(customer.id).then(setLedger);
  }, [customer.id]);

  if (!ledger) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content max-w-2xl p-6" onClick={e => e.stopPropagation()}>
          <p className="text-sm text-gray-500">Loading ledger...</p>
        </div>
      </div>
    );
  }

  const { bills, totalOutstanding, totalPaid } = ledger;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Customer Ledger</h3>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-sm font-medium text-gray-600">{customer.name}</p>
              <span className="text-xs text-gray-400">|</span>
              <p className="text-sm text-gray-500">{customer.mobile}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 cursor-pointer">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-4 p-6">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-xl font-bold text-gray-800">{bills.length}</p>
            <p className="text-xs text-gray-500 mt-1">Total Bills</p>
          </div>
          <div className="bg-green-50 rounded-lg p-3 text-center">
            <p className="text-xl font-bold text-green-600">{formatCurrency(totalPaid)}</p>
            <p className="text-xs text-gray-500 mt-1">Paid</p>
          </div>
          <div className="bg-amber-50 rounded-lg p-3 text-center">
            <p className="text-xl font-bold text-amber-600">{formatCurrency(totalOutstanding)}</p>
            <p className="text-xs text-gray-500 mt-1">Outstanding</p>
          </div>
        </div>

        <div className="px-6 pb-6">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="table-header px-4 py-2.5">Bill No.</th>
                <th className="table-header px-4 py-2.5">Date</th>
                <th className="table-header px-4 py-2.5 text-right">Amount</th>
                <th className="table-header px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((bill: any) => (
                <tr key={bill.id} className="border-t border-gray-50">
                  <td className="px-4 py-2.5 text-sm font-medium text-blue-600">{bill.bill_number}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-600">{bill.date}</td>
                  <td className="px-4 py-2.5 text-sm font-medium text-gray-800 text-right">{formatCurrency(bill.total)}</td>
                  <td className="px-4 py-2.5">
                    {bill.payment_status === 'Paid' ? (
                      <span className="badge-paid">Paid</span>
                    ) : (
                      <span className="badge-pending">Pending</span>
                    )}
                  </td>
                </tr>
              ))}
              {bills.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">
                    No bills found for this customer
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
