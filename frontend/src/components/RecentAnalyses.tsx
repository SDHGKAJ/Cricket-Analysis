import React, { useEffect, useState } from 'react';
import { SessionRecord } from '../types/cricket';
import { getBattingSessions } from '../services/api';

/** RecentAnalyses — latest batting sessions from the backend. */
export const RecentAnalyses: React.FC<{ refreshKey?: unknown }> = ({ refreshKey }) => {
  const [sessions, setSessions] = useState<SessionRecord[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getBattingSessions()
      .then((d) => { if (!cancelled) setSessions(d.filter((s) => s.shot_count > 0).slice(0, 6)); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  return (
    <section className="card p-4" aria-label="Recent analyses">
      <h3 className="eyebrow mb-3">Recent sessions</h3>
      {error ? (
        <p className="text-sm text-mute">Couldn't reach the server for past sessions.</p>
      ) : sessions == null ? (
        <p className="text-sm text-mute">Loading…</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-mute">No analysed sessions yet.</p>
      ) : (
        <ul className="divide-y divide-[var(--line)]">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2">
              <span className="num text-2xl text-ink w-12 text-right">{s.avg_score != null ? s.avg_score.toFixed(1) : '—'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-ink truncate">
                  {s.shot_count} {s.shot_count === 1 ? 'shot' : 'shots'} · {s.camera_angle.replace('_', '-')}
                </p>
                <p className="text-[11px] text-mute">{s.batter_hand}-handed</p>
              </div>
              <span className="text-[11px] text-mute whitespace-nowrap">
                {s.created_at ? new Date(s.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default RecentAnalyses;
