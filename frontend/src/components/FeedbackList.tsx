import React from 'react';
import { AlertCircle, CheckCircle2, AlertTriangle } from 'lucide-react';
import { MetricStatus } from '../types/cricket';

interface FeedbackItemProps {
  line: string;
  status: MetricStatus;
}

const ICONS: Record<string, React.ElementType> = {
  good: CheckCircle2,
  medium: AlertTriangle,
  bad: AlertCircle,
  not_detected: AlertCircle,
};

const COLORS: Record<string, string> = {
  good: 'text-status-good',
  medium: 'text-status-medium',
  bad: 'text-status-bad',
  not_detected: 'text-status-none',
};

const FeedbackIcon: React.FC<{ icon: React.ElementType; className?: string }> = ({ icon: Icon, className = '' }) => (
  <Icon className={`w-4 h-4 shrink-0 ${className}`} aria-hidden="true" />
);

/**
 * FeedbackList — coaching tips grouped by metric, each with a colored status icon.
 */
export interface FeedbackListProps {
  groups: Array<{ status: string; title: string; lines: string[] }>;
}

export const FeedbackList: React.FC<FeedbackListProps> = ({ groups }) => {
  return (
    <section className="panel p-4 space-y-4" aria-label="Coaching feedback">
      <h3 className="section-title">Coaching feedback</h3>
      <div className="space-y-3">
        {groups.map((group, gi) => (
          <div key={gi} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${COLORS[group.status] ?? 'text-ink-mute'}`}>
                {group.title}
              </span>
            </div>
            <ul className="space-y-1.5">
              {group.lines.map((line, li) => (
                <li key={li} className="flex items-start gap-2 p-2 rounded-btn border border-line/50 bg-card">
                  <span className="mt-[2px] w-4 h-4 shrink-0">
                    <FeedbackIcon
                      icon={ICONS[group.status] ?? AlertCircle}
                      className={`w-4 h-4 ${COLORS[group.status] ?? 'text-ink-mute'}`}
                    />
                  </span>
                  <p className="text-xs text-ink leading-relaxed">{line}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
};
