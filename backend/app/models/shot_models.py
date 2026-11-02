import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, JSON, ForeignKey, Text
from sqlalchemy.orm import relationship
from ..database import Base

class SessionModel(Base):
    __tablename__ = "sessions"

    id = Column(String, primary_key=True, index=True)
    player_name = Column(String, default="Batter")
    camera_angle = Column(String, default="front_on")
    batter_hand = Column(String, default="right")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    notes = Column(Text, nullable=True)

    shots = relationship("ShotRecordModel", back_populates="session", cascade="all, delete-orphan")

class ShotRecordModel(Base):
    __tablename__ = "shot_records"

    id = Column(String, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=True)
    shot_type = Column(String, default="cover_drive")
    overall_score = Column(Float, nullable=False)
    timing_score = Column(Float, nullable=False)
    metrics = Column(JSON, nullable=False)
    flaws = Column(JSON, nullable=False)
    tips = Column(JSON, nullable=False)
    impact_frame = Column(Integer, default=0)
    total_frames = Column(Integer, default=0)
    video_path = Column(String, nullable=True)
    replay_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    session = relationship("SessionModel", back_populates="shots")
