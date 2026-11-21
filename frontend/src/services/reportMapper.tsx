import React from 'react';
import {
  CricketReport,
  MetricStatus,
  MetricTileModel,
} from '../types/cricket';

/* ═══════════════════════════════════════════════════════════
   Report → UI mapper (dark dashboard)
   Turns the backend cricket report JSON into MetricTileModels.
   Each metric has its own vivid tile color + icon.
   Status colors are FIXED: good=green, medium=amber, bad=red,
   not_detected=grey — shown only as a small badge, never tile color.
   ═══════════════════════════════════════════════════════════ */

import {
  Compass,
  Eye,
  Film,
  Play,
  Target,
} from 'lucide-react';

const ICONS: Record<string, React.ReactNode> = {
  weight_transfer: <Compass className="w-4 h-4" />,
  front_foot: <Target className="w-4 h-4" />,
  head_balance: <Eye className="w-4 h-4" />,
  ball_contact: <Film className="w-4 h-4" />,
  eye_focus: <Eye className="w-4 h-4" />,
  timing: <Play className="w-4 h-4" />,
};

const ACCENTS: Record<string, 'coral' | 'periwinkle' | 'cyan' | 'amber' | 'pink' | 'green'> = {
  weight_transfer: 'coral',
  front_foot: 'amber',
  head_balance: 'periwinkle',
  ball_contact: 'pink',
  eye_focus: 'cyan',
  timing: 'green',
};

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

const startsNotDetected = (status?: string | null): boolean =>
  !!status && status.trim().toLowerCase().startsWith('not detected');

function ballConfidence(report: CricketReport): string {
  const rate = num(report.ball_tracking?.detection_rate);
  if (rate == null) return 'Medium';
  if (rate >= 0.6) return 'High';
  if (rate >= 0.3) return 'Medium';
  return 'Low';
}

function confidenceFromFrames(count: number | null): string {
  if (count == null) return 'Low';
  if (count >= 20) return 'High';
  if (count >= 8) return 'Medium';
  return 'Low';
}

/* ── 1. Weight transfer ─────────────────────────────────── */
function weightTransferCard(r: CricketReport): MetricTileModel {
  const m = r.weight_transfer;
  const base: MetricTileModel = {
    key: 'weight_transfer',
    name: 'Weight transfer',
    accent: ACCENTS.weight_transfer,
    icon: ICONS.weight_transfer,
    value: null,
    status: 'not_detected',
    badge: 'Not detected',
    explanation: '',
    confidence: 'Low',
  };

  if (m == null || startsNotDetected(m.status)) {
    base.reason = m?.status ?? 'Weight transfer not available for this clip.';
    return base;
  }

  const contact = num(m.contact_pct);
  const start = num(m.start_pct);
  const value = contact ?? start;
  if (value == null) {
    base.reason = 'No ankle geometry available in this clip.';
    return base;
  }

  let status: MetricStatus;
  if (contact == null) status = 'medium'; // start-only is partial
  else if (m.label === 'Front foot') status = 'good';
  else if (m.label === 'Back foot') status = 'bad';
  else status = 'medium';

  const badge = m.label
    ? `${m.label}${contact == null ? ' · start only' : ''}`
    : contact == null ? 'Start only' : 'Measured';

  base.value = `${value.toFixed(0)}%`;
  base.status = status;
  base.badge = badge;
  base.explanation =
    contact != null && start != null
      ? `Moved from ${start.toFixed(0)}% to ${contact.toFixed(0)}% toward front foot at contact.`
      : contact != null
        ? `${contact.toFixed(0)}% over front foot at contact.`
        : 'Start-of-shot value only — contact not detected.';
  base.confidence = contact != null ? 'High' : 'Low';
  return base;
}

/* ── 2. Front foot direction ────────────────────────────── */
function frontFootCard(r: CricketReport): MetricTileModel {
  const m = r.front_foot;
  const base: MetricTileModel = {
    key: 'front_foot',
    name: 'Front foot',
    accent: ACCENTS.front_foot,
    icon: ICONS.front_foot,
    value: null,
    status: 'not_detected',
    badge: 'Not detected',
    explanation: '',
    confidence: 'Low',
  };

  if (m == null || startsNotDetected(m.status)) {
    base.reason = m?.status ?? 'Front foot direction not available.';
    return base;
  }

  const diff = num(m.difference_deg);
  if (diff == null || m.flag === 'not detected') {
    base.reason = 'Shot direction not detected — cannot compare foot angle.';
    return base;
  }

  const abs = Math.abs(diff);
  let status: MetricStatus;
  let badge: string;
  if (abs < 20) { status = 'good'; badge = 'Pointing to shot area'; }
  else if (abs <= 40) { status = 'medium'; badge = 'Slightly off line'; }
  else { status = 'bad'; badge = 'Misaligned'; }

  const planted = num(m.planted_frames);
  base.value = `${abs.toFixed(0)}°`;
  base.status = status;
  base.badge = badge;
  base.explanation = `Angle between front foot and shot direction (planted ${planted?.toFixed(0) ?? '?'} frames).`;
  base.confidence = planted != null && planted >= 30 ? 'High' : planted != null && planted >= 10 ? 'Medium' : 'Low';
  return base;
}

