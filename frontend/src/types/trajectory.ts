/* Hawk-Eye trajectory JSON (backend app/engine/trajectory.py, schema v1).
   Image coordinates are pixels of the analysed video; pitch coordinates are
   metres: x lateral (+ = screen-right), y from the batter's stumps toward the
   bowler, z height. See docs/trajectory_schema.json. */

export type Decision = 'HITTING' | 'MISSING' | "UMPIRE'S CALL";

export interface TrackPoint {
  f: number;
  x: number;
  y: number;
}

export interface TrajectoryFrame extends TrackPoint {
  interpolated: boolean;
  segment: 'pre' | 'post';
}

export interface Pitch3DPoint {
  f: number;
  x: number;
  y: number;
  z: number;
  predicted: boolean;
}

export interface Calibration {
  batterEnd: [[number, number], [number, number]];
  bowlerEnd: [[number, number], [number, number]];
  stumpTop: [number, number];
}

export interface TrajectoryMetrics {
  speed: number | null;            // km/h (estimate)
  length: 'yorker' | 'full' | 'good' | 'short' | null;
  lengthM: number | null;          // bounce distance from the batter's stumps
  line: string | null;             // middle / off stump / outside leg ...
  lineCm: number | null;           // + = off side
  swing: number | null;            // cm, pre-bounce
  swingPx: number | null;
  turnDeg: number | null;          // image-space direction change at the bounce
  turnCm: number | null;           // lateral deviation at the stumps vs. the pre-bounce line
  heightAtStumps: number | null;   // m
  lateralAtStumpsCm: number | null;
  decision: Decision | null;
  reviewRetained: boolean;
}

export interface Trajectory {
  version: number;
  id: string | null;
  status: 'ok' | 'insufficient';
  fps: number;
  width: number;
  height: number;
  batterHand: 'right' | 'left';
  calibrated: boolean;
  calibration: Calibration | null;
  raw: Array<TrackPoint & { conf: number | null }>;
  dropped: { lowConf: number; outliers: number };
  frames: TrajectoryFrame[];
  bounce: { frame: number; x: number; y: number; pitchX?: number; pitchY?: number } | null;
  predicted: TrackPoint[];
  impact: { f: number; x: number; y: number; lateralM: number | null; heightM: number | null } | null;
  stumps: { base: number[][]; top: number[][] } | null;
  pitch3d: {
    path: Pitch3DPoint[];
    bounce: { x: number; y: number };
    impact: { x: number; z: number };
  } | null;
  /** Bat-ball contact (audio crack + ball near the bat), if found */
  contact: {
    frame: number;
    timeMs: number | null;
    method: string | null;          // "audio+vision" | "audio+swing" | "ball_bat_min_distance" ...
    confidence: 'high' | 'medium' | 'low' | null;
    x: number | null;               // ball px at contact, when seen
    y: number | null;
  } | null;
  metrics: TrajectoryMetrics;
  notes: string[];
}
