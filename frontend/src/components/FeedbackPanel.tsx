import React from 'react';
import { AlertTriangle, CheckCircle2, HelpCircle, TrendingUp } from 'lucide-react';
import { FeedbackItem } from '../services/reportMapper';
import { MetricStatus } from '../types/cricket';

/** FeedbackPanel — coaching lines grouped so the things to fix come first. */
const GROUPS: Array<{ title: string; statuses: MetricStatus[]; icon: React.ElementType; color: string }> = [
  { title: 'Work on', statuses: ['bad'], icon: AlertTriangle, color: 'text-bad' },
  { title: 'Getting there', statuses: ['medium'], icon: TrendingUp, color: 'text-warn' },
  { title: 'Doing well', statuses: ['good'], icon: CheckCircle2, color: 'text-good' },
  { title: "Couldn't measure", statuses: ['not_detected'], icon: HelpCircle, color: 'text-mute' },
];

export const FeedbackPanel: React.FC<{ items: FeedbackItem[] }> = ({ items }) => (
  <section className="card p-4" aria-label="Coaching feedback">
    <div className="flex items-center justify-between mb-3">
      <h3 className="eyebrow">Coaching feedback</h3>
      <span className="text-xs text-mute">{items.length} notes</span>
    </div>
    {items.length === 0 ? (
      <p className="text-sm text-mute py-2">No feedback for this clip.</p>
    ) : (
      <div className="space-y-4">
        {GROUPS.map((g) => {
          const rows = items.filter((i) => g.statuses.includes(i.status));
          if (!rows.length) return null;
          const Icon = g.icon;
          return (
            <div key={g.title}>
              <div className={`flex items-center gap-1.5 text-xs font-semibold mb-1.5 ${g.color}`}>
                <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                {g.title}
              </div>
              <ul className="space-y-1.5">
                {rows.map((r, k) => (
                  <li key={k} className="text-[13px] leading-snug text-body bg-bg border border-line rounded-lg px-3 py-2">
                    {r.line}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    )}
  </section>
);

export default FeedbackPanel;