/* ── 3. Head balance ────────────────────────────────────── */
function headBalanceCard(r: CricketReport): MetricTileModel {
  const m = r.head_balance;
  const base: MetricTileModel = {
    key: 'head_balance',
    name: 'Head balance',
    accent: ACCENTS.head_balance,
    icon: ICONS.head_balance,
    value: null,
    status: 'not_detected',
    badge: 'Not detected',
    explanation: '',
    confidence: 'Low',
  };

  if (m == null || startsNotDetected(m.status)) {
    base.reason = m?.reason ?? m?.status ?? 'Head balance not available.';
    return base;
  }

  const offset = num(m.offset_cm_at_contact);
  if (offset == null) {
    base.reason = m.reason ?? 'Contact frame required to judge head position.';
    return base;
  }

  let status: MetricStatus;
  if (m.label === 'Balanced') status = 'good';
  else if (m.label === 'Falling over') status = 'bad';
  else status = 'medium';

  const jitter = num(m.jitter);
  base.value = `${offset > 0 ? '+' : ''}${offset.toFixed(1)} cm`;
  base.status = status;
  base.badge = m.label ?? 'Measured';
  base.explanation =
    `Head offset from front-knee midpoint at contact` +
    (jitter != null ? ` · movement ${jitter.toFixed(2)} cm/frame.` : '.');
  base.confidence = 'High';
  return base;
}

/* ── 4. Ball contact ────────────────────────────────────── */
function ballContactCard(r: CricketReport): MetricTileModel {
  const m = r.ball_contact;
  const base: MetricTileModel = {
    key: 'ball_contact',
    name: 'Ball contact',
    accent: ACCENTS.ball_contact,
    icon: ICONS.ball_contact,
    value: null,
    status: 'not_detected',
    badge: 'Not detected',
    explanation: '',
    confidence: ballConfidence(r),
  };

  if (m == null || startsNotDetected(m.status) || num(m.frame) == null) {
    base.reason = m?.reason ?? m?.status ?? 'Ball contact not detected.';
    return base;
  }

  const frame = num(m.frame)!;
  const time = num(m.time_ms);
  base.value = `Frame ${frame.toFixed(0)}`;
  base.status = 'good';
  base.badge = 'Detected';
  const how = m.method === 'audio+vision' ? 'bat crack heard with the ball at the bat'
    : m.method === 'audio+swing' ? 'bat crack heard during the swing (ball not seen)'
    : m.method ? m.method.replace(/_/g, ' ') : null;
  base.explanation =
    `Contact at ${time != null ? `${(time / 1000).toFixed(2)} s` : `frame ${frame.toFixed(0)}`}` +
    (how ? ` · ${how}.` : '.');
  if (m.confidence) base.confidence = m.confidence[0].toUpperCase() + m.confidence.slice(1);
  return base;
}

/* ── 5. Eye focus ───────────────────────────────────────── */
function eyeFocusCard(r: CricketReport): MetricTileModel {
  const m = r.eye_focus;
  const base: MetricTileModel = {
    key: 'eye_focus',
    name: 'Eye focus',
    accent: ACCENTS.eye_focus,
    icon: ICONS.eye_focus,
    value: null,
    status: 'not_detected',
    badge: 'Not detected',
    explanation: '',
    confidence: 'Low',
  };

  if (m == null || startsNotDetected(m.status)) {
    base.reason = m?.reason ?? m?.status ?? 'Eye focus not available.';
    return base;
  }

  const pct = num(m.pct_eyes_on_ball);
  if (pct == null) {
    base.reason = m.reason ?? 'No pre-contact frames with a visible ball.';
    return base;
  }

  let status: MetricStatus;
  if (pct >= 70) status = 'good';
  else if (pct >= 40) status = 'medium';
  else status = 'bad';

  const checked = num(m.frames_checked);
  const away = num(m.turned_away_at_frame);
  base.value = `${pct.toFixed(0)}%`;
  base.status = status;
  base.badge = pct >= 70 ? 'Eyes on ball' : pct >= 40 ? 'Loses ball late' : 'Head turned away';
  base.explanation =
    `Eyes on ball in ${pct.toFixed(0)}% of ${checked?.toFixed(0) ?? '?'} pre-contact frames` +
    (away != null ? ` · turned away at frame ${away.toFixed(0)}.` : '.');
  base.confidence = confidenceFromFrames(checked);
  return base;
}

