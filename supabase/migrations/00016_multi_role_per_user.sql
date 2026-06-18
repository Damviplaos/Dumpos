
-- ================================================
-- user_permission_roles: many-to-many users ↔ roles
-- Allows a user to hold multiple permission roles
-- ================================================
CREATE TABLE IF NOT EXISTS user_permission_roles (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_id     uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_upr_user ON user_permission_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_upr_role ON user_permission_roles(role_id);

-- RLS
ALTER TABLE user_permission_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "upr_select" ON user_permission_roles
  FOR SELECT TO authenticated
  USING (is_super_admin() OR user_id = auth.uid() OR is_store_owner_or_super());

CREATE POLICY "upr_insert" ON user_permission_roles
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR is_store_owner_or_super());

CREATE POLICY "upr_delete" ON user_permission_roles
  FOR DELETE TO authenticated
  USING (is_super_admin() OR is_store_owner_or_super());

-- Backfill: copy existing role_id assignments into the new junction table
INSERT INTO user_permission_roles (user_id, role_id)
SELECT id, role_id
FROM profiles
WHERE role_id IS NOT NULL
ON CONFLICT (user_id, role_id) DO NOTHING;
