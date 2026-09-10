export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  purchase_price: number;
  selling_price: number;
  labour_charge: number;
  stock: number;
  min_stock: number;
  unit: string;
  description: string;
  created_at: string;
}

export interface Customer {
  id: string;
  name: string;
  mobile: string;
  email: string;
  address: string;
  created_at: string;
}

export interface BillItem {
  id: string;
  bill_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  labour_charge: number;
  total: number;
}

export interface Bill {
  id: string;
  bill_number: string;
  customer_id: string;
  customer_name: string;
  customer_mobile: string;
  date: string;
  subtotal: number;
  labour_total: number;
  total: number;
  payment_status: 'Paid' | 'Pending';
  payment_method?: 'Cash' | 'UPI' | 'Card' | 'Pending' | string;
  paid_amount?: number;
  remaining_amount?: number;
  due_date?: string;
  notes: string;
  created_at: string;
  items: BillItem[];
  payments?: Payment[];
}

export interface Payment {
  id: string;
  bill: string;
  bill_id?: string;
  bill_number: string;
  customer: string;
  customer_name: string;
  customer_mobile: string;
  amount: number;
  payment_method: string;
  payment_date: string;
  notes?: string;
  created_at: string;
}

export interface DailySummary {
  date: string;
  total_sales: number;
  total_bills: number;
  total_pending: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}
