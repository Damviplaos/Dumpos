// ประเภทข้อมูลหลักของระบบ POS

export type UserRole = 'super_admin' | 'store_owner' | 'admin' | 'cashier';

// ============ Store (Multi-tenant) ============
export interface Store {
  id: string;
  name: string;
  address: string;
  phone: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============ ระบบยศและสิทธิ์ ============
export type PermissionKey =
  | 'view_dashboard'
  | 'view_reports'
  | 'view_profit'
  | 'manage_products'
  | 'manage_inventory'
  | 'manage_users'
  | 'manage_settings'
  | 'process_sales'
  | 'void_transactions'
  | 'view_transactions'
  | 'view_all_transactions'
  | 'manage_categories'
  | 'view_cost'
  | 'manage_roles'
  | 'view_audit_log'
  | 'view_fraud_alerts'
  | 'issue_warnings';

export type Permissions = Partial<Record<PermissionKey, boolean>>;

export interface Role {
  id: string;
  name: string;
  color: string;
  is_system: boolean;
  permissions: Permissions;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// ============ Audit & Fraud ============
export type AuditSeverity = 'info' | 'warning' | 'critical';
export type FraudSeverity = 'low' | 'medium' | 'high';

export interface AuditLog {
  id: string;
  user_id: string | null;
  username: string | null;
  store_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown>;
  severity: AuditSeverity;
  ip_address: string | null;
  created_at: string;
}

export interface FraudAlert {
  id: string;
  user_id: string | null;
  username: string | null;
  store_id: string | null;
  alert_type: string;
  severity: FraudSeverity;
  description: string;
  details: Record<string, unknown>;
  is_reviewed: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  username: string;
  full_name: string | null;
  email: string | null;
  role: UserRole;
  role_id: string | null;
  store_id: string | null;
  is_active: boolean;
  warning_status: 'normal' | 'yellow_card' | 'red_card';
  created_at: string;
  updated_at: string;
  // joined
  custom_role?: Role | null;
}

export interface StoreSettings {
  id: string;
  store_name: string;
  address: string;
  phone: string;
  tax_rate: number;
  auto_print_receipt: boolean;
  low_stock_threshold: number;
  currency: string;
  telegram_bot_token: string | null;
  telegram_chat_id: string | null;
  max_void_per_day: number;
  logo_url: string | null;
  updated_at: string;
}

export interface WarningRecord {
  id: string;
  user_id: string;
  issued_by: string;
  warning_type: 'yellow_card' | 'red_card';
  reason: string;
  created_at: string;
  // joined
  issuer?: Pick<Profile, 'username' | 'full_name'> | null;
}

export interface SystemSetting {
  id: string;
  key: string;
  value: string | null;
  description: string | null;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  description: string;
  sort_order: number;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  category_id: string | null;
  price: number;
  cost: number;
  stock: number;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // joined
  category?: Category | null;
}

export type PaymentMethod = 'cash' | 'card' | 'qr';
export type TransactionStatus = 'completed' | 'voided' | 'refunded';

export interface Transaction {
  id: string;
  order_number: string;
  cashier_id: string | null;
  subtotal: number;
  tax_amount: number;
  total: number;
  payment_method: PaymentMethod;
  cash_received: number;
  change_amount: number;
  status: TransactionStatus;
  notes: string;
  created_at: string;
  // joined
  cashier?: Profile | null;
  items?: TransactionItem[];
}

export interface TransactionItem {
  id: string;
  transaction_id: string;
  product_id: string | null;
  product_name: string;
  product_sku: string | null;
  quantity: number;
  unit_price: number;
  cost: number;
  subtotal: number;
  created_at: string;
}

export interface InventoryLog {
  id: string;
  product_id: string;
  change_amount: number;
  previous_stock: number;
  new_stock: number;
  reason: 'sale' | 'void' | 'refund' | 'manual_adjust' | 'initial';
  reference_id: string | null;
  created_by: string | null;
  created_at: string;
  product?: Product | null;
  creator?: Profile | null;
}

// ============ Discord-style store badges ============
export interface StoreRole {
  id: string;
  store_id: string;
  name: string;
  color: string;   // hex e.g. "#6366f1"
  emoji: string;
  description: string | null;
  sort_order: number;
  created_at: string;
}

export interface UserBadgeAssignment {
  id: string;
  user_id: string;
  role_id: string;
  assigned_by: string | null;
  assigned_at: string;
  // joined
  store_role?: StoreRole;
}

// ประเภทสำหรับตะกร้าสินค้า POS
export interface CartItem {
  product: Product;
  quantity: number;
  unit_price: number;
  subtotal: number;
}
