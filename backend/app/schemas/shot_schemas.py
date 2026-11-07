from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

class FlawItem(BaseModel):
    name: str
    severity: str  # low | medium | high
    frame: int
    measured: float
    ideal: str
    affected_joint: Optional[str] = None

class TipItem(BaseModel):
    flaw: str
    why_it_hurts: Optional[str] = None
    fix: str
    drill: str

class ShotAnalysisResponse(BaseModel):
    shot_type: str = "cover_drive"
    overall_score: float = Field(..., ge=0.0, le=10.0)
    timing_score: float = Field(..., ge=0.0, le=10.0)
    metrics: Dict[str, float]
    flaws: List[FlawItem]
    tips: List[TipItem]
    impact_frame: Optional[int] = 0
    total_frames: Optional[int] = 0
    shot_id: Optional[str] = None
    replay_url: Optional[str] = None
    pose_video_url: Optional[str] = None
    frames: List[FrameLandmarks] = []

class LandmarkPoint(BaseModel):
    x: float
    y: float
    z: Optional[float] = 0.0
    visibility: Optional[float] = 1.0

class FrameLandmarks(BaseModel):
    frame_index: int
    timestamp_ms: float
    landmarks: List[LandmarkPoint]
    ball_position: Optional[Dict[str, float]] = None
    bat_tip: Optional[Dict[str, float]] = None

class AnalyzeShotSequenceRequest(BaseModel):
    session_id: Optional[str] = None
    camera_angle: str = "front_on"  # front_on | side_on
    batter_hand: str = "right"      # right | left
    shot_type_hint: Optional[str] = "cover_drive"
    frames: List[FrameLandmarks]

class SessionCreate(BaseModel):
    player_name: str = "Batter"
    camera_angle: str = "front_on"
    batter_hand: str = "right"
    notes: Optional[str] = None

class SessionResponse(BaseModel):
    id: str
    player_name: str
    camera_angle: str
    batter_hand: str
    created_at: str
    shot_count: int
    avg_score: float
    shots: List[ShotAnalysisResponse] = []
