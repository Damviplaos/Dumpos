
-- Step 1: Create stores table
CREATE TABLE stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Step 2: Insert a default store (for existing data)
INSERT INTO stores (id, name, address, phone, is_active)
VALUES ('00000000-0000-0000-0000-000000000001', 'ร้านค้าหลัก', '', '', true);

-- Step 3: Add store_id to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES stores(id);
UPDATE profiles SET store_id = '00000000-0000-0000-0000-000000000001' WHERE store_id IS NULL AND role != 'super_admin';

-- Step 4: Add store_id to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES stores(id);
UPDATE products SET store_id = '00000000-0000-0000-0000-000000000001' WHERE store_id IS NULL;
ALTER TABLE products ALTER COLUMN store_id SET NOT NULL;

-- Step 5: Add store_id to categories
ALTER TABLE categories ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES stores(id);
UPDATE categories SET store_id = '00000000-0000-0000-0000-000000000001' WHERE store_id IS NULL;
ALTER TABLE categories ALTER COLUMN store_id SET NOT NULL;

-- Step 6: Add store_id to transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES stores(id);
UPDATE transactions SET store_id = '00000000-0000-0000-0000-000000000001' WHERE store_id IS NULL;
ALTER TABLE transactions ALTER COLUMN store_id SET NOT NULL;

-- Step 7: Add store_id to audit_logs
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES stores(id);
UPDATE audit_logs SET store_id = '00000000-0000-0000-0000-000000000001' WHERE store_id IS NULL;

-- Step 8: Add store_id to fraud_alerts
ALTER TABLE fraud_alerts ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES stores(id);
UPDATE fraud_alerts SET store_id = '00000000-0000-0000-0000-000000000001' WHERE store_id IS NULL;

-- Step 9: Add store_id to inventory_logs
ALTER TABLE inventory_logs ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES stores(id);
UPDATE inventory_logs SET store_id = '00000000-0000-0000-0000-000000000001' WHERE store_id IS NULL;

-- Step 10: Add store_id to roles (custom roles per store)
ALTER TABLE roles ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES stores(id);
UPDATE roles SET store_id = '00000000-0000-0000-0000-000000000001' WHERE store_id IS NULL AND is_system = false;

-- Step 11: Add store_id to store_settings (1 row per store)
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES stores(id) UNIQUE;
UPDATE store_settings SET store_id = '00000000-0000-0000-0000-000000000001' WHERE store_id IS NULL;

-- Step 12: Add store_id to warning_records
ALTER TABLE warning_records ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES stores(id);
UPDATE warning_records SET store_id = '00000000-0000-0000-0000-000000000001' WHERE store_id IS NULL;
