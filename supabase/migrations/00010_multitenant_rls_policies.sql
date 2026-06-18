
-- Enable RLS on stores table
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;

-- Helper: get current user's store_id
CREATE OR REPLACE FUNCTION get_my_store_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT store_id FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- Helper: check if current user is super_admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin');
$$;

-- Helper: check if current user is store_owner or super_admin
CREATE OR REPLACE FUNCTION is_store_owner_or_super()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','store_owner'));
$$;

-- Stores policies: super_admin sees all, others see own store
CREATE POLICY "stores_select" ON stores FOR SELECT TO authenticated
  USING (is_super_admin() OR id = get_my_store_id());

CREATE POLICY "stores_insert" ON stores FOR INSERT TO authenticated
  WITH CHECK (is_super_admin());

CREATE POLICY "stores_update" ON stores FOR UPDATE TO authenticated
  USING (is_super_admin());

-- Drop all old RLS policies on products, categories, transactions, etc. then recreate
-- Products
DROP POLICY IF EXISTS "products_select" ON products;
DROP POLICY IF EXISTS "products_insert" ON products;
DROP POLICY IF EXISTS "products_update" ON products;
DROP POLICY IF EXISTS "products_delete" ON products;

CREATE POLICY "products_select" ON products FOR SELECT TO authenticated
  USING (is_super_admin() OR store_id = get_my_store_id());
CREATE POLICY "products_insert" ON products FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR store_id = get_my_store_id());
CREATE POLICY "products_update" ON products FOR UPDATE TO authenticated
  USING (is_super_admin() OR store_id = get_my_store_id());
CREATE POLICY "products_delete" ON products FOR DELETE TO authenticated
  USING (is_super_admin() OR store_id = get_my_store_id());

-- Categories
DROP POLICY IF EXISTS "categories_select" ON categories;
DROP POLICY IF EXISTS "categories_insert" ON categories;
DROP POLICY IF EXISTS "categories_update" ON categories;
DROP POLICY IF EXISTS "categories_delete" ON categories;

CREATE POLICY "categories_select" ON categories FOR SELECT TO authenticated
  USING (is_super_admin() OR store_id = get_my_store_id());
CREATE POLICY "categories_insert" ON categories FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR store_id = get_my_store_id());
CREATE POLICY "categories_update" ON categories FOR UPDATE TO authenticated
  USING (is_super_admin() OR store_id = get_my_store_id());
CREATE POLICY "categories_delete" ON categories FOR DELETE TO authenticated
  USING (is_super_admin() OR store_id = get_my_store_id());

-- Transactions
DROP POLICY IF EXISTS "transactions_select" ON transactions;
DROP POLICY IF EXISTS "transactions_insert" ON transactions;
DROP POLICY IF EXISTS "transactions_update" ON transactions;

CREATE POLICY "transactions_select" ON transactions FOR SELECT TO authenticated
  USING (is_super_admin() OR store_id = get_my_store_id());
CREATE POLICY "transactions_insert" ON transactions FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR store_id = get_my_store_id());
CREATE POLICY "transactions_update" ON transactions FOR UPDATE TO authenticated
  USING (is_super_admin() OR store_id = get_my_store_id());

-- Transaction items
DROP POLICY IF EXISTS "transaction_items_select" ON transaction_items;
DROP POLICY IF EXISTS "transaction_items_insert" ON transaction_items;

CREATE POLICY "transaction_items_select" ON transaction_items FOR SELECT TO authenticated
  USING (
    is_super_admin() OR
    EXISTS (SELECT 1 FROM transactions t WHERE t.id = transaction_id AND t.store_id = get_my_store_id())
  );
CREATE POLICY "transaction_items_insert" ON transaction_items FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin() OR
    EXISTS (SELECT 1 FROM transactions t WHERE t.id = transaction_id AND t.store_id = get_my_store_id())
  );

-- Audit logs
DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert" ON audit_logs;

