import { ShotAnalysis, FrameLandmarks, CameraAngle, BatterHand, SessionRecord } from '../types/cricket';

const API_BASE = '/api';

export async function analyzeShotOnServer(
  frames: FrameLandmarks[],
  cameraAngle: CameraAngle,
  batterHand: BatterHand,
  sessionId?: string
): Promise<ShotAnalysis> {
  const response = await fetch(`${API_BASE}/analyze-shot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      camera_angle: cameraAngle,
      batter_hand: batterHand,
      shot_type_hint: 'cover_drive',
      frames: frames,
    }),
  });

  if (!response.ok) {
    throw new Error(`Server analysis failed: ${response.statusText}`);
  }
  return response.json();
}

export async function uploadVideoShot(
  videoFile: File,
  cameraAngle: CameraAngle,
  batterHand: BatterHand,
  sessionId?: string
): Promise<ShotAnalysis> {
  const formData = new FormData();
  formData.append('file', videoFile);
  formData.append('camera_angle', cameraAngle);
  formData.append('batter_hand', batterHand);
  if (sessionId) formData.append('session_id', sessionId);

  const response = await fetch(`${API_BASE}/analyze-video`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Video upload failed: ${response.statusText}`);
  }
  return response.json();
}

export async function createBattingSession(
  playerName: string = 'Batter',
  cameraAngle: CameraAngle = 'front_on',
  batterHand: BatterHand = 'right'
): Promise<SessionRecord> {
  const response = await fetch(`${API_BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      player_name: playerName,
      camera_angle: cameraAngle,
      batter_hand: batterHand,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to create session');
  }
  return response.json();
}

export async function getBattingSessions(): Promise<SessionRecord[]> {
  try {
    const response = await fetch(`${API_BASE}/sessions`);
    if (!response.ok) return [];
    return response.json();
  } catch (e) {
    console.warn('Could not fetch sessions from backend', e);
    return [];
  }
}

export async function getAppConfig(): Promise<any> {
  try {
    const response = await fetch(`${API_BASE}/config`);
    if (!response.ok) return null;
    return response.json();
  } catch (e) {
    return null;
  }
}
