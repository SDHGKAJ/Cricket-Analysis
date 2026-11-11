import type { ReactNode } from 'react';

export type CameraAngle = 'front_on' | 'side_on';
export type BatterHand = 'right' | 'left';
export type ShotType = 'cover_drive' | 'straight_drive' | 'pull_shot' | 'cut_shot' | 'forward_defense' | 'sweep_shot' | 'flick_shot';

export interface LandmarkPoint {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface FrameLandmarks {
  frame_index: number;
  timestamp_ms: number;
  landmarks: LandmarkPoint[];
  ball_position?: { x: number; y: number };
  bat_tip?: { x: number; y: number };
}

export interface FlawItem {
  name: string;
  severity: 'low' | 'medium' | 'high';
  frame: number;
  joint?: string;
  affected_joint?: string;
  measured: number | string;
  ideal: string;
}

export interface TipItem {
  flaw: string;
  why_it_hurts?: string;
  fix: string;
  drill: string;
}

export interface ShotAnalysis {
  shot_type: string;
  overall_score: number;
  timing_score: number;
  metrics: {
    timing?: number;
    head_position?: number;
    front_elbow?: number;
    footwork?: number;
    balance?: number;
    bat_swing_path?: number;
    backlift?: number;
    follow_through?: number;
    [key: string]: number | undefined;
  };
  flaws: FlawItem[];
  tips: TipItem[];
  impact_frame?: number;
  total_frames?: number;
  shot_id?: string;
  replay_url?: string;
  pose_video_url?: string;
  cricket_video_url?: string;
  cricket_report_url?: string;
  feedback?: string[];
  ball_tracking?: BallTrackingReport;
  confidence?: number;
  delta_last_session?: number;
  frames?: FrameLandmarks[];
  video_url?: string;
}

export interface SessionRecord {
  id: string;
  player_name: string;
  camera_angle: CameraAngle;
  batter_hand: BatterHand;
  created_at: string;
  shot_count: number;
  avg_score: number;
  shots?: ShotAnalysis[];
}

export interface DrillInfo {
  id: string;
  title: string;
  duration: string;
  reps: string;
  equipment: string;
  description: string;
  flawName: string;
  cue: string;
  thumbnail: string;
  category: string;
}

/* ── Cricket shot report (backend /outputs/cricket_*.json) ── */

export interface WeightTransferReport {
  status: string;
  start_pct: number | null;
  contact_pct: number | null;
  shift_pct: number | null;
  label: string | null;
}

export interface FrontFootReport {
  status: string;
  used_foot?: string;
  foot_source?: string;
  planted_frames?: number;
  angle_deg: number | null;
  used_toe?: boolean;
  vs_bowler_deg: number | null;
  shot_direction_deg: number | null;
  difference_deg: number | null;
  flag: string | null;
}

export interface HeadBalanceReport {
  status: string;
  reason?: string;
  offset_cm_at_contact: number | null;
  median_offset: number | null;
  label: string | null;
  jitter: number | null;
  unit?: string;
}

export interface BallContactReport {
  status: string;
  reason?: string;
  frame: number | null;
  time_ms: number | null;
  method: string | null;
}

export interface EyeFocusReport {
  status: string;
  reason?: string;
  pct_eyes_on_ball: number | null;
  frames_checked: number | null;
  turned_away_at_frame: number | null;
}

export interface TimingReport {
  status: string;
  phases_ms: {
    stance?: number | null;
    backlift?: number | null;
    downswing?: number | null;
    follow_through?: number | null;
  };
  downswing_to_contact_ms: number | null;
  swing_speed_mps: number | null;
  contact_timing: string | null;
  fps?: number;
}

export interface BallTrackingReport {
  frames_total: number;
  frames_with_ball: number;
  detection_rate: number;
  avg_confidence: number;
  model: string;
  conf_threshold: number;
  status: string;
  rejected?: Record<string, number>;
}

export interface CricketReport {
  weight_transfer: WeightTransferReport;
  front_foot: FrontFootReport;
  head_balance: HeadBalanceReport;
  ball_contact: BallContactReport;
  eye_focus: EyeFocusReport;
  timing: TimingReport;
  shot_direction?: { value_deg: number | null; source: string };
  ball_tracking?: BallTrackingReport;
  feedback: string[];
}

/* ── Unified metric tile view-model ── */

export type MetricStatus = 'good' | 'medium' | 'bad' | 'not_detected';

export interface MetricTileModel {
  key: string;
  name: string;
  accent: 'coral' | 'periwinkle' | 'cyan' | 'amber' | 'pink' | 'green';
  icon: ReactNode;
  /** Big displayed value inside the ring — null when not detected */
  value: string | null;
  status: MetricStatus;
  badge: string;
  explanation: string;
  confidence: string;
  reason?: string;
}

/* ── Wave chart point ── */

export interface WavePoint {
  t: number;      // time in ms
  speed: number;  // wrist speed m/s
  phase: string;
}

/** Six metrics in display order, each with its own tile color + icon. */
export const METRIC_TILES: Array<{
  key: string;
  name: string;
  accent: 'coral' | 'periwinkle' | 'cyan' | 'amber' | 'pink' | 'green';
}> = [
  { key: 'weight_transfer', name: 'Weight transfer', accent: 'coral' },
  { key: 'front_foot',      name: 'Front foot',      accent: 'amber' },
  { key: 'head_balance',    name: 'Head balance',    accent: 'periwinkle' },
  { key: 'ball_contact',    name: 'Ball contact',    accent: 'pink' },
  { key: 'eye_focus',       name: 'Eye focus',       accent: 'cyan' },
  { key: 'timing',          name: 'Shot timing',     accent: 'green' },
];

/* ── Cricket shot report (backend /outputs/cricket_*.json) ── */

export interface WeightTransferReport {
  status: string;
  start_pct: number | null;
  contact_pct: number | null;
  shift_pct: number | null;
  label: string | null;
}

export interface FrontFootReport {
  status: string;
  used_foot?: string;
  foot_source?: string;
  planted_frames?: number;
  angle_deg: number | null;
  used_toe?: boolean;
  vs_bowler_deg: number | null;
  shot_direction_deg: number | null;
  difference_deg: number | null;
  flag: string | null;
}

export interface HeadBalanceReport {
  status: string;
  reason?: string;
  offset_cm_at_contact: number | null;
  median_offset: number | null;
  label: string | null;
  jitter: number | null;
  unit?: string;
}

export interface BallContactReport {
  status: string;
  reason?: string;
  frame: number | null;
  time_ms: number | null;
  method: string | null;
}

export interface EyeFocusReport {
  status: string;
  reason?: string;
  pct_eyes_on_ball: number | null;
  frames_checked: number | null;
  turned_away_at_frame: number | null;
}

export interface TimingReport {
  status: string;
  phases_ms: {
    stance?: number | null;
    backlift?: number | null;
    downswing?: number | null;
    follow_through?: number | null;
  };
  downswing_to_contact_ms: number | null;
  swing_speed_mps: number | null;
  contact_timing: string | null;
  fps?: number;
}

export interface BallTrackingReport {
  frames_total: number;
  frames_with_ball: number;
  detection_rate: number;
  avg_confidence: number;
  model: string;
  conf_threshold: number;
  status: string;
  rejected?: Record<string, number>;
}

export interface CricketReport {
  weight_transfer: WeightTransferReport;
  front_foot: FrontFootReport;
  head_balance: HeadBalanceReport;
  ball_contact: BallContactReport;
  eye_focus: EyeFocusReport;
  timing: TimingReport;
  shot_direction?: { value_deg: number | null; source: string };
  ball_tracking?: BallTrackingReport;
  feedback: string[];
}
