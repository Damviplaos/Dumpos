
-- อนุญาตให้ anon (ยังไม่ login) อ่านชื่อร้านได้ สำหรับหน้า Login
CREATE POLICY "Public read store settings for login page"
ON store_settings FOR SELECT
TO anon
USING (true);

-- อนุญาตให้ anon อ่าน store_settings ผ่าน RLS
ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;
