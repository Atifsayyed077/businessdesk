import React, { useState, useRef, useEffect } from 'react';
import {
  Plus,
  Trash2,
  UserPlus,
  Search,
  Check,
  X,
  Phone,
  Calendar
} from 'lucide-react';
import { getProducts, getCustomers, getCustomerByMobile, createCustomer, formatCurrency, formatNumber, getISTDate, formatDisplayDate, formatFullDate, getNextBillNumber } from '../lib/utils';
import { pb } from '../lib/pocketbase';
import type { Product, Customer } from '../types';
import InvoicePreview from '../components/InvoicePreview';
import ThermalBillPreview from '../components/ThermalBillPreview';
import { buildReceiptData } from '../lib/thermalReceipt';
import { printerManager } from '../lib/printer';

interface CartItem {
  product: Product;
  quantity: number;
  unit_price: number;
  labour_charge: number;
  total: number;
}

export default function Billing() {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerQuery, setCustomerQuery] = useState('');
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [selectedQty, setSelectedQty] = useState('1');
  const [notes, setNotes] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'Paid' | 'Pending'>('Pending');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'UPI' | 'Pending'>('Pending');
  const [paidToday, setPaidToday] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);
  const [createdBill, setCreatedBill] = useState<any>(null);
  const [formError, setFormError] = useState('');
  const [billNumber, setBillNumber] = useState('INV-1001');
  const [saving, setSaving] = useState(false);
  const [showThermal, setShowThermal] = useState(false);
  const [thermalData, setThermalData] = useState<any>(null);

  const [newCustomerForm, setNewCustomerForm] = useState({ name: '', mobile: '', email: '', address: '' });
  const customerInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    const [p, c] = await Promise.all([getProducts(), getCustomers()]);
    setProducts(p);
    setCustomers(c);
    const next = await getNextBillNumber();
    setBillNumber(next);
  };

  useEffect(() => {
    loadData();
  }, []);

  // Close suggestions on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.customer-search-container')) {
        setShowCustomerSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Ctrl+P for thermal print
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        if (createdBill && thermalData) {
          e.preventDefault();
          setShowThermal(true);
        } else if (cart.length > 0 && selectedCustomer) {
          e.preventDefault();
          // Preview current cart as thermal
          handlePreviewThermal();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [createdBill, thermalData, cart, selectedCustomer]);

  const handlePreviewThermal = async () => {
    if (cart.length === 0 || !selectedCustomer) {
      setFormError('Add items and select customer to preview');
      return;
    }
    const mockBill: any = {
      bill_number: billNumber,
      date: getISTDate(),
      customer_name: selectedCustomer.name,
      customer_mobile: selectedCustomer.mobile,
      subtotal,
      labour_total: labourTotal,
      total: grandTotal,
      payment_status: paymentMethod === 'Pending' ? 'Pending' : 'Paid',
      payment_method: paymentMethod,
      paid_amount: parseFloat(paidToday) || (paymentMethod === 'Pending' ? 0 : grandTotal),
      remaining_amount: Math.max(0, grandTotal - (parseFloat(paidToday) || 0)),
      items: cart.map(c => ({
        product_name: c.product.name,
        quantity: c.quantity,
        unit_price: c.unit_price,
        labour_charge: c.labour_charge,
        total: c.unit_price * c.quantity,
        sku: c.product.sku,
      })),
      created_at: new Date().toISOString(),
    };
    const data = await buildReceiptData(mockBill, 'Sales Bill');
    setThermalData(data);
    setShowThermal(true);
  };

  const filteredCustomers = customerQuery
    ? customers.filter(c =>
        c.name.toLowerCase().includes(customerQuery.toLowerCase()) ||
        c.mobile.includes(customerQuery)
      )
    : customers;

  const subtotal = cart.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
  const labourTotal = cart.reduce((sum, item) => sum + (item.labour_charge * item.quantity), 0);
  const grandTotal = subtotal + labourTotal;

  const addToCart = () => {
    if (!selectedProductId) {
      setFormError('Please select a product');
      return;
    }
    const product = products.find(p => p.id === selectedProductId);
    if (!product) return;
    const qty = parseFloat(selectedQty);
    if (!qty || qty <= 0) {
      setFormError('Quantity must be greater than 0');
      return;
    }
    if (!Number.isFinite(qty)) {
      setFormError('Invalid quantity');
      return;
    }
    // For pcs/pair/set etc, enforce integer
    const integerUnits = ['pcs', 'pair', 'set', 'box', 'carton'];
    if (integerUnits.includes(product.unit) && !Number.isInteger(qty)) {
      setFormError(`Quantity must be whole number for ${product.unit}`);
      return;
    }
    if (qty > product.stock) {
      setFormError(`Only ${product.stock} ${product.unit} available in stock`);
      return;
    }

    const existing = cart.find(i => i.product.id === product.id);
    const labourCharge = product.labour_charge || 0;

    if (existing) {
      if (existing.quantity + qty > product.stock) {
        setFormError(`Only ${product.stock} ${product.unit} available in stock (already ${existing.quantity} in cart)`);
        return;
      }
      setCart(cart.map(i =>
        i.product.id === product.id
          ? { ...i, quantity: i.quantity + qty, labour_charge: labourCharge, total: i.unit_price * (i.quantity + qty) }
          : i
      ));
    } else {
      setCart([...cart, {
        product,
        quantity: qty,
        unit_price: product.selling_price,
        labour_charge: labourCharge,
        total: product.selling_price * qty
      }]);
    }
    setFormError('');
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(i => i.product.id !== productId));
  };

  const updateLabour = (productId: string, value: number) => {
    if (value < 0) return;
    setCart(cart.map(i =>
      i.product.id === productId
        ? { ...i, labour_charge: value }
        : i
    ));
  };

  const updateRate = (productId: string, value: number) => {
    if (value < 0) return;
    setCart(cart.map(i =>
      i.product.id === productId
        ? { ...i, unit_price: value, total: value * i.quantity }
        : i
    ));
  };

  const selectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setCustomerQuery('');
    setShowCustomerSuggestions(false);
  };

  const saveBill = async (status: 'Paid' | 'Pending') => {
    if (saving) return;
    if (!selectedCustomer) {
      setFormError('Please select a customer');
      return;
    }
    if (cart.length === 0) {
      setFormError('Please add at least one product to the bill');
      return;
    }

    setSaving(true);
    setFormError('');

    try {
      const billNum = await getNextBillNumber();
      const todayStr = getISTDate();

      // Handle credit: paid today
      const paidTodayNum = parseFloat(paidToday) || 0;
      let method = paymentMethod === 'Pending' ? 'Pending' : paymentMethod;
      let finalStatus: 'Paid' | 'Pending' = method === 'Pending' ? 'Pending' : 'Paid';
      let paidAmount = 0;
      let remainingAmount = grandTotal;

      if (paidTodayNum > 0) {
        if (paidTodayNum >= grandTotal) {
          paidAmount = grandTotal;
          remainingAmount = 0;
          finalStatus = 'Paid';
          method = paymentMethod === 'Pending' ? 'Cash' : paymentMethod;
        } else {
          paidAmount = paidTodayNum;
          remainingAmount = grandTotal - paidTodayNum;
          finalStatus = 'Pending';
          // Keep method as selected (Cash/UPI) for partial
        }
      } else {
        // No partial, use full logic
        if (finalStatus === 'Paid') {
          paidAmount = grandTotal;
          remainingAmount = 0;
        } else {
          paidAmount = 0;
          remainingAmount = grandTotal;
        }
      }

      if (paidTodayNum > grandTotal) {
        setFormError(`Paid amount ₹${paidTodayNum} cannot exceed Grand Total ₹${grandTotal}`);
        setSaving(false);
        return;
      }

      // Create bill
      const billData: any = {
        bill_number: billNum,
        customer: selectedCustomer.id,
        customer_name: selectedCustomer.name,
        customer_mobile: selectedCustomer.mobile,
        date: todayStr,
        subtotal,
        labour_total: labourTotal,
        total: grandTotal,
        payment_status: finalStatus,
        payment_method: method,
        paid_amount: paidAmount,
        remaining_amount: remainingAmount,
        due_date: dueDate || '',
        notes,
      };

      const billRecord = await pb.collection('bills').create(billData);
      const billId = billRecord.id;

      // Create initial payment record if paid
      if (paidAmount > 0) {
        try {
          await pb.collection('payments').create({
            bill: billId,
            bill_number: billNum,
            customer: selectedCustomer.id,
            customer_name: selectedCustomer.name,
            customer_mobile: selectedCustomer.mobile,
            amount: paidAmount,
            payment_method: method === 'Pending' ? 'Cash' : method,
            payment_date: todayStr,
            notes: `Initial payment for ${billNum}${remainingAmount > 0 ? ` - Remaining ${formatCurrency(remainingAmount)} due ${dueDate || 'later'}` : ''}`,
          });
        } catch (e) {
          console.warn('Failed to create payment record', e);
        }
      }

      // Create bill items and update stock
      for (const item of cart) {
        // Check stock still sufficient
        const currentProduct = await pb.collection('products').getOne(item.product.id).catch(() => null);
        if (!currentProduct) throw new Error(`Product ${item.product.name} not found`);
        const currentStock = Number(currentProduct.stock || 0);
        if (currentStock < item.quantity) {
          // Rollback bill
          await pb.collection('bills').delete(billId).catch(() => {});
          throw new Error(`Insufficient stock for ${item.product.name}. Available: ${currentStock}`);
        }

        await pb.collection('bill_items').create({
          bill: billId,
          bill_id: billId,
          product: item.product.id,
          product_id: item.product.id,
          product_name: item.product.name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          labour_charge: item.labour_charge,
          total: item.unit_price * item.quantity,
        });

        // Decrement stock atomically
        await pb.collection('products').update(item.product.id, {
          stock: currentStock - item.quantity,
        });
      }

      const savedBill = {
        id: billId,
        bill_number: billNum,
        customer_id: selectedCustomer.id,
        customer_name: selectedCustomer.name,
        customer_mobile: selectedCustomer.mobile,
        date: todayStr,
        subtotal,
        labour_total: labourTotal,
        total: grandTotal,
        payment_status: finalStatus,
        payment_method: method,
        paid_amount: paidAmount,
        remaining_amount: remainingAmount,
        due_date: dueDate || '',
        notes,
        created_at: new Date().toISOString(),
        items: cart.map((item) => ({
          id: Math.random().toString(36).slice(2),
          bill_id: billId,
          product_id: item.product.id,
          product_name: item.product.name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          labour_charge: item.labour_charge,
          total: item.unit_price * item.quantity
        }))
      };

      setCreatedBill(savedBill);
      // Build thermal receipt data for 80mm print
      const thermalReceipt = await buildReceiptData(savedBill as any, 'Sales Bill');
      setThermalData(thermalReceipt);
      // Auto-print if enabled, otherwise show thermal preview
      const autoPrint = printerManager.getSettings().autoPrint;
      if (autoPrint) {
        setShowThermal(true);
        // Give time for state to update then print
        setTimeout(async () => {
          try {
            const { renderThermalText } = await import('../lib/thermalReceipt');
            const text = renderThermalText(thermalReceipt, '80mm');
            await printerManager.printText(text);
          } catch {}
        }, 500);
      } else {
        setShowInvoice(true);
        // Also prepare thermal for Print button
      }
      resetForm();
      await loadData();
    } catch (err: any) {
      console.error(err);
      const msg = err?.data?.data?.bill_number?.message || err?.message || 'Error saving bill';
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setCart([]);
    setSelectedProductId('');
    setSelectedQty('1');
    setNotes('');
    setPaymentStatus('Pending');
    setPaymentMethod('Pending');
    setPaidToday('');
    setDueDate('');
    setSelectedCustomer(null);
    setCustomerQuery('');
    setFormError('');
  };

  const addNewCustomer = async () => {
    setFormError('');
    if (!newCustomerForm.name.trim()) {
      setFormError('Customer name is required');
      return;
    }
    const mobileRegex = /^[6-9]\d{9}$/;
    if (!mobileRegex.test(newCustomerForm.mobile)) {
      setFormError('Please enter a valid 10-digit mobile number');
      return;
    }

    try {
      const newCustomer = await createCustomer(newCustomerForm);
      const updated = await getCustomers();
      setCustomers(updated);
      selectCustomer(newCustomer);
      setShowNewCustomerModal(false);
      setNewCustomerForm({ name: '', mobile: '', email: '', address: '' });
    } catch (err: any) {
      const msg = err?.data?.data?.mobile?.message || err?.message || 'Error saving customer';
      setFormError(msg);
    }
  };

  return (
    <div className="p-6">
      {/* Bill header */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Invoice Number</p>
          <p className="text-xl font-bold text-gray-900">{billNumber}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Date</p>
          <p className="text-sm font-medium text-gray-800 flex items-center justify-end gap-1">
            <Calendar className="w-4 h-4" />
            {formatFullDate(new Date())}
          </p>
        </div>
      </div>

      {formError && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {formError}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left: Customer + Products */}
        <div className="xl:col-span-2 space-y-6">
          {/* Customer Selection */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Customer</h3>
              <button
                onClick={() => setShowNewCustomerModal(true)}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                New Customer
              </button>
            </div>

            {selectedCustomer ? (
              <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                    {selectedCustomer.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-medium text-gray-800">{selectedCustomer.name}</p>
                    <p className="text-sm text-gray-500 flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5" />
                      {selectedCustomer.mobile}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCustomer(null)}
                  className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="relative customer-search-container">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  ref={customerInputRef}
                  type="text"
                  value={customerQuery}
                  onChange={e => {
                    setCustomerQuery(e.target.value);
                    setShowCustomerSuggestions(true);
                  }}
                  onFocus={() => setShowCustomerSuggestions(true)}
                  placeholder="Search by name or mobile number..."
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {showCustomerSuggestions && customerQuery && (
                  <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                    {filteredCustomers.map(c => (
                      <button
                        key={c.id}
                        onClick={() => selectCustomer(c)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left cursor-pointer"
                      >
                        <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                          <span className="text-sm font-semibold text-gray-600">{c.name.charAt(0)}</span>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-800">{c.name}</p>
                          <p className="text-xs text-gray-500">{c.mobile}</p>
                        </div>
                        <Check className="w-4 h-4 text-gray-300" />
                      </button>
                    ))}
                    {filteredCustomers.length === 0 && (
                      <button
                        onClick={() => setShowNewCustomerModal(true)}
                        className="w-full px-4 py-3 text-left text-sm text-blue-600 hover:bg-blue-50 font-medium cursor-pointer"
                      >
                        <UserPlus className="w-4 h-4 inline mr-1" />
                        Add "{customerQuery}" as new customer
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Product Selection */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Add Products</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
              <div className="md:col-span-2">
                <label className="label">Product</label>
                <select
                  value={selectedProductId}
                  onChange={e => setSelectedProductId(e.target.value)}
                  className="input-field cursor-pointer"
                >
                  <option value="">Select product...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id} disabled={p.stock <= 0}>
                      {p.name} ({p.sku}) | Stock: {formatNumber(p.stock)} {p.unit} | {formatCurrency(p.selling_price)}/{p.unit}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Quantity</label>
                <input
                  type="number"
                  value={selectedQty}
                  onChange={e => setSelectedQty(e.target.value)}
                  className="input-field"
                  min="0"
                  step="0.01"
                />
              </div>
              <div className="flex items-end">
                <button onClick={addToCart} className="btn-primary w-full">
                  <Plus className="w-4 h-4" />
                  Add
                </button>
              </div>
            </div>

            {/* Cart */}
            {cart.length > 0 && (
              <div className="overflow-x-auto mt-4">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="table-header px-4 py-2.5">Product</th>
                      <th className="table-header px-4 py-2.5 text-right">Qty</th>
                      <th className="table-header px-4 py-2.5 text-right">Rate (Edit)</th>
                      <th className="table-header px-4 py-2.5 text-right">Add. Charge</th>
                      <th className="table-header px-4 py-2.5 text-right">Total</th>
                      <th className="table-header px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map(item => (
                      <tr key={item.product.id} className="border-t border-gray-100">
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-gray-800">{item.product.name}</p>
                          <p className="text-xs text-gray-400">{item.product.sku} | {item.product.category}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-600">{formatNumber(item.quantity)} {item.product.unit}</td>
                        <td className="px-4 py-3 text-right">
                          <input
                            type="number"
                            value={item.unit_price}
                            onChange={e => updateRate(item.product.id, parseFloat(e.target.value) || 0)}
                            className="w-24 px-2 py-1 text-sm text-right border border-blue-300 bg-blue-50/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                            min="0"
                            step="0.01"
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input
                            type="number"
                            value={item.labour_charge}
                            onChange={e => updateLabour(item.product.id, parseFloat(e.target.value) || 0)}
                            className="w-24 px-2 py-1 text-sm text-right border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            min="0"
                            step="0.01"
                          />
                        </td>
                        <td className="px-4 py-3 text-sm font-bold text-right text-gray-900">
                          {formatCurrency(item.unit_price * item.quantity)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => removeFromCart(item.product.id)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right: Summary */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Bill Summary</h3>

            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="font-medium text-gray-800">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Additional Charges</span>
                <span className="font-medium text-gray-800">{formatCurrency(labourTotal)}</span>
              </div>
              <div className="border-t border-gray-200 pt-3 flex justify-between">
                <span className="font-semibold text-gray-800">Grand Total</span>
                <span className="font-bold text-lg text-gray-900">{formatCurrency(grandTotal)}</span>
              </div>
            </div>

            <div className="mt-6">
              <label className="label">Payment Method *</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => { setPaymentMethod('Cash'); setPaymentStatus('Paid'); }}
                  className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors cursor-pointer flex flex-col items-center gap-1 ${
                    paymentMethod === 'Cash'
                      ? 'bg-green-600 text-white border-green-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-base">💵</span>
                  Cash
                </button>
                <button
                  onClick={() => { setPaymentMethod('UPI'); setPaymentStatus('Paid'); }}
                  className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors cursor-pointer flex flex-col items-center gap-1 ${
                    paymentMethod === 'UPI'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-base">📱</span>
                  UPI
                </button>
                <button
                  onClick={() => { setPaymentMethod('Pending'); setPaymentStatus('Pending'); }}
                  className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors cursor-pointer flex flex-col items-center gap-1 ${
                    paymentMethod === 'Pending'
                      ? 'bg-amber-500 text-white border-amber-500'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-base">⏳</span>
                  Pending
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2 text-center">
                {paymentMethod === 'Cash' ? 'Cash payment - mark as Paid' : paymentMethod === 'UPI' ? 'UPI payment - mark as Paid' : 'Payment pending - bill stays unpaid'}
              </p>
            </div>

            {/* Credit: Paid Today */}
            <div className="mt-4 border-t border-gray-100 pt-4">
              <label className="label flex items-center gap-1">💳 Customer Paid Today (in Total ₹{formatCurrency(grandTotal).replace('₹','')})</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
                <input
                  type="number"
                  value={paidToday}
                  onChange={e => setPaidToday(e.target.value)}
                  className="input-field pl-7"
                  placeholder={`0 to ${Math.round(grandTotal)}`}
                  min="0"
                  max={grandTotal}
                  step="0.01"
                />
              </div>
              {(() => {
                const paid = parseFloat(paidToday) || 0;
                const remaining = Math.max(0, grandTotal - paid);
                const isPartial = paid > 0 && paid < grandTotal;
                const isFull = paid >= grandTotal && grandTotal > 0;
                const isOver = paid > grandTotal;
                return (
                  <div className="mt-2 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className={remaining > 0 ? 'text-amber-600 font-medium' : 'text-green-600 font-medium'}>
                        Remaining: {formatCurrency(remaining)} {remaining > 0 ? '(Credit)' : '(Clear)'}
                      </span>
                      <span className={isPartial ? 'text-amber-600' : isFull ? 'text-green-600' : 'text-gray-500'}>
                        {isOver ? '⚠️ Overpaid' : isFull ? '✓ Full Paid' : isPartial ? 'Partial' : 'Unpaid'}
                      </span>
                    </div>
                    {isPartial && (
                      <p className="text-xs text-amber-600">Customer will pay {formatCurrency(remaining)} later</p>
                    )}
                  </div>
                );
              })()}
            </div>

            {(parseFloat(paidToday) || 0) > 0 && (parseFloat(paidToday) || 0) < grandTotal && (
              <div className="mt-3">
                <label className="label">Due Date (when to pay remaining?)</label>
                <div className="flex gap-2 mb-2">
                  {[5, 10, 30].map(days => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setDate(d.getDate() + days);
                        setDueDate(d.toISOString().slice(0, 10));
                      }}
                      className={`text-xs px-2 py-1 rounded border ${dueDate === new Date(Date.now() + days*24*3600*1000).toISOString().slice(0,10) ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-600'}`}
                    >
                      {days} days
                    </button>
                  ))}
                </div>
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="input-field"
                  min={new Date().toISOString().slice(0, 10)}
                />
                <p className="text-xs text-gray-400 mt-1">e.g., 10 days from today</p>
              </div>
            )}

            <div className="mt-4">
              <label className="label">Notes / Remarks</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="input-field resize-none h-20"
                placeholder="Additional notes..."
              />
            </div>

            <div className="mt-6 space-y-3">
              <button onClick={() => saveBill(paymentMethod === 'Pending' ? 'Pending' : 'Paid')} disabled={saving} className="btn-primary w-full disabled:opacity-50">
                <Check className="w-4 h-4" />
                {saving ? 'Saving...' : (() => {
                  const paid = parseFloat(paidToday) || 0;
                  if (paid >= grandTotal && grandTotal > 0) return paymentMethod === 'Cash' ? 'Save & Print (Cash - Full)' : paymentMethod === 'UPI' ? 'Save & Print (UPI - Full)' : 'Save & Print (Full Paid)';
                  if (paid > 0) return `Save Credit Bill (${formatCurrency(paid)} paid)`;
                  return paymentMethod === 'Cash' ? 'Save & Print (Cash)' : paymentMethod === 'UPI' ? 'Save & Print (UPI)' : 'Save & Print (Pending)';
                })()}
              </button>
              {paymentMethod === 'Pending' && !(parseFloat(paidToday) || 0) ? (
                <button onClick={() => saveBill('Pending')} disabled={saving} className="btn-secondary w-full disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save as Pending (Full Credit)'}
                </button>
              ) : null}
              {(parseFloat(paidToday) || 0) > 0 && (parseFloat(paidToday) || 0) < grandTotal && (
                <p className="text-xs text-center text-amber-600">Bill will be saved as Credit — Remaining {formatCurrency(Math.max(0, grandTotal - (parseFloat(paidToday) || 0)))} due {dueDate ? formatDisplayDate(dueDate) : 'later'}</p>
              )}
              <button
                onClick={handlePreviewThermal}
                disabled={cart.length === 0 || !selectedCustomer}
                className="btn-secondary w-full border-dashed disabled:opacity-50"
                title="Preview 80mm thermal receipt"
              >
                🖨️ Preview Thermal (80mm)
              </button>
              <p className="text-xs text-center text-gray-400">Thermal 80mm • Auto height • {cart.length} items • Ctrl+P</p>
            </div>
          </div>
        </div>
      </div>

      {/* New Customer Modal */}
      {showNewCustomerModal && (
        <div className="modal-overlay" onClick={() => setShowNewCustomerModal(false)}>
          <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-semibold text-gray-800">Add New Customer</h3>
                <p className="text-sm text-gray-500 mt-1">Mobile number is required</p>
              </div>
              <button onClick={() => setShowNewCustomerModal(false)} className="p-2 rounded-lg hover:bg-gray-100 cursor-pointer">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="label">Customer Name *</label>
                <input
                  type="text"
                  value={newCustomerForm.name}
                  onChange={e => setNewCustomerForm({ ...newCustomerForm, name: e.target.value })}
                  className="input-field"
                  placeholder="Customer / Company name"
                />
              </div>
              <div>
                <label className="label">Mobile Number *</label>
                <input
                  type="tel"
                  value={newCustomerForm.mobile}
                  onChange={e => setNewCustomerForm({ ...newCustomerForm, mobile: e.target.value })}
                  className="input-field"
                  placeholder="10-digit mobile number"
                  maxLength={10}
                />
              </div>
              <div>
                <label className="label">Email</label>
                <input
                  type="email"
                  value={newCustomerForm.email}
                  onChange={e => setNewCustomerForm({ ...newCustomerForm, email: e.target.value })}
                  className="input-field"
                  placeholder="customer@example.com"
                />
              </div>
              <div>
                <label className="label">Address</label>
                <textarea
                  value={newCustomerForm.address}
                  onChange={e => setNewCustomerForm({ ...newCustomerForm, address: e.target.value })}
                  className="input-field resize-none h-20"
                  placeholder="Customer address..."
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button onClick={() => setShowNewCustomerModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button onClick={addNewCustomer} className="btn-primary">
                  Save & Select
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Preview (A4) */}
      {showInvoice && createdBill && (
        <InvoicePreview bill={createdBill} onClose={() => setShowInvoice(false)} />
      )}

      {/* Thermal Preview (80mm) - primary for thermal printing */}
      {showThermal && thermalData && (
        <ThermalBillPreview receiptData={thermalData} billNumber={createdBill?.bill_number || billNumber} onClose={() => setShowThermal(false)} />
      )}
    </div>
  );
}
