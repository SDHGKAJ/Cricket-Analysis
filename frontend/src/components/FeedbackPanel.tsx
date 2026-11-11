import React, { useState, useEffect } from 'react';
import { ArrowRight, FileText, RefreshCw, User, RotateCcw } from 'lucide-react';
import { FeedbackItem } from '../services/reportMapper';
import { SessionRecord } from '../types/cricket';
import { getBattingSessions } from '../services/api';

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
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBattingSessions()
      .then((data) => { if (!cancelled) { setSessions(data); setLoading(false); } })
      .catch((err) => { if (!cancelled) { setError(err.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const recent = sessions.map((s) => ({
    id: s.id,
    title: `${s.shot_count} shots · ${s.camera_angle.replace('_', ' ')}`,
    detail: `Overall ${s.avg_score?.toFixed(1) ?? '—'}/10 · ${s.batter_hand}`,
    time: s.created_at ? new Date(s.created_at).toLocaleDateString() : '—',
  }));

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
          {loading ? (
            <div className="flex items-center gap-2 p-2 text-[12px] text-[#6E7486]">
              <RotateCcw className="w-3 h-3 animate-spin" />
              <span>Loading…</span>
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 p-2 rounded-[8px] border border-[#F4533F]/30 bg-[#F4533F]/10 text-[12px] text-[#F4533F]">
              <span>Unable to load recent analyses</span>
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-[12px] text-[#6E7486] text-center py-4">No recent analyses yet.</p>
          ) : (
            recent.map((r) => (
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
            ))
          )}
        </div>
      </section>
    </aside>
  );
};
