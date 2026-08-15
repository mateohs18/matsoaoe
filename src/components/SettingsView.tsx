import { useState, useEffect } from "react";
import { Save, Loader2, KeyRound, Plus, Trash2, Wallet as WalletIcon, Bot } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Setting, ApiKey, Wallet } from "@/types";

interface SettingsViewProps {
  onSaved: () => void;
}

export function SettingsView({ onSaved }: SettingsViewProps) {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [newWalletName, setNewWalletName] = useState("");
  const [newWalletAddress, setNewWalletAddress] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  useEffect(() => {
    async function load() {
      const [settingsRes, keysRes, walletsRes] = await Promise.all([
        supabase.from("settings").select("*"),
        supabase.from("api_keys").select("*").order("created_at", { ascending: false }),
        supabase.from("wallets").select("*").order("created_at", { ascending: true }),
      ]);
      const settingsMap: Record<string, string> = {};
      (settingsRes.data as Setting[] | null)?.forEach((s) => {
        settingsMap[s.key] = s.value;
      });
      setSettings(settingsMap);
      setApiKeys(keysRes.data ?? []);
      setWallets(walletsRes.data ?? []);
      setLoading(false);
    }
    load();
  }, []);

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const keys = ["credits_per_usd", "discord_bot_token", "discord_app_id", "discord_public_key", "discord_guild_id"];
      for (const k of keys) {
        await supabase.from("settings").upsert({ key: k, value: settings[k] || "" }, { onConflict: "key" });
      }
      for (const w of wallets) {
        await supabase.from("wallets").update({ name: w.name, address: w.address }).eq("id", w.id);
      }
      setSavedMsg(true);
      onSaved();
      setTimeout(() => setSavedMsg(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function addApiKey(e: React.FormEvent) {
    e.preventDefault();
    if (!newKeyName.trim() || !newKeyValue.trim()) return;
    try {
      const { data } = await supabase
        .from("api_keys")
        .insert({ key_name: newKeyName.trim(), key_value: newKeyValue.trim() })
        .select("*")
        .maybeSingle();
      if (data) {
        setApiKeys([...apiKeys, data as ApiKey]);
        setNewKeyName("");
        setNewKeyValue("");
      }
    } catch {
      // ignore
    }
  }

  async function deleteApiKey(id: string) {
    await supabase.from("api_keys").delete().eq("id", id);
    setApiKeys(apiKeys.filter((k) => k.id !== id));
  }

  async function addWallet(e: React.FormEvent) {
    e.preventDefault();
    if (!newWalletName.trim()) return;
    try {
      const { data } = await supabase
        .from("wallets")
        .insert({ name: newWalletName.trim(), address: newWalletAddress.trim() })
        .select("*")
        .maybeSingle();
      if (data) {
        setWallets([...wallets, data as Wallet]);
        setNewWalletName("");
        setNewWalletAddress("");
      }
    } catch {
      // ignore
    }
  }

  async function deleteWallet(id: string) {
    await supabase.from("wallets").delete().eq("id", id);
    setWallets(wallets.filter((w) => w.id !== id));
  }

  function updateWallet(id: string, field: "name" | "address", value: string) {
    setWallets(wallets.map((w) => (w.id === id ? { ...w, [field]: value } : w)));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-slate-600" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-1">Settings</h2>
        <p className="text-slate-400 text-sm">Configure your Discord bot, wallet addresses, exchange rate, and API keys.</p>
      </div>

      <div className="space-y-6">
        {/* Wallet Addresses */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
          <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
            <WalletIcon className="w-4 h-4 text-cyan-400" />
            Receiver Wallet Addresses
          </h3>
          <p className="text-xs text-slate-500 mb-4">
            The bot accepts payments sent to any of these wallets. Add or remove wallets as needed. Each wallet needs a name and its blockchain address.
          </p>

          <div className="space-y-3 mb-5">
            {wallets.map((w) => (
              <div key={w.id} className="flex items-center gap-3 bg-slate-950 border border-slate-800 rounded-xl p-3 group">
                <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center shrink-0">
                  <WalletIcon className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="flex-1 grid sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={w.name}
                    onChange={(e) => updateWallet(w.id, "name", e.target.value)}
                    placeholder="Wallet name"
                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition"
                  />
                  <input
                    type="text"
                    value={w.address}
                    onChange={(e) => updateWallet(w.id, "address", e.target.value)}
                    placeholder="Wallet address"
                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition font-mono sm:col-span-2"
                  />
                </div>
                <button
                  onClick={() => deleteWallet(w.id)}
                  className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition p-1 shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <form onSubmit={addWallet} className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={newWalletName}
              onChange={(e) => setNewWalletName(e.target.value)}
              placeholder="New wallet name"
              className="bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition"
            />
            <input
              type="text"
              value={newWalletAddress}
              onChange={(e) => setNewWalletAddress(e.target.value)}
              placeholder="Wallet address"
              className="bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition font-mono flex-1"
            />
            <button
              type="submit"
              disabled={!newWalletName.trim()}
              className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-2.5 px-4 rounded-xl text-sm transition disabled:opacity-50 shrink-0"
            >
              <Plus className="w-4 h-4" />
              Add Wallet
            </button>
          </form>
        </div>

        {/* Discord Bot + Payment Configuration */}
        <form onSubmit={saveSettings} className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-5">
          <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <Bot className="w-4 h-4 text-cyan-400" />
            Discord Bot Configuration
          </h3>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Bot Token</label>
              <input
                type="password"
                value={settings.discord_bot_token || ""}
                onChange={(e) => setSettings({ ...settings, discord_bot_token: e.target.value })}
                placeholder="Discord bot token"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Application ID</label>
              <input
                type="text"
                value={settings.discord_app_id || ""}
                onChange={(e) => setSettings({ ...settings, discord_app_id: e.target.value })}
                placeholder="Discord application ID"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Public Key</label>
              <input
                type="text"
                value={settings.discord_public_key || ""}
                onChange={(e) => setSettings({ ...settings, discord_public_key: e.target.value })}
                placeholder="Discord public key"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Server (Guild) ID</label>
              <input
                type="text"
                value={settings.discord_guild_id || ""}
                onChange={(e) => setSettings({ ...settings, discord_guild_id: e.target.value })}
                placeholder="Discord server ID (optional)"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition font-mono"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Credits per USD</label>
                <input
                  type="number"
                  step="0.01"
                  value={settings.credits_per_usd || "1"}
                  onChange={(e) => setSettings({ ...settings, credits_per_usd: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500 transition"
                />
                <p className="text-xs text-slate-500 mt-1.5">Default: 1 (1 USD = 1 credit).</p>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold py-3 rounded-xl transition shadow-lg shadow-cyan-500/20 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            {savedMsg ? "Saved!" : "Save Settings"}
          </button>
        </form>

        {/* Blockchain API Keys */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
          <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-cyan-400" />
            Blockchain API Keys
          </h3>

          <form onSubmit={addApiKey} className="space-y-3 mb-5">
            <div className="grid sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="Key name (e.g. etherscan, bscscan)"
                className="bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition"
              />
              <input
                type="text"
                value={newKeyValue}
                onChange={(e) => setNewKeyValue(e.target.value)}
                placeholder="API key value"
                className="bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={!newKeyName.trim() || !newKeyValue.trim()}
              className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-2.5 px-4 rounded-xl text-sm transition disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Add API Key
            </button>
          </form>

          {apiKeys.length > 0 ? (
            <div className="space-y-2">
              {apiKeys.map((key) => (
                <div key={key.id} className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 group">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-200">{key.key_name}</p>
                    <p className="text-xs text-slate-500 font-mono">
                      {key.key_value.slice(0, 8)}••••••••{key.key_value.slice(-4)}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteApiKey(key.id)}
                    className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 text-center py-4">
              No API keys added yet. TRON works without an API key. Ethereum and BSC need Etherscan/BscScan API keys.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
