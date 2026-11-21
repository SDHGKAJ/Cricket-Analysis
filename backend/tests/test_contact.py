"""Tests for audio + vision bat-ball contact fusion (app/engine/contact.py)."""
import numpy as np
import pytest

from app.engine import contact as C

FPS = 30.0


def _det(n=60, ball_frames=()):
    """Synthetic analyzer output: a batter whose hands swing fast around frame 40.

    Hands at (300, 300) with a torso of 100 px; ball positions as given.
    """
    mp_xy, mp_vis = [], []
    for i in range(n):
        xy = np.zeros((33, 2), np.float32)
        hx = 300 + (8 * (i - 35) if 35 <= i <= 45 else (80 if i > 45 else 0))   # swing burst
        xy[C.MP_L_WR] = xy[C.MP_R_WR] = (hx, 300)
        xy[C.MP_L_SH] = xy[C.MP_R_SH] = (hx, 200)
        xy[C.MP_L_HIP] = xy[C.MP_R_HIP] = (hx, 300)
        mp_xy.append(xy)
        mp_vis.append(np.ones(33, np.float32))
    balls = [None] * n
    for f, p in ball_frames:
        balls[f] = np.array(p, np.float32)
    return {"fps": FPS, "n": n, "mp_xy": mp_xy, "mp_vis": mp_vis, "balls": balls}


def _fallback():
    return None, {"status": "not detected", "frame": None, "method": None}


@pytest.fixture
def sounds(monkeypatch):
    def set_(onsets):
        monkeypatch.setattr(C, "audio_onsets", lambda path: onsets)
    return set_


def test_picks_earliest_sound_with_ball_in_reach(sounds):
    # 1.20 s (f36): ball far away (floor bounce) -> rejected
    # 1.33 s (f40): ball at the bat -> contact
    # 1.45 s (f43.5): later bat-on-floor crack -> ignored
    sounds([{"t": 1.20, "onset_db": 15, "level_db": 25},
            {"t": 1.333, "onset_db": 20, "level_db": 30},
            {"t": 1.45, "onset_db": 22, "level_db": 38}])
    det = _det(ball_frames=[(36, (900, 700)), (40, (420, 330))])
    f, rep = C.detect_contact("x.mp4", det, _fallback)
    assert f == 40
    assert rep["method"] == "audio+vision" and rep["confidence"] == "high"
    assert [c["passes"] for c in rep["candidates"]] == [False, True]


def test_local_search_finds_ball_the_tracker_missed(sounds, monkeypatch):
    sounds([{"t": 1.333, "onset_db": 20, "level_db": 30}])
    det = _det()                                         # tracker saw no ball at all
    monkeypatch.setattr(C, "local_search", lambda path, det, f, search: (np.array([410.0, 320.0]), 0.45, 40))
    f, rep = C.detect_contact("x.mp4", det, _fallback, ball_search=lambda frame: [])
    assert f == 40 and rep["confidence"] == "high"
    assert rep["candidates"][0]["local_conf"] == 0.45


def test_sound_outside_the_swing_is_ignored(sounds):
    sounds([{"t": 0.2, "onset_db": 25, "level_db": 40}])  # frame 6, long before the swing
    f, rep = C.detect_contact("x.mp4", _det(), _fallback)
    assert f is None
    assert rep["audio"]["candidates"] == []


def test_no_audio_falls_back_to_vision(sounds):
    sounds(None)
    f, rep = C.detect_contact("x.mp4", _det(), lambda: (12, {"status": "ok", "frame": 12, "method": "vision"}))
    assert f == 12 and rep["audio"] == "no audio track"


def test_ball_unknown_gives_low_confidence(sounds):
    sounds([{"t": 1.333, "onset_db": 20, "level_db": 30}])
    f, rep = C.detect_contact("x.mp4", _det(), _fallback)
    assert f == 40 and rep["method"] == "audio+swing" and rep["confidence"] == "low"


def test_ball_seen_just_before_the_crack_not_credited_to_an_earlier_sound(sounds):
    """Two sounds ~4 frames apart (ball hits the floor, then the bat). The ball is
    seen at the bat at frame 38, just before the second crack (frame 40.5) — it
    must not be credited to the first sound (frame 36), which a symmetric +/-2
    window would have reached."""
    sounds([{"t": 36 / FPS, "onset_db": 13, "level_db": 20},
            {"t": 40.5 / FPS, "onset_db": 20, "level_db": 29}])
    det = _det(ball_frames=[(35, (900, 700)), (38, (420, 330))])
    f, rep = C.detect_contact("x.mp4", det, _fallback)
    assert f == 40 or f == 41
    assert [c["passes"] for c in rep["candidates"]] == [False, True]


def test_sound_before_the_ball_appears_is_not_contact(sounds):
    """A loud sound during the bowler's run-up (before the ball is ever seen)
    can't be the hit, even if the batter's hands happen to move then."""
    sounds([{"t": 36 / FPS, "onset_db": 20, "level_db": 30}])        # frame 36, swing window
    det = _det(ball_frames=[(50, (900, 700)), (52, (880, 690))])     # ball first seen at frame 50
    f, rep = C.detect_contact("x.mp4", det, _fallback)
    assert f is None and rep["audio"]["candidates"] == []
