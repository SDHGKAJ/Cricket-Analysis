/* ═══════════════════════════════════════════════════════════
   Hawk-Eye renderer — pure Canvas 2D, driven by trajectory JSON.

   drawVideoOverlay  view (a): tube + bounce + trail + stumps over the video
   drawPitch3D       view (b): virtual pitch from a broadcast camera angle
   drawCalibration   the clicked calibration points while calibrating

   Every drawer takes the current playback time, converts it to a (fractional)
   frame number, and only draws the path up to that frame — so the trail
   animates progressively in sync with video.currentTime.
   ═══════════════════════════════════════════════════════════ */
import type { Decision, Pitch3DPoint, Trajectory } from '../types/trajectory';

type XY = [number, number];

const COLORS = {
  glow: 'rgba(120, 195, 255, 0.85)',
  tubeOuter: 'rgba(150, 210, 255, 0.35)',
  tubeBody: 'rgba(232, 244, 255, 0.95)',
  tubeCore: 'rgba(255, 255, 255, 1)',
  predicted: 'rgba(170, 215, 255, 0.75)',
  bounce: 'rgba(120, 195, 255, 1)',
  ball: '#FF4D4F',
  stump: '#F4E9D2',
  hitting: '#FF4D4F',
  missing: '#3DD68C',
  umpire: '#F5B544',
};

export const DECISION_COLOR: Record<Decision, string> = {
  HITTING: COLORS.hitting,
  MISSING: COLORS.missing,
  "UMPIRE'S CALL": COLORS.umpire,
};

const TRAIL_LEN = 8;

/* ── helpers ─────────────────────────────────────────────── */

export const frameAt = (traj: Trajectory, timeMs: number) => (timeMs / 1000) * traj.fps;

/** Points with f <= cur, plus an interpolated tip exactly at cur (smooth growth). */
function upTo<T extends { f: number }>(pts: T[], cur: number, get: (p: T) => XY): XY[] {
  const out: XY[] = [];
  for (let i = 0; i < pts.length; i++) {
    if (pts[i].f <= cur) {
      out.push(get(pts[i]));
    } else {
      if (i > 0) {
        const a = pts[i - 1], b = pts[i];
        const k = (cur - a.f) / (b.f - a.f || 1);
        const pa = get(a), pb = get(b);
        out.push([pa[0] + (pb[0] - pa[0]) * k, pa[1] + (pb[1] - pa[1]) * k]);
      }
      break;
    }
  }
  return out;
}

/** Smooth polyline through points using quadratic curves between midpoints. */
function smoothPath(ctx: CanvasRenderingContext2D, pts: XY[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  if (pts.length === 2) {
    ctx.lineTo(pts[1][0], pts[1][1]);
    return;
  }
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last[0], last[1]);
}

/** 3D-looking tube: soft glow, translucent outer skin, bright body, white core. */
function drawTube(ctx: CanvasRenderingContext2D, pts: XY[], width: number, dashed = false) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (dashed) ctx.setLineDash([width * 1.8, width * 1.3]);

  ctx.shadowColor = COLORS.glow;
  ctx.shadowBlur = width * 2.2;
  ctx.strokeStyle = dashed ? 'rgba(150, 210, 255, 0.18)' : COLORS.tubeOuter;
  ctx.lineWidth = width * 2.1;
  smoothPath(ctx, pts);
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = dashed ? COLORS.predicted : COLORS.tubeBody;
  ctx.lineWidth = width;
  smoothPath(ctx, pts);
  ctx.stroke();

  if (!dashed) {
    ctx.strokeStyle = COLORS.tubeCore;
    ctx.lineWidth = Math.max(1, width * 0.32);
    smoothPath(ctx, pts);
    ctx.stroke();
  }
  ctx.restore();
}

/** Glowing ring lying on the ground (ellipse squashed for perspective). */
function drawRing(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  ctx.save();
  ctx.shadowColor = COLORS.glow;
  ctx.shadowBlur = rx * 0.8;
  ctx.strokeStyle = COLORS.bounce;
  ctx.lineWidth = Math.max(2, rx * 0.22);
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(120, 195, 255, 0.25)';
  ctx.fill();
  ctx.restore();
}

