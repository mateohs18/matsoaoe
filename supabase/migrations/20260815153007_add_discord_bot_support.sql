/*
# Add Discord bot support columns

1. Modified Tables
- `users`: add `discord_user_id` (text, nullable) and `discord_username` (text, nullable)
  so the bot can link Discord users to credit accounts automatically.
- `transactions`: add `discord_user_id` (text, nullable) and `discord_username` (text, nullable)
  to record which Discord user triggered each verification.

2. New default settings
- `discord_bot_token` — Discord application bot token (used by edge function to register slash commands)
- `discord_app_id` — Discord application ID
- `discord_public_key` — Discord application public key (for signature verification)
- `discord_guild_id` — Discord server ID where slash commands are registered

3. Security
- No new tables. Existing RLS policies on `users`, `transactions`, and `settings` already
  allow anon + authenticated CRUD (single-tenant admin dashboard, no sign-in).
- Discord secrets are stored in the `settings` table. The edge function reads them using
  the service role key which bypasses RLS. The frontend can set them via anon key.
*/

ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_user_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_username text;

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS discord_user_id text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS discord_username text;

INSERT INTO settings (key, value) VALUES
  ('discord_bot_token', ''),
  ('discord_app_id', ''),
  ('discord_public_key', ''),
  ('discord_guild_id', '')
ON CONFLICT (key) DO NOTHING;
