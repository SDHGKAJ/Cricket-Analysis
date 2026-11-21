"""Tests for the Hawk-Eye-style trajectory module (app/engine/trajectory.py)."""
import numpy as np
import pytest

from app.engine.trajectory import (
    DEFAULTS, PitchCalibration, build_trajectory, clean_detections, decision_at_stumps,
    detect_bounce, interpolate_track, length_category, line_category,
)

FPS = 30.0
# Camera behind the bowler: the batter's crease is far away (higher, narrower).
CAL = {
    "batterEnd": [[400, 200], [480, 200]],
    "bowlerEnd": [[250, 600], [630, 600]],
    "stumpTop": [440, 168],
}


def _delivery(bounce_at=10, n=18, noise=0.0, seed=0):
    """Synthetic image track: falls (y grows) to a bounce, then rises."""
    rng = np.random.default_rng(seed)
    dets = []
    for i in range(n):
        if i <= bounce_at:
            y = 330 + 0.9 * i ** 2 + 4 * i           # accelerating down the screen
            x = 440 + 0.6 * i
        else:
            k = i - bounce_at
            y = 330 + 0.9 * bounce_at ** 2 + 4 * bounce_at - 9 * k + 0.4 * k ** 2
            x = 440 + 0.6 * bounce_at + 1.2 * k
        dets.append({"f": 100 + i, "x": x + rng.normal(0, noise), "y": y + rng.normal(0, noise), "conf": 0.8})
    return dets


def test_low_confidence_and_outliers_are_dropped():
    dets = _delivery()
    dets[3]["conf"] = 0.2                     # below 0.4 -> dropped
    dets[7] = {**dets[7], "x": dets[7]["x"] + 120}  # spike -> Hampel outlier
    f, x, y, dropped = clean_detections(dets, DEFAULTS)
    assert dropped == {"lowConf": 1, "outliers": 1}
    assert 103 not in f and 107 not in f


def test_short_gaps_are_interpolated_long_gaps_split():
    f = np.array([0, 1, 2, 5, 6, 7, 8, 20, 21], dtype=float)
    v = f * 2.0
    fi, xi, yi, interp = interpolate_track(f, v, v, max_gap=5)
    assert fi[0] == 0 and fi[-1] == 8               # longest run kept, 20-21 dropped
    assert list(fi[interp]) == [3, 4]               # gap filled
    assert np.allclose(xi, fi * 2.0)


def test_bounce_side_on_sign_flip_and_behind_bowler_kink():
    t = np.arange(12) / FPS
    x = np.linspace(100, 200, 12)
    y_flip = np.r_[[10 + 3 * i * i for i in range(7)], [118 - 20 * k for k in range(1, 6)]]
    assert detect_bounce(t, x, y_flip, FPS, 3, 2.0) == 6
    # behind the bowler: y keeps decreasing, the bounce is a kink (velocity jump)
    y_kink = np.r_[[500 - 12 * i + 0.8 * i * i for i in range(7)], [458.8 - 15 * k for k in range(1, 6)]]
    assert detect_bounce(t, x, y_kink, FPS, 3, 2.0) == 6
    # one smooth curve: no bounce
    assert detect_bounce(t, x, 400 - 5 * np.arange(12) + 0.3 * np.arange(12) ** 2, FPS, 3, 2.0) is None


def test_classifiers():
    assert length_category(1.0) == "yorker"
    assert length_category(4.0) == "full"
    assert length_category(7.0) == "good"
    assert length_category(10.0) == "short"
    assert line_category(0.0) == "middle"
    assert line_category(0.08) == "off stump"
    assert line_category(-0.2) == "outside leg"
    assert decision_at_stumps(0.02, 0.3) == "HITTING"
    assert decision_at_stumps(0.13, 0.3) == "UMPIRE'S CALL"
    assert decision_at_stumps(0.40, 0.3) == "MISSING"
    assert decision_at_stumps(0.02, 1.2) == "MISSING"     # over the top


def test_uncalibrated_run_gives_path_but_no_invented_metrics():
    out = build_trajectory(_delivery(noise=0.5), FPS, 960, 720)
    assert out["status"] == "ok"
    assert out["bounce"] is not None and out["bounce"]["frame"] == 110
    assert out["frames"][0]["segment"] == "pre" and out["frames"][-1]["segment"] == "post"
    m = out["metrics"]
    assert m["speed"] is None and m["decision"] is None and m["length"] is None
    assert out["predicted"] == [] and out["pitch3d"] is None
    assert any("Calibrate" in n for n in out["notes"])


def test_calibration_geometry():
    cal = PitchCalibration.from_points(CAL, "right")
    assert cal.behind_bowler is True
    assert cal.off_sign == -1                       # RH batter, behind bowler: off side on screen-left
    bx, by = cal.pitch_to_img(0.0, 0.0)
    assert (bx, by) == pytest.approx((440, 200), abs=0.5)
    assert cal.at_stumps(440, 168) == pytest.approx((0.0, 0.711), abs=0.01)


