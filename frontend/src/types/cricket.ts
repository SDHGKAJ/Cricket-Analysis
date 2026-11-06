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
  confidence?: number;
  delta_last_session?: number;
  frames?: FrameLandmarks[];
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
