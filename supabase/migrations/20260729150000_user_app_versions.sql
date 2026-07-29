-- Sledování verzí aplikace u jednotlivých uživatelů
-- Každý uživatel při startu zapíše svou verzi, admin vidí přehled

CREATE TABLE IF NOT EXISTS user_app_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  device_info TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Index pro rychlé vyhledávání
CREATE INDEX IF NOT EXISTS idx_user_app_versions_version ON user_app_versions(version);
CREATE INDEX IF NOT EXISTS idx_user_app_versions_last_seen ON user_app_versions(last_seen_at);

-- RLS
ALTER TABLE user_app_versions ENABLE ROW LEVEL SECURITY;

-- Každý uživatel může číst a zapisovat jen své vlastní verze
CREATE POLICY "users_manage_own_version"
  ON user_app_versions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admin může číst všechny verze
CREATE POLICY "admin_read_all_versions"
  ON user_app_versions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