CREATE POLICY "audit_logs_select" ON audit_logs FOR SELECT TO authenticated
  USING (is_super_admin() OR store_id = get_my_store_id());
CREATE POLICY "audit_logs_insert" ON audit_logs FOR INSERT TO authenticated
  WITH CHECK (true);

-- Fraud alerts
DROP POLICY IF EXISTS "fraud_alerts_select" ON fraud_alerts;
DROP POLICY IF EXISTS "fraud_alerts_insert" ON fraud_alerts;
DROP POLICY IF EXISTS "fraud_alerts_update" ON fraud_alerts;

CREATE POLICY "fraud_alerts_select" ON fraud_alerts FOR SELECT TO authenticated
  USING (is_super_admin() OR store_id = get_my_store_id());
CREATE POLICY "fraud_alerts_insert" ON fraud_alerts FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY "fraud_alerts_update" ON fraud_alerts FOR UPDATE TO authenticated
  USING (is_super_admin() OR store_id = get_my_store_id());

-- Inventory logs
DROP POLICY IF EXISTS "inventory_logs_select" ON inventory_logs;
DROP POLICY IF EXISTS "inventory_logs_insert" ON inventory_logs;

CREATE POLICY "inventory_logs_select" ON inventory_logs FOR SELECT TO authenticated
  USING (is_super_admin() OR store_id = get_my_store_id());
CREATE POLICY "inventory_logs_insert" ON inventory_logs FOR INSERT TO authenticated
  WITH CHECK (true);

-- Roles (custom roles per store)
DROP POLICY IF EXISTS "roles_select" ON roles;
DROP POLICY IF EXISTS "roles_insert" ON roles;
DROP POLICY IF EXISTS "roles_update" ON roles;
DROP POLICY IF EXISTS "roles_delete" ON roles;

CREATE POLICY "roles_select" ON roles FOR SELECT TO authenticated
  USING (is_super_admin() OR is_system = true OR store_id = get_my_store_id());
CREATE POLICY "roles_insert" ON roles FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR store_id = get_my_store_id());
CREATE POLICY "roles_update" ON roles FOR UPDATE TO authenticated
  USING (is_super_admin() OR store_id = get_my_store_id());
CREATE POLICY "roles_delete" ON roles FOR DELETE TO authenticated
  USING (is_super_admin() OR (is_system = false AND store_id = get_my_store_id()));

-- Store settings
DROP POLICY IF EXISTS "store_settings_select" ON store_settings;
DROP POLICY IF EXISTS "store_settings_insert" ON store_settings;
DROP POLICY IF EXISTS "store_settings_update" ON store_settings;

CREATE POLICY "store_settings_select" ON store_settings FOR SELECT TO authenticated
  USING (is_super_admin() OR store_id = get_my_store_id());
CREATE POLICY "store_settings_insert" ON store_settings FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR store_id = get_my_store_id());
CREATE POLICY "store_settings_update" ON store_settings FOR UPDATE TO authenticated
  USING (is_super_admin() OR store_id = get_my_store_id());

-- Profiles (users see own store, super_admin sees all)
DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_insert" ON profiles;
DROP POLICY IF EXISTS "profiles_update" ON profiles;

CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR id = auth.uid()
    OR (store_id IS NOT NULL AND store_id = get_my_store_id())
  );
CREATE POLICY "profiles_insert" ON profiles FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE TO authenticated
  USING (
    is_super_admin()
    OR id = auth.uid()
    OR (store_id IS NOT NULL AND store_id = get_my_store_id() AND is_store_owner_or_super())
  );

-- Warning records
DROP POLICY IF EXISTS "warning_records_select" ON warning_records;
DROP POLICY IF EXISTS "warning_records_insert" ON warning_records;

CREATE POLICY "warning_records_select" ON warning_records FOR SELECT TO authenticated
  USING (is_super_admin() OR store_id = get_my_store_id());
CREATE POLICY "warning_records_insert" ON warning_records FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR store_id = get_my_store_id());
