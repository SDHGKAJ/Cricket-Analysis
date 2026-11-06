import React, { useState } from 'react';
import {
  Home,
  Play,
  Dumbbell,
  LayoutDashboard,
  Users,
  Calendar,
  Trophy,
  ChevronRight,
  Search,
  User as UserIcon,
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'video', label: 'Video Analysis', icon: Play },
  { id: 'drills', label: 'Drills', icon: Dumbbell },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'groups', label: 'Groups', icon: Users },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'coach', label: 'Coach Corner', icon: Trophy },
] as const;

interface SideNavProps {
  active: string;
  onSelect: (id: string) => void;
  playerName: string;
  playerId: string;
  onPlayerChange: () => void;
}

export const SideNav: React.FC<SideNavProps> = ({
  active,
  onSelect,
  playerName,
  playerId,
  onPlayerChange,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <aside
      className="fixed left-0 top-0 bottom-0 z-40 w-60 bg-[#0A1020] border-r border-white/6 flex flex-col"
      aria-label="Main navigation"
    >
      {/* ── Brand / player header ── */}
      <div className="flex items-center gap-2.5 px-4 py-5 border-b border-white/6 shrink-0">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-400 via-purple-500 to-sky-400 p-[2px] flex items-center justify-center shadow-lg shadow-purple-500/25">
          <div className="w-full h-full bg-[#0B1220] rounded-[10px] flex items-center justify-center text-xl">
            🏏
          </div>
        </div>
        <div className="min-w-0 flex flex-col">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white truncate">{playerName}</span>
            <button
              onClick={onPlayerChange}
              className="p-1 rounded-full bg-white/5 hover:bg-white/10 text-white/60 transition-all"
              title="Change player"
              aria-label="Change player"
            >
              <UserIcon className="w-3 h-3" />
            </button>
          </div>
          <span className="text-[10px] text-slate-500 font-medium font-numeric truncate">
            {playerId}
          </span>
        </div>
      </div>

      {/* ── Search ── */}
      <div className="px-4 py-3 border-b border-white/6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search shots, drills, players…"
            className="w-full bg-[#0B1220]/60 border border-white/8 rounded-xl px-3 py-2 pl-9 text-xs text-slate-200 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/50 transition-all placeholder-slate-600"
          />
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 px-3 py-2 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = active === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shadow-lg shadow-emerald-500/10'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white hover:border-white/10 border-transparent'
              }`}
            >
              <Icon className="w-4.5 h-4.5 shrink-0" />
              <span className="font-sans">{item.label}</span>
              {isActive && (
                <span className="ml-auto w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </button>
          );
        })}
      </nav>

      {/* ── Footer actions ── */}
      <div className="px-3 py-4 border-t border-white/6">
        <button
          className="w-full flex items-center justify-center gap-2.5 px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition-all"
        >
          <PlusCircle />
          New Session
        </button>
      </div>
    </aside>
  );
};

function PlusCircle() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
