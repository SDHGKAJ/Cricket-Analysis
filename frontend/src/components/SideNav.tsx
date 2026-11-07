import React, { useState } from 'react';
import { Play, Dumbbell, User as UserIcon } from 'lucide-react';

const NAV_ITEMS = [
  { id: 'video', label: 'Video Analysis', icon: Play },
  { id: 'drills', label: 'Drills', icon: Dumbbell },
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
    </aside>
  );
};
