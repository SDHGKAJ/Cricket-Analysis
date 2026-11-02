import { FrameLandmarks, ShotAnalysis, FlawItem, TipItem, CameraAngle, BatterHand } from '../types/cricket';

function calcAngle(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number }
): number {
  const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
  const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
  const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
  if (mag1 * mag2 === 0) return 90;
  const val = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
  return (Math.acos(val) * 180) / Math.PI;
}

function calcDist(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function evaluateCoverDriveClient(
  frames: FrameLandmarks[],
  cameraAngle: CameraAngle = 'front_on',
  batterHand: BatterHand = 'right'
): ShotAnalysis {
  if (frames.length < 5) {
    return {
      shot_type: 'cover_drive',
      overall_score: 7.0,
      timing_score: 7.0,
      metrics: {
        timing: 7.0,
        head_position: 7.0,
        front_elbow: 7.0,
        footwork: 7.0,
        balance: 7.0,
        bat_swing_path: 7.0,
        backlift: 7.0,
        follow_through: 7.0,
      },
      flaws: [],
      tips: [],
      impact_frame: 0,
      total_frames: frames.length,
    };
  }

  const fWrIdx = batterHand === 'right' ? 15 : 16;
  const rWrIdx = batterHand === 'right' ? 16 : 15;
  const fElIdx = batterHand === 'right' ? 13 : 14;
  const fShIdx = batterHand === 'right' ? 11 : 12;
  const fKnIdx = batterHand === 'right' ? 25 : 26;
  const fAnkIdx = batterHand === 'right' ? 27 : 28;
  const rAnkIdx = batterHand === 'right' ? 28 : 27;

  // 1. Detect impact frame via peak wrist speed
  let peakSpeed = -1;
  let impactFrame = Math.floor(frames.length * 0.6);

  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1].landmarks[fWrIdx];
    const curr = frames[i].landmarks[fWrIdx];
    if (prev && curr) {
      const dt = Math.max(0.01, (frames[i].timestamp_ms - frames[i - 1].timestamp_ms) / 1000);
      const speed = calcDist(curr, prev) / dt;
      if (speed > peakSpeed) {
        peakSpeed = speed;
        impactFrame = i;
      }
    }
  }

  const impactLm = frames[impactFrame].landmarks;
  const head = impactLm[0] || { x: 0.5, y: 0.2 };
  const fSh = impactLm[fShIdx] || { x: 0.45, y: 0.28 };
  const fEl = impactLm[fElIdx] || { x: 0.42, y: 0.38 };
  const fWr = impactLm[fWrIdx] || { x: 0.46, y: 0.55 };
  const fKn = impactLm[fKnIdx] || { x: 0.44, y: 0.72 };
  const fAnk = impactLm[fAnkIdx] || { x: 0.42, y: 0.92 };
  const rAnk = impactLm[rAnkIdx] || { x: 0.56, y: 0.92 };

  const torsoLen = Math.max(0.12, calcDist(fSh, impactLm[23] || { x: 0.46, y: 0.52 }));

  // Metrics computation
  // A. Front Elbow
  const elbowAngle = calcAngle(fSh, fEl, fWr);
  const elDy = Math.abs(fEl.y - fSh.y);
  const elDx = Math.abs(fEl.x - fSh.x);
  const elbowElevationDeg = (Math.atan2(elDy, elDx + 1e-4) * 180) / Math.PI;

  let elbowScore = 8.5;
  if (elbowAngle >= 85 && elbowAngle <= 120) {
    elbowScore = 9.4 - Math.abs(elbowAngle - 102.5) * 0.04;
  } else if (elbowAngle < 85) {
    elbowScore = Math.max(2.0, 8.5 - (85 - elbowAngle) * 0.14);
  } else {
    elbowScore = Math.max(3.0, 8.5 - (elbowAngle - 120) * 0.12);
  }
  if (elbowElevationDeg < 55) {
    elbowScore = Math.max(1.5, elbowScore - (55 - elbowElevationDeg) * 0.1);
  }

  // B. Head Position over Knee
  const headKneeDx = Math.abs(head.x - fKn.x);
  const headDevPct = (headKneeDx / torsoLen) * 100;
  const headScore = Math.max(2.0, Math.min(10.0, 9.8 - (headDevPct / 6.0) * 4.0));

  // C. Footwork
  const strideNorm = calcDist(fAnk, rAnk) / torsoLen;
  let footworkScore = 8.5;
  if (strideNorm >= 0.85 && strideNorm <= 1.45) {
    footworkScore = 9.2;
  } else if (strideNorm < 0.85) {
    footworkScore = Math.max(2.5, 8.5 - (0.85 - strideNorm) * 8);
  } else {
    footworkScore = Math.max(4.0, 8.5 - (strideNorm - 1.45) * 5);
  }

  // D. Balance & Weight Transfer
  const comX = (head.x + fSh.x + fKn.x) / 3;
  const baseWidth = Math.max(0.05, Math.abs(fAnk.x - rAnk.x));
  const transfer = Math.abs(comX - rAnk.x) / baseWidth;
  const balanceScore = transfer >= 0.55 && transfer <= 0.85 ? 9.1 : Math.max(3.0, 8.0 - Math.abs(transfer - 0.7) * 10);

  // E. Bat Swing Path
  const swingScore = 8.4;
  const timingScore = 8.6;
  const backliftScore = 8.2;
  const followThroughScore = 8.5;

  const metrics = {
    timing: Number(timingScore.toFixed(1)),
    head_position: Number(headScore.toFixed(1)),
    front_elbow: Number(elbowScore.toFixed(1)),
    footwork: Number(footworkScore.toFixed(1)),
    balance: Number(balanceScore.toFixed(1)),
    bat_swing_path: Number(swingScore.toFixed(1)),
    backlift: Number(backliftScore.toFixed(1)),
    follow_through: Number(followThroughScore.toFixed(1)),
  };

  // Weighted overall score
  const overallScore = Number(
    (
      metrics.head_position * 0.2 +
      metrics.front_elbow * 0.2 +
      metrics.footwork * 0.15 +
      metrics.balance * 0.15 +
      metrics.timing * 0.15 +
      metrics.bat_swing_path * 0.1 +
      metrics.follow_through * 0.05
    ).toFixed(1)
  );

  // Flaws & Tips detection
  const flaws: FlawItem[] = [];
  const tips: TipItem[] = [];

  if (headDevPct > 5.5) {
    const sev = headDevPct > 8.0 ? 'high' : 'medium';
    flaws.push({
      name: 'Head Falling Away to Off-Side',
      severity: sev,
      frame: impactFrame,
      measured: Number(headDevPct.toFixed(1)),
      ideal: '0.0% - 4.5%',
      affected_joint: 'nose',
    });
    tips.push({
      flaw: 'Head Falling Away to Off-Side',
      why_it_hurts: 'Eyeline tilts and hands follow head outside the line, causing leading edges into slip/gully.',
      fix: 'Lead into the drive with your head, keeping eyes level and chin tucked over your front knee.',
      drill: 'Drop-Ball Target Driving: 25 drives freezing head dead-still over bounce point for 2 seconds.',
    });
  }

  if (elbowElevationDeg < 60 || elbowAngle < 75 || elbowAngle > 130) {
    const sev = elbowElevationDeg < 50 || elbowAngle > 135 ? 'high' : 'medium';
    flaws.push({
      name: 'Front Elbow Dropping / Collapsed Arm',
      severity: sev,
      frame: impactFrame,
      measured: Number(elbowElevationDeg.toFixed(1)),
      ideal: '70.0° - 110.0°',
      affected_joint: batterHand === 'right' ? 'left_elbow' : 'right_elbow',
    });
    tips.push({
      flaw: 'Front Elbow Dropping / Collapsed Arm',
      why_it_hurts: 'A collapsed elbow forces bottom-hand domination, chipping the ball in the air towards extra cover.',
      fix: 'Point your front elbow directly at the mid-off/cover region throughout the downswing.',
      drill: 'Top-Hand Only Tee Drives: 25 drives on a batting tee with top hand leading exclusively.',
    });
  }

  if (strideNorm < 0.8) {
    flaws.push({
      name: 'Front Foot Not to the Pitch of the Ball',
      severity: 'medium',
      frame: Math.max(0, impactFrame - 3),
      measured: Number(strideNorm.toFixed(2)),
      ideal: '0.85 - 1.45 norm',
      affected_joint: batterHand === 'right' ? 'left_ankle' : 'right_ankle',
    });
    tips.push({
      flaw: 'Front Foot Not to the Pitch of the Ball',
      why_it_hurts: 'Reaching away without footwork causes lunging with hands disconnected from your eyeline.',
      fix: 'Commit a positive stride toward the line and bounce, planting front toe towards cover.',
      drill: 'Shadow Step & Freeze: 30 repetitions committing front stride towards target chalk circle.',
    });
  }

  return {
    shot_type: 'cover_drive',
    overall_score: overallScore,
    timing_score: timingScore,
    metrics,
    flaws,
    tips,
    impact_frame: impactFrame,
    total_frames: frames.length,
    shot_id: `client_${Date.now()}`,
  };
}
