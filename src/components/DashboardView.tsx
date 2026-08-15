import { useState, useEffect } from "react";
import { Loader2, CheckCircle2, XCircle, Zap, Coins, Users as UsersIcon, TrendingUp, Copy, Check, ExternalLink, Bot } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { User, Transaction, Setting } from "@/types";

interface DashboardViewProps {
  users: User[];
  transactions: Transaction[];
  loading: boolean;
  setView: (view: "settings") => void;
}

export function DashboardView({ users, transactions, loading, setView }: DashboardViewProps) {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registerResult, setRegisterResult] = useState<{ success: boolean; message: string } | null>(null);

  const botUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/discord-bot`;

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("settings").select("*");
      const map: Record<string, string> = {};
      (data as Setting[] | null)?.forEach((s) => { map[s.key] = s.value; });
      setSettings(map);
    }
    load();
  }, []);

  const confirmedTxs = transactions.filter((t) => t.status === "confirmed");
  const totalCredits = users.reduce((sum, u) => sum + (u.credits || 0), 0);
  const totalUsd = confirmedTxs.reduce((sum, t) => sum + (t.amount_usd || 0), 0);

  const isConfigured = settings.discord_bot_token && settings.discord_app_id && settings.discord_public_key;

  function copyUrl() {
    navigator.clipboard.writeText(botUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function registerCommands() {
    setRegistering(true);
    setRegisterResult(null);
    try {
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const response = await fetch(`${botUrl}/setup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseKey}`,
          apikey: supabaseKey,
        },
        body: JSON.stringify({
          botToken: settings.discord_bot_token,
          appId: settings.discord_app_id,
          guildId: settings.discord_guild_id || "",
        }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setRegisterResult({ success: true, message: "Slash commands registered! The bot is now live in your Discord server." });
      } else {
        setRegisterResult({ success: false, message: data.detail || data.error || "Failed to register commands. Check your bot token and app ID." });
      }
    } catch {
      setRegisterResult({ success: false, message: "Network error. Please try again." });
    } finally {
      setRegistering(false);
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-1">Dashboard</h2>
        <p className="text-slate-400 text-sm">Monitor your Discord bot and payment verification activity.</p>
      </div>

      {/* Stats */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={UsersIcon} label="Total Users" value={loading ? "—" : String(users.length)} color="cyan" />
        <StatCard icon={Coins} label="Total Credits" value={loading ? "—" : String(totalCredits)} color="amber" />
        <StatCard icon={TrendingUp} label="Total Volume" value={loading ? "—" : `$${totalUsd.toFixed(2)}`} color="emerald" />
        <StatCard icon={CheckCircle2} label="Confirmed" value={loading ? "—" : String(confirmedTxs.length)} color="blue" />
      </div>

      {/* Bot status */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <Bot className="w-4 h-4 text-cyan-400" />
            Discord Bot Status
          </h3>
          {isConfigured ? (
            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Configured
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-1">
              <XCircle className="w-3.5 h-3.5" />
              Not configured
            </span>
          )}
        </div>

        {isConfigured ? (
          <div className="space-y-4">
            <div>
              <p className="text-xs text-slate-500 mb-1.5">Interactions Endpoint URL (paste this in Discord Developer Portal):</p>
              <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5">
                <code className="text-xs text-cyan-400 font-mono flex-1 truncate">{botUrl}</code>
                <button onClick={copyUrl} className="text-slate-400 hover:text-white transition shrink-0">
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              onClick={registerCommands}
              disabled={registering}
              className="flex items-center gap-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 text-cyan-400 font-medium py-2.5 px-4 rounded-xl text-sm transition disabled:opacity-50"
            >
              {registering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Register Slash Commands
            </button>

            {registerResult && (
              <div className={`rounded-lg p-3 text-sm ${registerResult.success ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                {registerResult.message}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-sm text-slate-400 mb-4">Configure your Discord bot credentials to get started.</p>
            <button
              onClick={() => setView("settings")}
              className="inline-flex items-center gap-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 text-cyan-400 font-medium py-2.5 px-5 rounded-xl text-sm transition"
            >
              Go to Settings
            </button>
          </div>
        )}
      </div>

      {/* Setup guide */}
      {!isConfigured && (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Setup Guide — Get your bot running in 5 steps</h3>
          <ol className="space-y-4">
            <Step number={1} title="Create a Discord Application">
              Go to the{" "}
              <a href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline inline-flex items-center gap-0.5">
                Discord Developer Portal <ExternalLink className="w-3 h-3" />
              </a>
              , click "New Application", and give it a name.
            </Step>
            <Step number={2} title="Create a Bot">
              In your application, go to the "Bot" tab, click "Add Bot", and copy the <strong className="text-slate-200">Bot Token</strong>.
            </Step>
            <Step number={3} title="Copy your credentials">
              From the "General Information" tab, copy the <strong className="text-slate-200">Application ID</strong> and <strong className="text-slate-200">Public Key</strong>.
              From the "Bot" tab, copy the <strong className="text-slate-200">Bot Token</strong>.
            </Step>
            <Step number={4} title="Enter credentials in Settings">
              Paste all three values (plus your Discord server ID) in the Settings page, then come back here and click "Register Slash Commands".
            </Step>
            <Step number={5} title="Set the Interactions Endpoint URL">
              In the Discord Developer Portal under "General Information", paste the Interactions Endpoint URL shown above. Then invite the bot to your server.
            </Step>
          </ol>
        </div>
      )}

      {/* Recent transactions preview */}
      {transactions.length > 0 && (
        <div className="mt-6 bg-slate-900 rounded-2xl border border-slate-800 p-6">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Recent Transactions</h3>
          <div className="space-y-2">
            {transactions.slice(0, 5).map((tx) => (
              <div key={tx.id} className="flex items-center justify-between gap-3 py-2 border-b border-slate-800 last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  <StatusDot status={tx.status} />
                  <span className="text-sm text-white truncate">{tx.discord_username || tx.username || "Unknown"}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-slate-500">{tx.network}</span>
                  <span className="text-sm font-semibold text-cyan-400">+{tx.credits_added}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: typeof Zap; label: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    cyan: "text-cyan-400 bg-cyan-500/10",
    amber: "text-amber-400 bg-amber-500/10",
    emerald: "text-emerald-400 bg-emerald-500/10",
    blue: "text-blue-400 bg-blue-500/10",
  };
  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${colors[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-cyan-500/10 text-cyan-400 text-xs font-bold flex items-center justify-center">
        {number}
      </span>
      <div>
        <p className="text-sm font-medium text-slate-200 mb-0.5">{title}</p>
        <p className="text-sm text-slate-400 leading-relaxed">{children}</p>
      </div>
    </li>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    confirmed: "bg-emerald-400",
    failed: "bg-red-400",
    pending: "bg-amber-400",
  };
  return <span className={`w-2 h-2 rounded-full shrink-0 ${colors[status] || "bg-slate-600"}`} />;
}
