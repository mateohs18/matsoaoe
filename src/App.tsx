import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { User, Transaction, View } from "@/types";
import { Sidebar } from "@/components/Sidebar";
import { DashboardView } from "@/components/DashboardView";
import { VerifyView } from "@/components/VerifyView";
import { UsersView } from "@/components/UsersView";
import { HistoryView } from "@/components/HistoryView";
import { SettingsView } from "@/components/SettingsView";

export default function App() {
  const [view, setView] = useState<View>("dashboard");
  const [users, setUsers] = useState<User[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [usersRes, txRes] = await Promise.all([
      supabase.from("users").select("*").order("created_at", { ascending: false }),
      supabase.from("transactions").select("*").order("created_at", { ascending: false }),
    ]);
    setUsers(usersRes.data ?? []);
    setTransactions(txRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      <Sidebar view={view} setView={setView} />
      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-6 py-8 lg:px-10 lg:py-12">
          {view === "dashboard" && <DashboardView users={users} transactions={transactions} loading={loading} setView={setView} />}
          {view === "verify" && <VerifyView onVerified={loadData} />}
          {view === "users" && <UsersView users={users} loading={loading} onUpdated={loadData} />}
          {view === "history" && <HistoryView transactions={transactions} loading={loading} />}
          {view === "settings" && <SettingsView onSaved={loadData} />}
        </div>
      </main>
    </div>
  );
}