/* ── 6. Shot timing ─────────────────────────────────────── */
function timingCard(r: CricketReport): MetricTileModel {
  const m = r.timing;
  const base: MetricTileModel = {
    key: 'timing',
    name: 'Shot timing',
    accent: ACCENTS.timing,
    icon: ICONS.timing,
    value: null,
    status: 'not_detected',
    badge: 'Not detected',
    explanation: '',
    confidence: 'Low',
  };

  if (m == null || startsNotDetected(m.status)) {
    base.reason = m?.status ?? 'Timing not available.';
    return base;
  }

  const toContact = num(m.downswing_to_contact_ms);
  const speed = num(m.swing_speed_mps);
  const contactTiming = m.contact_timing ?? null;

  if (toContact != null && contactTiming != null) {
    let status: MetricStatus;
    if (contactTiming === 'On time') status = 'good';
    else if (contactTiming === 'Early' || contactTiming === 'Late') status = 'bad';
    else status = 'medium';

    base.value = `${toContact.toFixed(0)} ms`;
    base.status = status;
    base.badge = contactTiming;
    base.explanation =
      `Downswing start → contact` +
      (speed != null ? ` · bat speed ${speed.toFixed(1)} m/s at contact.` : '.');
    base.confidence = 'High';
    return base;
  }

  // Partial: phases measured but no contact
  const p = m.phases_ms ?? {};
  const parts: string[] = [];
  if (num(p.stance) != null) parts.push(`stance ${num(p.stance)!.toFixed(0)} ms`);
  if (num(p.backlift) != null) parts.push(`backlift ${num(p.backlift)!.toFixed(0)} ms`);
  base.status = 'medium';
  base.badge = 'Partial';
  base.value = null; // no single representative number → dashed "—" ring, not a misleading score
  base.explanation =
    parts.length > 0
      ? `Phases measured (${parts.join(', ')}) — contact not detected.`
      : 'Phases measured — contact not detected.';
  base.confidence = 'Low';
  return base;
}

/** Build the six metric tiles in display order. */
export function buildMetricTiles(report: CricketReport | null): MetricTileModel[] {
  if (!report) return [];
  return [
    weightTransferCard(report),
    frontFootCard(report),
    headBalanceCard(report),
    ballContactCard(report),
    eyeFocusCard(report),
    timingCard(report),
  ];
}

/* ═══════════════════════════════════════════════════════════
   Feedback grouping
   ═══════════════════════════════════════════════════════════ */

export interface FeedbackItem {
  status: MetricStatus;
  line: string;
}

function lineStatus(line: string): MetricStatus {
  const lower = line.toLowerCase();
  if (lower.includes('not detected') || lower.includes('not measurable')) {
    if (lower.includes('partial') || lower.includes('start ')) return 'medium';
    return 'not_detected';
  }
  if (lower.includes('falling') || lower.includes('turned away') ||
      lower.includes('early') || lower.includes('late')) return 'bad';
  if (lower.includes('back foot') || lower.includes('misaligned')) return 'medium';
  return 'good';
}

/** Group feedback lines into Needs attention / On track / Not measured. */
export function groupFeedback(lines: string[]): FeedbackItem[] {
  return lines.map((line) => ({ status: lineStatus(line), line }));
}

/* ═══════════════════════════════════════════════════════════
   Phase markers (for the scrubber / wave chart) — from timing report
   ═══════════════════════════════════════════════════════════ */

export interface PhaseMarker {
  id: string;
  label: string;
  startMs: number;
  endMs?: number;
  kind: 'phase' | 'point';
}

export const PHASE_ORDER: Array<{ id: string; label: string; color: string }> = [
  { id: 'stance', label: 'Stance', color: '#1FB5D6' },
  { id: 'backlift', label: 'Backlift', color: '#7B7FE0' },
  { id: 'downswing', label: 'Downswing', color: '#F5A623' },
  { id: 'contact', label: 'Contact', color: '#F4533F' },
  { id: 'follow', label: 'Follow-through', color: '#2ECC71' },
];

/** Derive stance → backlift → downswing → contact → follow-through markers. */
export function buildPhaseMarkers(report: CricketReport | null): PhaseMarker[] {
  if (!report) return [];
  const phases = report.timing?.phases_ms ?? {};
  const stance = num(phases.stance);
  const backlift = num(phases.backlift);
  const downswing = num(phases.downswing);
  const follow = num(phases.follow_through);
  const contact = num(report.ball_contact?.time_ms);

  const markers: PhaseMarker[] = [];
  let cursor = 0;

  if (stance != null) {
    markers.push({ id: 'stance', label: 'Stance', startMs: 0, endMs: stance, kind: 'phase' });
    cursor = stance;
  }
  if (backlift != null) {
    const start = stance != null ? stance : 0;
    markers.push({ id: 'backlift', label: 'Backlift', startMs: start, endMs: start + backlift, kind: 'phase' });
    cursor = start + backlift;
  }
  if (downswing != null) {
    markers.push({ id: 'downswing', label: 'Downswing', startMs: cursor, endMs: cursor + downswing, kind: 'phase' });
    cursor += downswing;
  }
  if (contact != null) {
    markers.push({ id: 'contact', label: 'Contact', startMs: contact, kind: 'point' });
    cursor = contact;
  }
  if (follow != null && contact != null) {
    markers.push({ id: 'follow', label: 'Follow-through', startMs: contact, endMs: contact + follow, kind: 'phase' });
  }

  return markers;
}
