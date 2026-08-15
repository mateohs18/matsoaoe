/*
# Create wallets table for multiple named receiver addresses

1. New Tables
- `wallets`
  - `id` (uuid, primary key)
  - `name` (text, not null) — human-readable label e.g. "WOLFSKIN", "Kitson Kit"
  - `address` (text, not null) — blockchain wallet address where payments should arrive
  - `created_at` (timestamptz)

2. Security
- Enable RLS on `wallets`.
- Allow anon + authenticated CRUD (single-tenant admin dashboard, no sign-in).

3. Important Notes
- Replaces the single `receiver_address` setting with a flexible multi-wallet system.
- The edge function checks incoming payments against ALL wallet addresses in this table.
- Pre-seeds two wallets: WOLFSKIN and Kitson Kit (with empty addresses to be filled in Settings).
*/

CREATE TABLE IF NOT EXISTS wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_wallets" ON wallets;
CREATE POLICY "anon_select_wallets" ON wallets FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_wallets" ON wallets;
CREATE POLICY "anon_insert_wallets" ON wallets FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_wallets" ON wallets;
CREATE POLICY "anon_update_wallets" ON wallets FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_wallets" ON wallets;
CREATE POLICY "anon_delete_wallets" ON wallets FOR DELETE
  TO anon, authenticated USING (true);

-- Pre-seed the two requested wallets
INSERT INTO wallets (name, address) VALUES
  ('WOLFSKIN', ''),
  ('Kitson Kit', '')
ON CONFLICT DO NOTHING;
