/*
# Create crypto payment verification tables

1. New Tables
- `users`
  - `id` (uuid, primary key)
  - `username` (text, unique, not null) — identifier used in /addcredits commands
  - `credits` (integer, default 0) — current credit balance
  - `created_at` (timestamptz)
- `transactions`
  - `id` (uuid, primary key)
  - `tx_hash` (text, unique, not null) — the transaction ID from Binance/crypto app
  - `user_id` (uuid, references users) — which user gets credits
  - `amount_usd` (numeric, not null) — USD value of the payment
  - `credits_added` (integer, not null) — credits granted (1 USD = 1 credit)
  - `status` (text, default 'pending') — pending | confirmed | failed
  - `network` (text) — blockchain network (e.g. "TRON", "Ethereum")
  - `sender_address` (text) — sender wallet address
  - `receiver_address` (text) — receiver wallet address
  - `confirmed_at` (timestamptz) — when payment was confirmed on-chain
  - `created_at` (timestamptz)
- `settings`
  - `id` (uuid, primary key)
  - `key` (text, unique, not null)
  - `value` (text, not null)
  - `created_at` (timestamptz)
- `api_keys`
  - `id` (uuid, primary key)
  - `key_name` (text, unique, not null) — identifier for the API key
  - `key_value` (text, not null) — the actual API key value
  - `created_at` (timestamptz)

2. Security
- Enable RLS on all tables.
- Allow anon + authenticated CRUD because this is a single-tenant admin dashboard (no sign-in).

3. Important Notes
- This is a single-tenant admin tool — no auth screen, so anon must be able to read/write.
- `transactions.tx_hash` has a unique constraint to prevent double-crediting from the same payment.
- `settings` stores configuration like the receiver wallet address and USD-to-credit ratio.
- `api_keys` stores blockchain explorer API keys for transaction verification.
*/

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  credits integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_users" ON users;
CREATE POLICY "anon_select_users" ON users FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_users" ON users;
CREATE POLICY "anon_insert_users" ON users FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_users" ON users;
CREATE POLICY "anon_update_users" ON users FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_users" ON users;
CREATE POLICY "anon_delete_users" ON users FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tx_hash text UNIQUE NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  amount_usd numeric(18,2) NOT NULL,
  credits_added integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  network text,
  sender_address text,
  receiver_address text,
  confirmed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_transactions" ON transactions;
CREATE POLICY "anon_select_transactions" ON transactions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_transactions" ON transactions;
CREATE POLICY "anon_insert_transactions" ON transactions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_transactions" ON transactions;
CREATE POLICY "anon_update_transactions" ON transactions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_transactions" ON transactions;
CREATE POLICY "anon_delete_transactions" ON transactions FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_settings" ON settings;
CREATE POLICY "anon_select_settings" ON settings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_settings" ON settings;
CREATE POLICY "anon_insert_settings" ON settings FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_settings" ON settings;
CREATE POLICY "anon_update_settings" ON settings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_settings" ON settings;
CREATE POLICY "anon_delete_settings" ON settings FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_name text UNIQUE NOT NULL,
  key_value text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_api_keys" ON api_keys;
CREATE POLICY "anon_select_api_keys" ON api_keys FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_api_keys" ON api_keys;
CREATE POLICY "anon_insert_api_keys" ON api_keys FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_api_keys" ON api_keys;
CREATE POLICY "anon_update_api_keys" ON api_keys FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_api_keys" ON api_keys;
CREATE POLICY "anon_delete_api_keys" ON api_keys FOR DELETE
  TO anon, authenticated USING (true);

-- Insert default settings
INSERT INTO settings (key, value) VALUES
  ('receiver_address', ''),
  ('usd_per_credit', '1'),
  ('credits_per_usd', '1')
ON CONFLICT (key) DO NOTHING;
