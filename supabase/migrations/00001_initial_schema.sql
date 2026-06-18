
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- User roles enum
CREATE TYPE public.user_role AS ENUM ('admin', 'cashier');

-- Profiles table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  full_name text,
  email text,
  role public.user_role NOT NULL DEFAULT 'cashier',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Store settings table
CREATE TABLE public.store_settings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_name text NOT NULL DEFAULT 'ร้านของฉัน',
  address text DEFAULT '',
  phone text DEFAULT '',
  tax_rate numeric(5,2) NOT NULL DEFAULT 7.00,
  auto_print_receipt boolean NOT NULL DEFAULT false,
  low_stock_threshold integer NOT NULL DEFAULT 10,
  currency text NOT NULL DEFAULT 'THB',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Insert default store settings
INSERT INTO public.store_settings (store_name, tax_rate) VALUES ('ร้านของฉัน', 7.00);

-- Categories table
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL UNIQUE,
  description text DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Products table
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  sku text UNIQUE,
  barcode text UNIQUE,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  price numeric(12,2) NOT NULL DEFAULT 0,
  cost numeric(12,2) NOT NULL DEFAULT 0,
  stock integer NOT NULL DEFAULT 0,
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Transactions table
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number text UNIQUE NOT NULL,
  cashier_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  tax_amount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL CHECK (payment_method IN ('cash', 'card', 'qr')),
  cash_received numeric(12,2) DEFAULT 0,
  change_amount numeric(12,2) DEFAULT 0,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'voided', 'refunded')),
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Transaction items table
CREATE TABLE public.transaction_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  product_sku text,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  cost numeric(12,2) NOT NULL DEFAULT 0,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Inventory logs table
CREATE TABLE public.inventory_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  change_amount integer NOT NULL,
  previous_stock integer NOT NULL,
  new_stock integer NOT NULL,
  reason text NOT NULL CHECK (reason IN ('sale', 'void', 'refund', 'manual_adjust', 'initial')),
  reference_id uuid,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Function: auto-generate order number
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  today text;
  seq integer;
  order_num text;
BEGIN
  today := TO_CHAR(NOW(), 'YYYYMMDD');
  SELECT COUNT(*) + 1 INTO seq
  FROM public.transactions
  WHERE created_at::date = CURRENT_DATE;
  order_num := 'ORD-' || today || '-' || LPAD(seq::text, 4, '0');
  RETURN order_num;
END;
$$;

-- Trigger to auto-set order number before insert
CREATE OR REPLACE FUNCTION set_order_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := generate_order_number();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_order_number
  BEFORE INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION set_order_number();

-- Function: handle new user (sync to profiles)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'cashier'::public.user_role)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Function: update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: Enable on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;

-- Helper function to get user role
CREATE OR REPLACE FUNCTION get_user_role(uid uuid)
RETURNS public.user_role
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = uid;
$$;

-- Profiles policies
CREATE POLICY "Admins full access on profiles" ON public.profiles
  FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin'::public.user_role);

CREATE POLICY "Users view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id)
  WITH CHECK (role IS NOT DISTINCT FROM get_user_role(auth.uid()));

-- Store settings policies (read all authenticated, write admin only)
CREATE POLICY "Authenticated read store settings" ON public.store_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin manage store settings" ON public.store_settings
  FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin'::public.user_role);

-- Categories policies
CREATE POLICY "Authenticated read categories" ON public.categories
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin manage categories" ON public.categories
  FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin'::public.user_role);

-- Products policies
CREATE POLICY "Authenticated read products" ON public.products
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin manage products" ON public.products
  FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin'::public.user_role);

-- Transactions policies
CREATE POLICY "Authenticated read transactions" ON public.transactions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated insert transactions" ON public.transactions
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Admin manage transactions" ON public.transactions
  FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin'::public.user_role);

-- Transaction items policies
CREATE POLICY "Authenticated read transaction items" ON public.transaction_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated insert transaction items" ON public.transaction_items
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Admin manage transaction items" ON public.transaction_items
  FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin'::public.user_role);

-- Inventory logs policies
CREATE POLICY "Authenticated read inventory logs" ON public.inventory_logs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated insert inventory logs" ON public.inventory_logs
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Admin manage inventory logs" ON public.inventory_logs
  FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin'::public.user_role);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_logs;
