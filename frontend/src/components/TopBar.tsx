import React from 'react';
import { Play } from 'lucide-react';

interface TopBarProps {
  appName: string;
}

export const TopBar: React.FC<TopBarProps> = ({ appName }) => {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-30 h-14 bg-white border-b border-line flex items-center justify-between px-4 lg:px-6 shrink-0 shadow-card"
      aria-label="Top bar"
    >
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-btn grad-button flex items-center justify-center shadow-sm">
          <Play className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="text-sm font-bold text-ink-hi tracking-tight">{appName}</span>
      </div>
      <div className="hidden md:flex items-center gap-1 text-[11px] text-ink-mute">
        <span className="px-2 py-0.5 rounded-btn border border-line text-xs">Cricket batting analytics</span>
      </div>
    </header>
  );
};