def test_calibrated_run_produces_metrics_and_prediction():
    out = build_trajectory(_delivery(), FPS, 960, 720, calibration=CAL, batter_hand="right")
    assert out["calibrated"] and out["stumps"] is not None
    m = out["metrics"]
    assert m["length"] in {"yorker", "full", "good", "short"}
    assert m["line"] is not None
    if m["speed"] is not None:                      # plausible-speed gate may refuse synthetic data
        assert m["decision"] in {"HITTING", "MISSING", "UMPIRE'S CALL"}
        assert out["pitch3d"]["path"][0]["z"] == pytest.approx(2.0, abs=0.05)


def test_bad_calibration_is_reported_not_crashing():
    out = build_trajectory(_delivery(), FPS, 960, 720,
                           calibration={"batterEnd": [[1, 1], [1, 1]], "bowlerEnd": [[1, 1], [1, 1]], "stumpTop": [1, 1]})
    assert out["calibrated"] is False
    assert any("Calibration ignored" in n for n in out["notes"])


def test_too_few_detections():
    out = build_trajectory(_delivery()[:4], FPS, 960, 720)
    assert out["status"] == "insufficient" and out["frames"] == []


# ── Ground truth: a known delivery projected through a broadcast-style camera ──
def _camera():
    C = np.array([0.0, 30.0, 5.0]); tgt = np.array([0.0, 3.0, 0.5]); F = 1500.0; W, H = 1280, 720
    fwd = (tgt - C) / np.linalg.norm(tgt - C)
    right = np.cross(fwd, [0, 0, 1.0]); right /= np.linalg.norm(right)
    up = np.cross(right, fwd)

    def proj(P):
        d = np.asarray(P, float) - C
        return [W / 2 + F * (d @ right) / (d @ fwd), H / 2 - F * (d @ up) / (d @ fwd)]
    return proj, W, H


def _projected_delivery(xs_true, hs_true):
    """126 km/h, pitches 6 m out, reaches the stumps at (xs_true, hs_true).

    Generated with the same assumptions the module documents (release 18.9 m /
    2.0 m, 90% speed kept), so a correct pipeline must recover these values.
    """
    from app.engine.trajectory import GRAVITY as g
    proj, W, H = _camera()
    pair = lambda a, b: sorted([proj(a), proj(b)])          # clicks are screen-left first
    cal = {"batterEnd": pair([-1.32, 0, 0], [1.32, 0, 0]),
           "bowlerEnd": pair([-1.32, 20.12, 0], [1.32, 20.12, 0]),
           "stumpTop": proj([0, 0, 0.711])}
    v, yr, xr, hr, yb, xb = 35.0, 18.9, 0.0, 2.0, 6.0, 0.0
    T1 = (yr - yb) / v; vz1 = (g * T1 ** 2 / 2 - hr) / T1
    T2 = yb / (0.9 * v); vz2 = (hs_true + g * T2 ** 2 / 2) / T2
    dets = []
    for k in range(60):
        t = k / FPS
        if t <= T1:
            s = t / T1; P = [xr + (xb - xr) * s, yr - v * t, hr + vz1 * t - g * t * t / 2]
        else:
            tau = t - T1
            if tau > T2 * 0.6:                       # stop short: the stumps must be predicted
                break
            P = [xb + (xs_true - xb) * tau / T2, yb - 0.9 * v * tau, vz2 * tau - g * tau * tau / 2]
        u, w = proj(P)
        dets.append({"f": k, "x": u, "y": w, "conf": 0.9})
    return dets, cal, W, H


def test_projected_delivery_hitting():
    dets, cal, W, H = _projected_delivery(xs_true=0.0, hs_true=0.35)
    out = build_trajectory(dets, FPS, W, H, calibration=cal, batter_hand="right")
    m = out["metrics"]
    assert out["bounce"] is not None
    assert m["lengthM"] == pytest.approx(6.0, abs=0.3) and m["length"] == "good"
    assert m["speed"] == pytest.approx(126, rel=0.1)
    assert m["heightAtStumps"] == pytest.approx(0.35, abs=0.12)
    assert m["decision"] == "HITTING"
    assert out["predicted"], "stumps were not in view, so the path must be extrapolated"
    assert out["pitch3d"]["path"][-1]["predicted"] is True


def test_projected_delivery_missing_wide():
    dets, cal, W, H = _projected_delivery(xs_true=0.45, hs_true=0.35)
    out = build_trajectory(dets, FPS, W, H, calibration=cal, batter_hand="right")
    assert out["metrics"]["decision"] == "MISSING"
