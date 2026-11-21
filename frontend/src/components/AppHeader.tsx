import React from 'react';
import { Dumbbell, Video } from 'lucide-react';

export type Page = 'video' | 'drills';

const TABS: Array<{ id: Page; label: string; icon: React.ElementType }> = [
  { id: 'video', label: 'Analyse', icon: Video },
  { id: 'drills', label: 'Drills', icon: Dumbbell },
];

/** AppHeader — sticky top bar on desktop; tabs move to a bottom bar on phones. */
export const AppHeader: React.FC<{ page: Page; onPage: (p: Page) => void }> = ({ page, onPage }) => (
  <>
    <header
      className="sticky z-30 bg-bg/85 backdrop-blur border-b border-line"
      style={{ top: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="max-w-6xl mx-auto h-14 px-4 flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <span className="relative w-7 h-7 rounded-full bg-ball shadow-[inset_-3px_-3px_0_rgba(0,0,0,0.25)]" aria-hidden="true">
            <span className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[3px] border-x border-dashed border-white/60" />
          </span>
          <span className="num text-xl font-semibold text-ink tracking-wide">CRICVISION</span>
        </div>
        <nav className="hidden sm:flex ml-auto seg" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t.id} aria-pressed={page === t.id} onClick={() => onPage(t.id)} className="flex items-center gap-1.5">
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </nav>
      </div>
    </header>

    {/* Phone bottom tab bar */}
    <nav
      className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-surface/95 backdrop-blur border-t border-line grid grid-cols-2"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="Sections"
    >
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => onPage(t.id)}
          aria-current={page === t.id ? 'page' : undefined}
          className={`h-14 flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
            page === t.id ? 'text-accent' : 'text-mute'
          }`}
        >
          <t.icon className="w-5 h-5" />
          {t.label}
        </button>
      ))}
    </nav>
  </>
);

export default AppHeader;
