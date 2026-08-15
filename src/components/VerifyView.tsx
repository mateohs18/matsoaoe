import { useState } from "react";
import { ShieldCheck, Loader2, CheckCircle2, XCircle, AlertCircle, ArrowRight, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface VerifyViewProps {
  onVerified: () => void;
}

interface VerifyResult {
  success?: boolean;
  message?: string;
  error?: string;
  txData?: {
    hash: string;
    amount: number;
    tokenSymbol: string;
    from: string;
    to: string;
    network: string;
    status: string;
    usdValue: number;
    confirmations: number;
  };
  usdValue?: number;
  creditsAdded?: number;
  user?: { username: string; credits: number };
}

export function VerifyView({ onVerified }: VerifyViewProps) {
  const [txHash, setTxHash] = useState("");
  const [username, setUsername] = useState("");
  const [network, setNetwork] = useState("auto");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!txHash.trim() || !username.trim()) return;

    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const response = await fetch(`${supabaseUrl}/functions/v1/discord-bot/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseKey}`,
          apikey: supabaseKey,
        },
        body: JSON.stringify({
          txHash: txHash.trim(),
          username: username.trim(),
          network: network === "auto" ? undefined : network,
        }),
      });

      const data: VerifyResult = await response.json();

      if (!response.ok) {
        if (response.status === 202) {
          setResult(data);
        } else {
          setError(data.error || "Verification failed");
          if (data.txData) setResult(data);
        }
      } else {
        setResult(data);
        setTxHash("");
        onVerified();
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-1">Verify Payment</h2>
        <p className="text-slate-400 text-sm">
          Manually verify a transaction ID from Binance or any crypto app. In Discord, users can use <code className="text-cyan-400 bg-slate-800 px-1.5 py-0.5 rounded text-xs">/verify</code> instead.
        </p>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <form onSubmit={handleVerify} className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Transaction ID (TX Hash)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={txHash}
                  onChange={(e) => setTxHash(e.target.value)}
                  placeholder="e.g. TXYZ1234... or 0xabc123..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition font-mono"
                />
              </div>
              <p className="text-xs text-slate-500 mt-1.5">
                Find this in your crypto app under transaction details or history.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="The user who should receive credits"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Network (optional)
              </label>
              <select
                value={network}
                onChange={(e) => setNetwork(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition"
              >
                <option value="auto">Auto-detect</option>
                <option value="TRON">TRON (TRC20)</option>
                <option value="Ethereum">Ethereum (ERC20)</option>
                <option value="BSC">BSC (BEP20)</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={loading || !txHash.trim() || !username.trim()}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all duration-200 shadow-lg shadow-cyan-500/20"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Verifying on blockchain...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-5 h-5" />
                  Verify & Add Credits
                </>
              )}
            </button>
          </form>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
            <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-cyan-400" />
              How it works
            </h3>
            <ol className="space-y-4">
              {[
                "Paste the transaction ID from your crypto app",
                "Enter the username that should receive credits",
                "The bot checks the blockchain to confirm the payment",
                "If confirmed, credits are added automatically (1 USD = 1 credit)",
                "In Discord, users run /verify and get credits instantly",
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-500/10 text-cyan-400 text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="text-sm text-slate-400 leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
            <div className="mt-6 pt-4 border-t border-slate-800">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Exchange rate</span>
                <span className="text-cyan-400 font-semibold">1 USD = 1 Credit</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {(result || error) && (
        <div className="mt-6">
          {error && !result && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5 flex items-start gap-3">
              <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-400">Verification Failed</p>
                <p className="text-sm text-slate-400 mt-1">{error}</p>
              </div>
            </div>
          )}

          {result?.success && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6">
              <div className="flex items-start gap-3 mb-4">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-base font-semibold text-emerald-400">Payment Confirmed</p>
                  <p className="text-sm text-slate-400 mt-1">{result.message}</p>
                </div>
              </div>
              {result.txData && (
                <div className="grid sm:grid-cols-2 gap-4 mt-4">
                  <ResultRow label="Amount" value={`${result.txData.amount} ${result.txData.tokenSymbol}`} />
                  <ResultRow label="USD Value" value={`$${(result.usdValue ?? 0).toFixed(2)}`} />
                  <ResultRow label="Credits Added" value={`+${result.creditsAdded}`} highlight />
                  <ResultRow label="Network" value={result.txData.network} />
                  <ResultRow label="From" value={shortenAddr(result.txData.from)} mono />
                  <ResultRow label="To" value={shortenAddr(result.txData.to)} mono />
                  <ResultRow label="New Balance" value={`${result.user?.credits ?? 0} credits`} highlight />
                  <ResultRow label="Status" value="Confirmed" />
                </div>
              )}
            </div>
          )}

          {result && !result.success && result.txData && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-400">Transaction Found — Action Needed</p>
                <p className="text-sm text-slate-400 mt-1">{result.error}</p>
              </div>
            </div>
          )}

          {result && !result.success && !result.txData && error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5 flex items-start gap-3">
              <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-400">Verification Failed</p>
                <p className="text-sm text-slate-400 mt-1">{error}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResultRow({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div className="bg-slate-950/50 rounded-lg px-3 py-2 border border-slate-800">
      <p className="text-xs text-slate-500 mb-0.5">{label}</p>
      <p className={`text-sm font-medium ${highlight ? "text-cyan-400" : "text-slate-200"} ${mono ? "font-mono" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function shortenAddr(addr: string): string {
  if (!addr) return "—";
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
