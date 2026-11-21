"""Tests for tapped-batter tracking (app/engine/subject.py)."""
import numpy as np

from app.engine.subject import HOLD_FRAMES, SubjectPoseDetector, SubjectTrack, _follow


def test_follow_keeps_the_tapped_person_when_another_passes_by():
    # batter stands still at x~200; bowler runs across from x=600 to x=150
    dets = []
    for j in range(20):
        batter = (190 + 0.5 * j, 300, 230 + 0.5 * j, 420)
        bowler = (600 - 23 * j, 200, 720 - 23 * j, 560)          # bigger, moving
        dets.append([bowler, batter])
    out = _follow(dets, 0, dets[0][1], range(1, 20))
    assert all(abs(out[j][0] - (190 + 0.5 * j)) < 1 for j in range(20)), "switched to the bowler"


def test_follow_holds_through_short_gaps_then_lets_go():
    box = (100, 100, 140, 200)
    dets = [[box]] + [[] for _ in range(HOLD_FRAMES + 5)]
    out = _follow(dets, 0, box, range(1, len(dets)))
    assert all(out[j] == box for j in range(1, HOLD_FRAMES + 1))
    assert HOLD_FRAMES + 1 not in out


class _Lm:
    def __init__(self, x, y):
        self.x, self.y, self.z, self.visibility = x, y, 0.0, 0.9


class _FakePose:
    """Returns one landmark at the centre of whatever image it is given."""
    def __init__(self):
        self.shapes = []

    def detect(self, img, ts):
        self.shapes.append(img.shape[:2])
        return [_Lm(0.5, 0.5)]

    def close(self):
        pass


def test_crop_landmarks_are_mapped_back_to_the_whole_frame():
    track = SubjectTrack(crops=[(100, 200, 300, 400), None], boxes=[None, None],
                         fps=30.0, width=1000, height=800, start_frame=0)
    base = _FakePose()
    det = SubjectPoseDetector(base, track)
    frame = np.zeros((800, 1000, 3), np.uint8)
    lms = det.detect(frame, 0.0)
    assert base.shapes == [(200, 200)]                      # pose ran on the crop only
    assert (lms[0].x, lms[0].y) == (0.2, 0.375)              # crop centre (200, 300) in whole-frame terms
    assert det.detect(frame, 1000 / 30.0) is None            # no subject box -> no pose (never the full frame)
