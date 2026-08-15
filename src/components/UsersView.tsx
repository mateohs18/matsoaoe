import { useState } from "react";
import { Users as UsersIcon, Plus, Loader2, Trash2, Coins, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { User } from "@/types";

interface UsersViewProps {
  users: User[];
  loading: boolean;
  onUpdated: () => void;
}

export function UsersView({ users, loading, onUpdated }: UsersViewProps) {
  const [search, setSearch] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [adding, setAdding] = useState(false);
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = users.filter((u) =>
    u.username.toLowerCase().includes(search.toLowerCase())
  );

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    if (!newUsername.trim()) return;
    setAdding(true);
    try {
      await supabase.from("users").insert({ username: newUsername.trim() });
      setNewUsername("");
      onUpdated();
    } catch {
      // error handled by reload
    } finally {
      setAdding(false);
    }
  }

  async function adjustCredits(userId: string, currentCredits: number) {
    const amount = parseInt(adjustAmount, 10);
    if (isNaN(amount)) return;
    setAdjustingId(userId);
    try {
      await supabase
        .from("users")
        .update({ credits: currentCredits + amount })
        .eq("id", userId);
      setAdjustAmount("");
      onUpdated();
    } finally {
      setAdjustingId(null);
    }
  }

  async function deleteUser(userId: string) {
    setDeletingId(userId);
    try {
      await supabase.from("users").delete().eq("id", userId);
      onUpdated();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Users</h2>
          <p className="text-slate-400 text-sm">Manage users and their credit balances.</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <form onSubmit={addUser} className="bg-slate-900 rounded-2xl border border-slate-800 p-5">
            <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <Plus className="w-4 h-4 text-cyan-400" />
              Add New User
            </h3>
            <input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="Username"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition mb-3"
            />
            <button
              type="submit"
              disabled={adding || !newUsername.trim()}
              className="w-full flex items-center justify-center gap-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 text-cyan-400 font-medium py-2.5 rounded-xl text-sm transition disabled:opacity-50"
            >
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add User
            </button>
          </form>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-800">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search users..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition"
                />
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-slate-600" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <UsersIcon className="w-10 h-10 text-slate-700 mb-3" />
                <p className="text-sm text-slate-500">
                  {search ? "No users match your search." : "No users yet. Add one to get started."}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800 max-h-[500px] overflow-auto">
                {filtered.map((user) => (
                  <div key={user.id} className="p-4 hover:bg-slate-800/30 transition group">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center text-sm font-bold text-slate-300 shrink-0">
                          {user.username.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white truncate">{user.username}</p>
                          <p className="text-xs text-slate-500">
                            Joined {new Date(user.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5">
                          <Coins className="w-4 h-4 text-amber-400" />
                          <span className="text-sm font-semibold text-white">{user.credits}</span>
                        </div>
                        <button
                          onClick={() => deleteUser(user.id)}
                          disabled={deletingId === user.id}
                          className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition p-1.5"
                        >
                          {deletingId === user.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <input
                        type="number"
                        value={adjustAmount}
                        onChange={(e) => setAdjustAmount(e.target.value)}
                        placeholder="+/- credits"
                        className="w-32 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition"
                      />
                      <button
                        onClick={() => adjustCredits(user.id, user.credits)}
                        disabled={adjustingId === user.id || !adjustAmount}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition disabled:opacity-50"
                      >
                        {adjustingId === user.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Adjust"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
