import React from 'react';
import { ArrowRight, FileText, RefreshCw, User } from 'lucide-react';
import { FeedbackItem } from '../services/reportMapper';

interface FeedbackRowProps {
  item: FeedbackItem;
}

const ICONS: Record<string, React.ElementType> = {
  good: ArrowRight,
  medium: RefreshCw,
  bad: FileText,
  not_detected: User,
};

const COLORS: Record<string, string> = {
  good: 'text-[#2ECC71]',
  medium: 'text-[#F5A623]',
  bad: 'text-[#F4533F]',
  not_detected: 'text-[#6E7486]',
};

/** FeedbackPanel — right panel: Feedback list + Recent analyses list. */
export interface FeedbackPanelProps {
  items: FeedbackItem[];
}

export const FeedbackPanel: React.FC<FeedbackPanelProps> = ({ items }) => {
  const recent = [
    { id: 'r1', title: 'Cover Drive · 4 Jun', detail: 'Overall 8.2 · Head balanced', time: '2h ago' },
    { id: 'r2', title: 'Straight Drive · 3 Jun', detail: 'Overall 6.9 · Front foot late', time: '1d ago' },
    { id: 'r3', title: 'Pull Shot · 1 Jun', detail: 'Overall 5.4 · Early contact', time: '2d ago' },
  ];

  return (
    <aside className="flex flex-col gap-4 fade-in" aria-label="Right panel">
      {/* Feedback list */}
      <section className="panel p-4 space-y-3">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-xs font-bold text-[#FFFFFF] uppercase tracking-wider">Coaching feedback</h3>
          <span className="text-[10px] font-bold text-[#6E7486] uppercase">{items.length}</span>
        </div>
        <div className="space-y-2">
          {items.length === 0 ? (
            <p className="text-[12px] text-[#6E7486] text-center py-4">No feedback yet.</p>
          ) : (
            items.map((item, i) => (
              <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-[8px] border border-[rgba(255,255,255,0.06)] bg-[#242833]/50">
                <div className="mt-[2px] shrink-0">
                  {(() => {
                    const Icon = ICONS[item.status] ?? User;
                    return <Icon className={`w-4 h-4 ${COLORS[item.status]}`} aria-hidden="true" />;
                  })()}
                </div>
                <p className="text-[12px] text-[#AAB0BD] leading-relaxed">{item.line}</p>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Recent analyses list */}
      <section className="panel p-4 space-y-3">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-xs font-bold text-[#FFFFFF] uppercase tracking-wider">Recent analyses</h3>
        </div>
        <div className="space-y-2">
          {recent.map((r) => (
            <div key={r.id} className="flex items-center gap-2.5 p-2 rounded-[8px] border border-[rgba(255,255,255,0.04)] hover:border-[#1FB5D6]/50 transition-colors group">
              <div className="w-7 h-7 rounded-[6px] bg-[#1FB5D6]/15 flex items-center justify-center text-[#1FB5D6] shrink-0">
                <User className="w-3 h-3" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-[#FFFFFF] truncate">{r.title}</p>
                <p className="text-[11px] text-[#6E7486] truncate">{r.detail}</p>
              </div>
              <span className="text-[10px] text-[#6E7486] font-numeric">{r.time}</span>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
};
