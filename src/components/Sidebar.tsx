import { LayoutDashboard, ShieldCheck, Users, History, Settings, Zap } from "lucide-react";
import type { View } from "@/types";

interface SidebarProps {
  view: View;
  setView: (view: View) => void;
}

const navItems: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "verify", label: "Verify Payment", icon: ShieldCheck },
  { id: "users", label: "Users", icon: Users },
  { id: "history", label: "History", icon: History },
  { id: "settings", label: "Settings", icon: Settings },
];

export function Sidebar({ view, setView }: SidebarProps) {
  return (
    <aside className="w-20 lg:w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 transition-all duration-300">
      <div className="h-20 flex items-center justify-center lg:justify-start lg:px-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Zap className="w-5 h-5 text-white" fill="white" />
          </div>
          <div className="hidden lg:block">
            <h1 className="text-sm font-bold tracking-tight text-white">CryptoVerify</h1>
            <p className="text-xs text-slate-500">Discord Bot</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 py-6 px-3 lg:px-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={`w-full flex items-center gap-3 px-3 lg:px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                active
                  ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
              }`}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span className="hidden lg:inline">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800 hidden lg:block">
        <div className="rounded-xl bg-slate-800/50 p-4">
          <p className="text-xs text-slate-500 mb-1">Rate</p>
          <p className="text-sm font-semibold text-cyan-400">1 USD = 1 Credit</p>
        </div>
      </div>
    </aside>
  );
}
