export interface User {
  id: string;
  username: string;
  credits: number;
  discord_user_id: string | null;
  discord_username: string | null;
  created_at: string;
}

export interface Transaction {
  id: string;
  tx_hash: string;
  user_id: string | null;
  username: string | null;
  discord_user_id: string | null;
  discord_username: string | null;
  amount_usd: number;
  credits_added: number;
  status: "pending" | "confirmed" | "failed";
  network: string | null;
  sender_address: string | null;
  receiver_address: string | null;
  confirmed_at: string | null;
  created_at: string;
}

export interface Setting {
  id: string;
  key: string;
  value: string;
  created_at: string;
}

export interface ApiKey {
  id: string;
  key_name: string;
  key_value: string;
  created_at: string;
}

export interface Wallet {
  id: string;
  name: string;
  address: string;
  created_at: string;
}

export type View = "dashboard" | "verify" | "users" | "history" | "settings";
