import { Loader2, History as HistoryIcon, CheckCircle2, XCircle, Clock, ArrowRight } from "lucide-react";
import type { Transaction } from "@/types";

interface HistoryViewProps {
  transactions: Transaction[];
  loading: boolean;
}

export function HistoryView({ transactions, loading }: HistoryViewProps) {
  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-1">Transaction History</h2>
        <p className="text-slate-400 text-sm">All verified and attempted payments.</p>
      </div>

      <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-slate-600" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <HistoryIcon className="w-10 h-10 text-slate-700 mb-3" />
            <p className="text-sm text-slate-500">No transactions yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {transactions.map((tx) => (
              <div key={tx.id} className="p-4 hover:bg-slate-800/30 transition">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <StatusIcon status={tx.status} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-medium text-white">{tx.discord_username || tx.username || "Unknown user"}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-600" />
                        <span className="text-sm font-semibold text-cyan-400">+{tx.credits_added} credits</span>
                      </div>
                      <p className="text-xs text-slate-500 font-mono truncate">
                        {tx.tx_hash}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        {tx.network && (
                          <span className="text-xs text-slate-500 bg-slate-950 border border-slate-800 rounded px-2 py-0.5">
                            {tx.network}
                          </span>
                        )}
                        <span className="text-xs text-slate-500">
                          ${tx.amount_usd.toFixed(2)} USD
                        </span>
                        <span className="text-xs text-slate-500">
                          {new Date(tx.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <StatusBadge status={tx.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: Transaction["status"] }) {
  if (status === "confirmed")
    return <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />;
  if (status === "failed")
    return <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />;
  return <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />;
}

function StatusBadge({ status }: { status: Transaction["status"] }) {
  const styles: Record<Transaction["status"], string> = {
    confirmed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    failed: "bg-red-500/10 text-red-400 border-red-500/20",
    pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  };
  const labels: Record<Transaction["status"], string> = {
    confirmed: "Confirmed",
    failed: "Failed",
    pending: "Pending",
  };
  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${styles[status]} shrink-0`}>
      {labels[status]}
    </span>
  );
}
