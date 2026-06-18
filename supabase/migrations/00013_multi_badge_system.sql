
-- ================================================
-- Store custom role/badge definitions (Discord-style)
-- ================================================
CREATE TABLE IF NOT EXISTS store_roles (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id    uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name        text NOT NULL,
  color       text NOT NULL DEFAULT '#6366f1',  -- hex color
  emoji       text NOT NULL DEFAULT '🏷️',
  description text,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, name)
);

-- ================================================
-- Junction: users can hold many badges
-- ================================================
CREATE TABLE IF NOT EXISTS user_role_assignments (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_id    uuid NOT NULL REFERENCES store_roles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_store_roles_store ON store_roles(store_id);
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_user ON user_role_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_role ON user_role_assignments(role_id);

-- ================================================
-- RLS: store_roles
-- ================================================
ALTER TABLE store_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_roles_select" ON store_roles
  FOR SELECT USING (is_super_admin() OR store_id = get_my_store_id());

CREATE POLICY "store_roles_insert" ON store_roles
  FOR INSERT WITH CHECK (is_super_admin() OR (store_id = get_my_store_id() AND is_store_owner_or_super()));

CREATE POLICY "store_roles_update" ON store_roles
  FOR UPDATE USING (is_super_admin() OR (store_id = get_my_store_id() AND is_store_owner_or_super()));

CREATE POLICY "store_roles_delete" ON store_roles
  FOR DELETE USING (is_super_admin() OR (store_id = get_my_store_id() AND is_store_owner_or_super()));

-- ================================================
-- RLS: user_role_assignments
-- ================================================
ALTER TABLE user_role_assignments ENABLE ROW LEVEL SECURITY;

-- Select: anyone in the same store can see assignments (needed for UsersPage display)
CREATE POLICY "ura_select" ON user_role_assignments
  FOR SELECT USING (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM store_roles sr
      WHERE sr.id = user_role_assignments.role_id
        AND sr.store_id = get_my_store_id()
    )
  );

-- Insert/Delete: only admin/store_owner
CREATE POLICY "ura_insert" ON user_role_assignments
  FOR INSERT WITH CHECK (
    is_super_admin() OR (
      is_store_owner_or_super()
      AND EXISTS (
        SELECT 1 FROM store_roles sr
        WHERE sr.id = user_role_assignments.role_id
          AND sr.store_id = get_my_store_id()
      )
    )
  );

CREATE POLICY "ura_delete" ON user_role_assignments
  FOR DELETE USING (
    is_super_admin() OR (
      is_store_owner_or_super()
      AND EXISTS (
        SELECT 1 FROM store_roles sr
        WHERE sr.id = user_role_assignments.role_id
          AND sr.store_id = get_my_store_id()
      )
    )
  );