/** Fading trail of the last N positions + the current ball marker. */
function drawBall(ctx: CanvasRenderingContext2D, trail: XY[], r: number) {
  const n = trail.length;
  trail.forEach((p, i) => {
    const a = (i + 1) / n;
    ctx.beginPath();
    ctx.arc(p[0], p[1], r * (0.45 + 0.4 * a), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 77, 79, ${0.12 + 0.35 * a})`;
    ctx.fill();
  });
  const [x, y] = trail[n - 1];
  ctx.save();
  ctx.shadowColor = COLORS.ball;
  ctx.shadowBlur = r * 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.ball;
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.25);
  ctx.strokeStyle = '#FFFFFF';
  ctx.stroke();
  ctx.restore();
}

function drawStumps(ctx: CanvasRenderingContext2D, base: XY[], top: XY[], width: number) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = width + 2;
  base.forEach((b, i) => { ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(top[i][0], top[i][1]); ctx.stroke(); });
  ctx.strokeStyle = COLORS.stump;
  ctx.lineWidth = width;
  base.forEach((b, i) => { ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(top[i][0], top[i][1]); ctx.stroke(); });
  // bails: two short bars across the stump tops
  ctx.lineWidth = Math.max(1.5, width * 0.6);
  for (let i = 0; i < top.length - 1; i++) {
    ctx.beginPath();
    ctx.moveTo(top[i][0], top[i][1] - width * 0.4);
    ctx.lineTo(top[i + 1][0], top[i + 1][1] - width * 0.4);
    ctx.stroke();
  }
  ctx.restore();
}

function drawImpact(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, decision: Decision | null) {
  const c = decision ? DECISION_COLOR[decision] : COLORS.umpire;
  ctx.save();
  ctx.shadowColor = c;
  ctx.shadowBlur = r * 2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = c;
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.3);
  ctx.strokeStyle = '#FFFFFF';
  ctx.stroke();
  ctx.restore();
}

/** Stacked label badges in the top-left corner. */
function drawBadges(ctx: CanvasRenderingContext2D, w: number, h: number, labels: Array<{ text: string; color: string }>) {
  const s = Math.max(0.6, Math.min(w, h) / 600);
  let y = 14 * s;
  ctx.save();
  ctx.font = `700 ${Math.round(15 * s)}px "Barlow Condensed", Inter, system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  for (const { text, color } of labels) {
    const tw = ctx.measureText(text).width;
    const bw = tw + 22 * s, bh = 26 * s, x = 14 * s;
    ctx.fillStyle = 'rgba(13, 16, 21, 0.82)';
    ctx.beginPath();
    ctx.roundRect(x, y, bw, bh, 5 * s);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 4 * s, bh);
    ctx.fillStyle = '#F3F5F8';
    ctx.fillText(text, x + 13 * s, y + bh / 2 + 1);
    y += bh + 6 * s;
  }
  ctx.restore();
}

function decisionBadges(traj: Trajectory): Array<{ text: string; color: string }> {
  const d = traj.metrics.decision;
  if (!d) return [];
  const out: Array<{ text: string; color: string }> = [{ text: d, color: DECISION_COLOR[d] }];
  if (traj.metrics.reviewRetained) out.push({ text: 'REVIEW RETAINED', color: COLORS.umpire });
  return out;
}

/* ── view (a): over the original video ───────────────────── */

export function drawVideoOverlay(
  ctx: CanvasRenderingContext2D, w: number, h: number, timeMs: number, traj: Trajectory,
) {
  if (traj.status !== 'ok' || !traj.frames.length) return;
  const sx = w / traj.width, sy = h / traj.height;
  const P = (x: number, y: number): XY => [x * sx, y * sy];
  const cur = frameAt(traj, timeMs);
  const unit = Math.max(3, Math.min(w, h) * 0.011);
  const first = traj.frames[0].f;
  const lastObserved = traj.frames[traj.frames.length - 1].f;

  if (traj.stumps) {
    drawStumps(ctx, traj.stumps.base.map(([x, y]) => P(x, y)), traj.stumps.top.map(([x, y]) => P(x, y)), unit * 0.9);
  }
  if (cur < first) return;

  // observed path (pre + post bounce) grows with playback
  drawTube(ctx, upTo(traj.frames, cur, (p) => P(p.x, p.y)), unit);

  // predicted continuation to the stump plane: dashed, after the last real frame
  if (traj.predicted.length && cur >= lastObserved) {
    drawTube(ctx, upTo(traj.predicted, cur, (p) => P(p.x, p.y)), unit * 0.85, true);
  }

  if (traj.bounce && cur >= traj.bounce.frame) {
    const [bx, by] = P(traj.bounce.x, traj.bounce.y);
    drawRing(ctx, bx, by, unit * 2.4, unit * 1.0);
  }

  // ball marker + fading trail while the ball is being tracked
  if (cur <= lastObserved + 2) {
    const trail = upTo(traj.frames, cur, (p) => P(p.x, p.y)).slice(-TRAIL_LEN);
    if (trail.length) drawBall(ctx, trail, unit * 1.1);
  }

  // bat-ball contact: a burst where the ball met the bat, held for ~1 s
  const c = traj.contact;
  if (c && c.x != null && c.y != null && cur >= c.frame && cur <= c.frame + traj.fps) {
    const [cx, cy] = P(c.x, c.y);
    drawContact(ctx, cx, cy, unit * 2.2, (cur - c.frame) / traj.fps);
  }

  if (traj.impact && cur >= traj.impact.f) {
    const [ix, iy] = P(traj.impact.x, traj.impact.y);
    drawImpact(ctx, ix, iy, unit * 1.3, traj.metrics.decision);
    drawBadges(ctx, w, h, decisionBadges(traj));
  }
}

/** Starburst + "CONTACT" label; `age` 0..1 fades it out over a second. */
function drawContact(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, age: number) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - age);
  ctx.strokeStyle = COLORS.umpire;
  ctx.shadowColor = COLORS.umpire;
  ctx.shadowBlur = r;
  ctx.lineWidth = Math.max(2, r * 0.18);
  const grow = 1 + age * 0.8;
  for (let k = 0; k < 10; k++) {
    const t = (k / 10) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(t) * r * 0.55 * grow, y + Math.sin(t) * r * 0.55 * grow);
    ctx.lineTo(x + Math.cos(t) * r * 1.25 * grow, y + Math.sin(t) * r * 1.25 * grow);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.font = `700 ${Math.round(r * 0.9)}px "Barlow Condensed", Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(13,16,21,0.85)';
  ctx.strokeText('CONTACT', x, y - r * 1.6);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('CONTACT', x, y - r * 1.6);
  ctx.restore();
}

/* ── view (b): virtual 3D pitch, broadcast camera ────────── */

const PITCH_LEN = 20.12;
const CREASE_HALF = 1.32;
const POPPING = 1.22;
const POPPING_HALF = 1.83;
const PITCH_HALF_W = 1.525;
const STUMP_H = 0.711;

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Pinhole camera behind and above the bowler, looking down the pitch. */
function makeCamera(w: number, h: number) {
  // slightly off-centre and high, like the broadcast Hawk-Eye angle, so the
  // ball's arc (height) is visible instead of collapsing onto the pitch line
  const eye: V3 = [2.6, PITCH_LEN + 8.0, 5.6];
  const target: V3 = [0, 4.5, 0.4];
  const fwd = norm(sub(target, eye));
  const right = norm(cross([0, 0, 1], fwd));   // +x appears on screen-right
  const up = cross(fwd, right);
  const f = Math.min(w * 2.6, h * 2.2);
  return (p: V3): XY | null => {
    const d = sub(p, eye);
    const z = dot(d, fwd);
    if (z <= 0.1) return null;
    return [w / 2 + (f * dot(d, right)) / z, h * 0.5 - (f * dot(d, up)) / z];
  };
}

function poly(ctx: CanvasRenderingContext2D, proj: (p: V3) => XY | null, pts: V3[]) {
  const s = pts.map(proj);
  if (s.some((q) => !q)) return false;
  ctx.beginPath();
  s.forEach((q, i) => (i ? ctx.lineTo(q![0], q![1]) : ctx.moveTo(q![0], q![1])));
  return true;
}

function line3(ctx: CanvasRenderingContext2D, proj: (p: V3) => XY | null, a: V3, b: V3) {
  const pa = proj(a), pb = proj(b);
  if (!pa || !pb) return;
  ctx.beginPath();
  ctx.moveTo(pa[0], pa[1]);
  ctx.lineTo(pb[0], pb[1]);
  ctx.stroke();
}

function drawPitchScene(ctx: CanvasRenderingContext2D, w: number, h: number, proj: (p: V3) => XY | null) {
  // sky + outfield
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#0B1A2C');
  sky.addColorStop(0.45, '#123A2A');
  sky.addColorStop(1, '#1F5A35');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // mown stripes on the outfield around the pitch
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  for (let y = -6; y < PITCH_LEN + 8; y += 4) {
    if (poly(ctx, proj, [[-12, y, 0], [12, y, 0], [12, y + 2, 0], [-12, y + 2, 0]])) ctx.fill();
  }

  // pitch strip
  ctx.fillStyle = '#C9B38A';
  if (poly(ctx, proj, [[-PITCH_HALF_W, -1.5, 0], [PITCH_HALF_W, -1.5, 0], [PITCH_HALF_W, PITCH_LEN + 1.5, 0], [-PITCH_HALF_W, PITCH_LEN + 1.5, 0]])) {
    ctx.fill();
  }

  // creases
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = Math.max(1, Math.min(w, h) / 400);
  for (const y0 of [0, PITCH_LEN]) {
    line3(ctx, proj, [-CREASE_HALF, y0, 0], [CREASE_HALF, y0, 0]);                 // bowling crease
    const yp = y0 === 0 ? POPPING : PITCH_LEN - POPPING;
    line3(ctx, proj, [-POPPING_HALF, yp, 0], [POPPING_HALF, yp, 0]);              // popping crease
    for (const sx of [-CREASE_HALF, CREASE_HALF]) line3(ctx, proj, [sx, y0 - 1.2, 0], [sx, yp, 0]); // return creases
  }

  // stumps at both ends
  for (const y0 of [PITCH_LEN, 0]) {
    const base: XY[] = [], top: XY[] = [];
    for (const sx of [-0.095, 0, 0.095]) {
      const b = proj([sx, y0, 0]), t = proj([sx, y0, STUMP_H]);
      if (b && t) { base.push(b); top.push(t); }
    }
    if (base.length === 3) {
      const near = proj([0, y0, 0]);
      const far = proj([0.2, y0, 0]);
      const px = near && far ? Math.abs(far[0] - near[0]) / 0.2 : 20;   // px per metre at that depth
      drawStumps(ctx, base, top, Math.max(1.5, px * 0.04));
    }
  }
}

export function drawPitch3D(
  ctx: CanvasRenderingContext2D, w: number, h: number, timeMs: number, traj: Trajectory | null,
) {
  const proj = makeCamera(w, h);
  drawPitchScene(ctx, w, h, proj);

  const p3 = traj?.pitch3d;
  if (!traj || !p3) {
    const s = Math.max(0.7, Math.min(w, h) / 600);
    ctx.save();
    ctx.fillStyle = 'rgba(13, 16, 21, 0.78)';
    const bw = Math.min(w - 40, 420 * s), bh = 78 * s;
    ctx.beginPath();
    ctx.roundRect((w - bw) / 2, h * 0.12, bw, bh, 10 * s);
    ctx.fill();
    ctx.fillStyle = '#F3F5F8';
    ctx.textAlign = 'center';
    ctx.font = `600 ${Math.round(16 * s)}px Inter, system-ui, sans-serif`;
    ctx.fillText(traj?.calibrated ? 'No bounce found — no 3D reconstruction' : 'Calibrate the pitch to see the 3D path',
      w / 2, h * 0.12 + bh * 0.42);
    ctx.fillStyle = '#A9B1BD';
    ctx.font = `${Math.round(12 * s)}px Inter, system-ui, sans-serif`;
    ctx.fillText(traj?.calibrated ? 'Needs a visible bounce in the clip' : '5 clicks on the video: crease ends + stump top',
      w / 2, h * 0.12 + bh * 0.72);
    ctx.restore();
    return;
  }

  const cur = frameAt(traj, timeMs);
  const toXY = (p: Pitch3DPoint) => proj([p.x, p.y, p.z]);
  const observed = p3.path.filter((p) => !p.predicted);
  const predicted = p3.path.filter((p, i, a) => p.predicted || (i + 1 < a.length && a[i + 1].predicted));
  const near = proj([0, 0, 0]), nearR = proj([0.1, 0, 0]);
  const unit = near && nearR ? Math.max(3, Math.abs(nearR[0] - near[0]) * 0.8) : 4;

  // ground shadow of the path
  const shadow = upTo(p3.path, cur, (p) => proj([p.x, p.y, 0]) ?? [0, 0]);
  if (shadow.length > 1) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = unit;
    ctx.lineCap = 'round';
    smoothPath(ctx, shadow);
    ctx.stroke();
    ctx.restore();
  }

  drawTube(ctx, upTo(observed, cur, (p) => toXY(p) ?? [0, 0]), unit);
  const lastObs = observed.length ? observed[observed.length - 1].f : 0;
  if (cur >= lastObs) drawTube(ctx, upTo(predicted, cur, (p) => toXY(p) ?? [0, 0]), unit * 0.85, true);

  const bounceF = observed.reduce((best, p) => (p.z < best.z ? p : best), observed[0])?.f ?? Infinity;
  if (cur >= bounceF) {
    const c = proj([p3.bounce.x, p3.bounce.y, 0]);
    const e = proj([p3.bounce.x + 0.18, p3.bounce.y, 0]);
    const n = proj([p3.bounce.x, p3.bounce.y + 0.18, 0]);
    if (c && e && n) drawRing(ctx, c[0], c[1], Math.abs(e[0] - c[0]), Math.max(2, Math.abs(n[1] - c[1])));
  }

  // moving ball while within the path
  const end = p3.path[p3.path.length - 1].f;
  if (cur <= end) {
    const trail = upTo(p3.path, cur, (p) => toXY(p) ?? [0, 0]).slice(-TRAIL_LEN);
    if (trail.length) drawBall(ctx, trail, unit * 1.2);
  }

  if (traj.impact && cur >= traj.impact.f) {
    const ip = proj([p3.impact.x, 0, p3.impact.z]);
    if (ip) drawImpact(ctx, ip[0], ip[1], unit * 1.4, traj.metrics.decision);
    drawBadges(ctx, w, h, decisionBadges(traj));
  }
}

/* ── calibration markers ─────────────────────────────────── */

export const CALIBRATION_STEPS = [
  "Batter's end crease — left end",
  "Batter's end crease — right end",
  "Bowler's end crease — left end",
  "Bowler's end crease — right end",
  "Top of the middle stump (batter's end)",
];

export function drawCalibration(ctx: CanvasRenderingContext2D, w: number, h: number, points: XY[]) {
  const r = Math.max(5, Math.min(w, h) * 0.012);
  ctx.save();
  ctx.lineWidth = Math.max(1.5, r * 0.35);
  ctx.strokeStyle = 'rgba(91, 140, 255, 0.9)';
  if (points.length >= 2) { ctx.beginPath(); ctx.moveTo(...points[0]); ctx.lineTo(...points[1]); ctx.stroke(); }
  if (points.length >= 4) { ctx.beginPath(); ctx.moveTo(...points[2]); ctx.lineTo(...points[3]); ctx.stroke(); }
  ctx.font = `700 ${Math.round(r * 1.6)}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  points.forEach(([x, y], i) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#5B8CFF';
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(String(i + 1), x, y - r * 2);
  });
  ctx.restore();
}
