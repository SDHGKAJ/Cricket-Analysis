import React from 'react';
import { Crosshair, RotateCcw, Undo2, X } from 'lucide-react';
import type { Trajectory } from '../types/trajectory';
import { CALIBRATION_STEPS, DECISION_COLOR } from '../services/hawkeye';

export type HawkView = 'video' | 'pitch';

interface HawkEyePanelProps {
  traj: Trajectory | null;
  loading: boolean;
  view: HawkView;
  onView: (v: HawkView) => void;
  calibrating: boolean;
  calibStep: number;               // number of points clicked so far
  calibError: string | null;
  onStartCalibration: () => void;
  onUndoPoint: () => void;
  onCancelCalibration: () => void;
  onClearCalibration: () => void;
}

const CONTACT_METHOD: Record<string, string> = {
  'audio+vision': 'bat crack + ball at the bat',
  'audio+swing': 'bat crack during the swing',
};

const fmt = (v: number | null | undefined, unit: string, digits = 0) =>
  v == null ? null : `${v.toFixed(digits)}${unit}`;

/**
 * HawkEyePanel — controls and read-outs for the trajectory views.
 * Metrics that need real-world distances show why they're missing instead
 * of a made-up number.
 */
export const HawkEyePanel: React.FC<HawkEyePanelProps> = ({
  traj, loading, view, onView, calibrating, calibStep, calibError,
  onStartCalibration, onUndoPoint, onCancelCalibration, onClearCalibration,
}) => {
  const m = traj?.metrics;
  const needs = !traj?.calibrated ? 'needs calibration' : !traj?.bounce ? 'needs a bounce' : 'not measurable';

  // `cap` capitalises word values ("good", "off stump"); units like px stay lowercase
  const tiles: Array<{ k: string; v: string | null; sub?: string | null; cap?: boolean }> = [
    { k: 'Speed', v: fmt(m?.speed, ' km/h'), sub: m?.speed != null ? 'average to bounce · est.' : null },
    { k: 'Length', cap: true, v: m?.length ?? null, sub: fmt(m?.lengthM, ' m from stumps', 1) },
    { k: 'Line', cap: true, v: m?.line ?? null, sub: m?.lineCm != null ? `${Math.abs(m.lineCm).toFixed(0)} cm ${m.lineCm >= 0 ? 'off' : 'leg'} side` : null },
    {
      k: 'Swing',
      v: m?.swing != null ? `${Math.abs(m.swing).toFixed(0)} cm` : m?.swingPx != null ? `${Math.abs(m.swingPx).toFixed(0)} px` : null,
      sub: m?.swing != null ? 'pre-bounce, max' : m?.swingPx != null ? 'on screen (uncalibrated)' : null,
    },
    {
      k: 'Turn',
      v: m?.turnCm != null ? `${Math.abs(m.turnCm).toFixed(0)} cm` : fmt(m?.turnDeg != null ? Math.abs(m.turnDeg) : null, '°'),
      sub: m?.turnCm != null ? 'deviation at stumps' : m?.turnDeg != null ? 'direction change at bounce' : null,
    },
    { k: 'Height at stumps', v: fmt(m?.heightAtStumps, ' m', 2), sub: m?.heightAtStumps != null ? 'stumps are 0.71 m' : null },
  ];

  return (
    <section className="card p-4 space-y-4" aria-label="Hawk-Eye ball tracking">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="eyebrow">Hawk-Eye</h3>
          <p className="text-xs text-mute mt-0.5">
            {loading ? 'Loading trajectory…'
              : !traj ? 'No trajectory for this clip.'
              : traj.status !== 'ok' ? 'Not enough clean ball detections to draw a trajectory.'
              : `${traj.frames.length} frames${traj.bounce ? ` · bounce at frame ${traj.bounce.frame}` : ' · no bounce found'}${traj.calibrated ? ' · calibrated' : ''}`}
          </p>
        </div>
        <div className="seg" role="group" aria-label="Hawk-Eye view">
          <button aria-pressed={view === 'video'} onClick={() => onView('video')}>Over video</button>
          <button aria-pressed={view === 'pitch'} onClick={() => onView('pitch')} disabled={calibrating}>3D pitch</button>
        </div>
      </div>

      {/* Bat-ball contact */}
      {traj?.contact && (
        <p className="text-[13px] text-body">
          <span className="text-warn font-semibold">Contact</span> at frame {traj.contact.frame}
          {traj.contact.timeMs != null && <> · {(traj.contact.timeMs / 1000).toFixed(2)} s</>}
          {traj.contact.method && <span className="text-mute"> · {CONTACT_METHOD[traj.contact.method] ?? traj.contact.method.replace(/_/g, ' ')}</span>}
          {traj.contact.confidence && <span className="text-mute"> · {traj.contact.confidence} confidence</span>}
        </p>
      )}

      {/* Decision */}
      {m?.decision && (
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="num text-2xl font-semibold px-3 py-1 rounded-md text-bg"
            style={{ background: DECISION_COLOR[m.decision] }}
          >
            {m.decision}
          </span>
          {m.reviewRetained && <span className="pill pill-medium">Review retained</span>}
          {m.lateralAtStumpsCm != null && (
            <span className="text-xs text-mute">
              {Math.abs(m.lateralAtStumpsCm).toFixed(0)} cm {m.lateralAtStumpsCm >= 0 ? 'off' : 'leg'} side of middle at the stumps
            </span>
          )}
        </div>
      )}

      {/* Calibration */}
      <div className="rounded-lg border border-line bg-bg p-3">
        {calibrating ? (
          <div className="flex flex-wrap items-center gap-2">
            <Crosshair className="w-4 h-4 text-accent shrink-0" />
            <span className="text-[13px] text-ink flex-1 min-w-[180px]">
              <span className="text-mute">Step {calibStep + 1}/5 ·</span> Click the {CALIBRATION_STEPS[calibStep]?.toLowerCase()}
            </span>
            <button className="btn btn-ghost" onClick={onUndoPoint} disabled={calibStep === 0}>
              <Undo2 className="w-4 h-4" /> Undo
            </button>
            <button className="btn btn-ghost" onClick={onCancelCalibration}>
              <X className="w-4 h-4" /> Cancel
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[13px] flex-1 min-w-[200px]">
              {traj?.calibrated
                ? 'Pitch calibrated — speed, length, line and the stump prediction are estimated from it.'
                : 'Speed, length, line and the stump prediction need a pitch calibration: pause on a clear frame and click 5 points.'}
            </p>
            <button className="btn btn-primary" onClick={onStartCalibration} disabled={!traj || traj.status !== 'ok'}>
              <Crosshair className="w-4 h-4" /> {traj?.calibrated ? 'Recalibrate' : 'Calibrate pitch'}
            </button>
            {traj?.calibrated && (
              <button className="btn btn-ghost" onClick={onClearCalibration}>
                <RotateCcw className="w-4 h-4" /> Clear
              </button>
            )}
          </div>
        )}
        {calibError && <p className="text-xs text-bad mt-2">{calibError}</p>}
      </div>

      {/* Metrics */}
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {tiles.map((t) => (
          <div key={t.k} className="rounded-lg bg-bg border border-line px-3 py-2 min-w-0">
            <dt className="text-[11px] text-mute">{t.k}</dt>
            <dd className={`num leading-tight truncate ${t.cap ? 'capitalize' : ''} ${t.v ? 'text-2xl text-ink' : 'text-lg text-mute'}`}>
              {t.v ?? '—'}
            </dd>
            <dd className="text-[11px] text-mute truncate">{t.v ? t.sub ?? '' : needs}</dd>
          </div>
        ))}
      </dl>

      {traj && traj.notes.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-mute">How this was measured ({traj.notes.length})</summary>
          <ul className="mt-2 space-y-1 list-disc pl-4 marker:text-mute">
            {traj.notes.map((n, i) => <li key={i}>{n}</li>)}
            {traj.dropped.lowConf + traj.dropped.outliers > 0 && (
              <li>
                Dropped {traj.dropped.lowConf} low-confidence and {traj.dropped.outliers} outlier detections
                (gaps filled by interpolation).
              </li>
            )}
          </ul>
        </details>
      )}
    </section>
  );
};

export default HawkEyePanel;
