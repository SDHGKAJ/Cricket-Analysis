# 🏏 Cricket Vision AI - Stroke Biomechanics & Flaw Coach

An end-to-end Computer Vision & Full-Stack web application that analyzes a batsman's cricket strokes in real time. It detects each shot, segments the stroke phases (Backlift → Downswing → Impact → Follow-through), scores the biomechanics out of 10, identifies flaws with measured vs. ideal tolerances, and prescribes actionable coach cues and drills.

---

## 🏗️ Architecture & Folder Structure

```
Cricket-Analysis/
├── backend/
│   ├── app/
│   │   ├── main.py                     # FastAPI server with REST & WebSocket endpoints
│   │   ├── config.py                   # App configuration and paths loader
│   │   ├── database.py                 # SQLite database engine and sessionmaker
│   │   ├── models/
│   │   │   └── shot_models.py          # SQLAlchemy models (SessionModel, ShotRecordModel)
│   │   ├── schemas/
│   │   │   └── shot_schemas.py         # Pydantic schemas for requests, responses & JSON spec
│   │   ├── engine/
│   │   │   ├── shot_segmentation.py    # Backlift apex, downswing acceleration & impact detection
│   │   │   ├── metrics_calculator.py   # Computes 8 biomechanical metrics & diagnostics
│   │   │   ├── flaw_detector.py        # Rule-based flaw evaluator & coach advice generator
│   │   │   ├── shot_classifier.py      # Swappable Rule-Based + ONNX ML Classifier (auto-selects ONNX if present)
│   │   │   ├── yolo_tracker.py         # YOLOv8n ONNX ball detection + kinematic bat proxy, per-frame method tagging
│   │   │   └── slowmo_generator.py     # Slow-motion video annotator (0.25x / 0.5x)
│   │   └── configs/                    # Editable configuration files
│   │       ├── shots_config.json       # Ideal angles, tolerances, and metric weights per shot
│   │       └── flaws_drills.json       # Coach advice, "why it hurts", fixes, and drills
│   ├── datasets/                       # Remote dataset loaders (streaming, no local file assumptions)
│   │   ├── cricshot10_loader.py        # CricShot10 GitHub manifest & mirror loader
│   │   ├── huggingface_loader.py       # vicky521/cricket-shot streaming dynamic schema loader
│   │   ├── kaggle_loader.py            # aneesh10/cricket-shot-dataset Kaggle API downloader
│   │   ├── roboflow_loader.py          # Roboflow YOLOv8 bat & ball dataset downloader
│   │   ├── labeling_template.json      # Coach rating pipeline JSON schema & sample records
│   │   ├── labeling_schema.csv         # Coach annotation CSV template
│   │   └── label_studio_config.xml     # Label Studio XML project setup for video rating
│   ├── notebooks/                      # Colab / Kaggle Training Notebooks (free GPU)
│   │   ├── train_cricket_yolo.ipynb    # Bat & ball YOLOv8 training on Roboflow + ONNX export
│   │   └── train_shot_classifier.ipynb # Biomechanical temporal classifier training + ONNX export
│   ├── tests/
│   │   └── test_engine.py              # Automated unit tests for engine pipeline
│   └── requirements.txt
├── frontend/                           # React 18 + TypeScript + Tailwind CSS
│   ├── src/
│   │   ├── components/
│   │   │   ├── LiveCameraFeed.tsx      # High-FPS webcam stream with 33-landmark canvas overlay
│   │   │   ├── ScoreCard.tsx           # Overall /10 score, timing subscore, metric breakdown
│   │   │   ├── ScoreRing.tsx           # Animated circular score gauge (ring-fill animation)
│   │   │   ├── RadarChart.tsx          # Recharts biomechanics radar chart
│   │   │   ├── RadarChartComponent.tsx # Recharts radar sub-component
│   │   │   ├── FlawCard.tsx            # Flaw cards with severity, frame #, measured vs ideal
│   │   │   ├── FlawList.tsx            # Legacy flaw list component
│   │   │   ├── DrillCard.tsx           # Drill prescription cards with duration / reps
│   │   │   ├── ImprovementCoach.tsx    # Coach cues: Why it hurts, 1-line fix, practice drills
│   │   │   ├── SlowMoReplay.tsx        # Interactive canvas slow-mo player + external frame control
│   │   │   ├── SessionDashboard.tsx    # Session analytics, score progression, and shot history
│   │   │   ├── VideoOverlay.tsx        # Video frame overlay with phase timeline & joint highlighting
│   │   │   ├── VideoUploader.tsx       # Drag-and-drop clip uploader + client-side offline fallback
│   │   │   ├── SideNav.tsx             # Enterprise sidebar navigation
│   │   │   ├── TopBar.tsx              # Top navigation bar with camera / batter controls
│   │   │   ├── StickyMiniHeader.tsx    # Sticky score + shot type header on scroll
│   │   │   ├── PhaseTimeline.tsx       # Stroke phase timeline badges
│   │   │   ├── StateViews.tsx          # Empty / Analyzing / Error / NoFlaws / Live mode views
│   │   │   ├── EnterpriseHeader.tsx    # Legacy enterprise header
│   │   │   ├── TelemetryHub.tsx        # Legacy telemetry hub
│   │   │   ├── ViewSettingsModal.tsx   # Legacy camera/batter settings modal
│   │   │   └── DrillPlaybookModal.tsx  # Legacy drill playbook modal
│   │   ├── services/
│   │   │   ├── api.ts                  # Backend REST client
│   │   │   └── clientShotEvaluator.ts  # Client-side instantaneous (<50ms) kinematics evaluator
│   │   ├── types/
│   │   │   └── cricket.ts              # Data contracts and TypeScript interfaces
│   │   ├── App.tsx                     # Main dashboard orchestrator (empty / analyzing / error / ready states)
│   │   ├── index.css                   # Design tokens, semantic badges, CSS animations
│   │   └── main.tsx
│   ├── package.json                    # deps: framer-motion, recharts added
│   ├── vite.config.ts
│   └── tailwind.config.js
├── train_yolo.py                       # Root-level YOLOv8n ball detector training script (+ ONNX export)
├── train_shot_classifier.py            # Root-level shot classifier ONNX training script
├── README.md
└── LICENSE
```

---

## 🎯 Computer Vision & Biomechanics Pipeline

1. **Pose Estimation**: MediaPipe Pose (33 3D landmarks) running in-browser for zero-latency 60/30 FPS tracking with interactive canvas skeleton overlay.
2. **Bat/Ball Tracking**: YOLOv8 fine-tuned on cricket bat and ball datasets with a robust kinematic/optical flow fallback anchored to wrists.
3. **Shot Phase Segmentation**:
   - **Backlift**: Hands elevate backwards and upwards from resting stance; apex is detected at local minimum Y.
   - **Downswing**: Rapid acceleration downward and forward towards the ball.
   - **Impact**: Point of peak bat/wrist linear & angular velocity and inflection.
   - **Follow-Through**: Deceleration into arc completion and high elbow finish.
4. **Cover Drive Metrics Evaluated (0 - 10)**:
   - **Timing**: Bat speed peak at ball contact and contact point relative to front foot.
   - **Head Position**: Lateral head lean over the front knee, stillness at impact.
   - **Front Elbow**: High front elbow elevation (70°-110°) and angle.
   - **Footwork**: Positive front foot stride length and direction to pitch of ball.
   - **Balance & COM**: Center-of-mass weight transfer (65%-80% onto front foot).
   - **Bat Swing Path**: Swing arc straightness down from slip through extra cover line.
   - **Backlift**: Height and alignment.
   - **Follow-Through**: High finish posture.
5. **Rule-Based Flaws Detected**:
   - `Head Falling Away to Off-Side`
   - `Front Elbow Dropping / Collapsed Arm`
   - `Bat Coming Across the Line / Slicing`
   - `Front Foot Not to the Pitch of the Ball`
   - `Loss of Balance on Follow-Through`
   - `Bottom Hand Squeezing / Domination`

---

## ✨ What's New (Latest Release)

### Enterprise UI Upgrade
- **New layout shell**: `SideNav` + `TopBar` + `StickyMiniHeader` with glass-panel cards, semantic badges, and smooth page transitions.
- **New components**: `ScoreRing` (animated circular gauge), `RadarChart` (8-metric biomechanics radar), `FlawCard` (severity-tagged flaw cards), `DrillCard` (practice drill prescriptions), `MetricBreakdown`, `HistoryChart`, `PhaseTimeline`, `VideoOverlay`, `StateViews` (Empty / Analyzing / Error / NoFlaws / Live modes).
- **State-driven dashboard**: App modes (`empty` → `analyzing` → `error` → `ready`) with demo shot data and a drill library so the UI is rich and interactive immediately.
- **Animations**: CSS design tokens plus `ring-fill`, `bar-grow`, `fade-in`, and `flaw-pulse` keyframes; `framer-motion` and `recharts` added to dependencies.
- **VideoUploader**: client-side offline fallback runs the client shot evaluator when the backend is unreachable.

### ML Classifier Auto-Selection
- `shot_classifier.py` now auto-selects the ONNX ML classifier when `cricket_shot_classifier.onnx` is present, falling back to the rule-based classifier otherwise. Controlled from `backend/app/main.py` via `SHOT_CLASSIFIER_MODE`.

### YOLOv8n Ball Tracking
- `yolo_tracker.py` refactored to YOLOv8n ONNX ball detection (`cricket_yolo.onnx`, 1 class: `cricketball`) with a kinematic wrist-anchored bat proxy fallback. Each frame carries a `method` tag (`yolov8_ball_kinematic_bat`, `yolov8_ball_only`, `kinematic_bat_proxy`, `unavailable`).
- Ball detections are merged into analysis frames in `/api/analyze-video` so downstream metrics can use ball position.

### Git Hygiene
- Trained model weights (`*.onnx`, `*.pt`, `*.pth`), the `Cricket-Ball-Detection-1/` dataset, `backend/shot_features/`, and `runs/` are now gitignored and regenerated via `train_yolo.py` / `train_shot_classifier.py`.

---

## 📊 Standard API / JSON Output Format

Each analyzed stroke produces the exact required format:

```json
{
  "shot_type": "cover_drive",
  "overall_score": 7.2,
  "timing_score": 8.0,
  "metrics": {
    "timing": 8.0,
    "head_position": 6.5,
    "front_elbow": 5.0,
    "footwork": 8.2,
    "balance": 8.5,
    "bat_swing_path": 7.8,
    "backlift": 8.0,
    "follow_through": 7.5
  },
  "flaws": [
    {
      "name": "Front Elbow Dropping / Collapsed Arm",
      "severity": "high",
      "frame": 25,
      "measured": 54.2,
      "ideal": "70.0° - 110.0°",
      "affected_joint": "left_elbow"
    }
  ],
  "tips": [
    {
      "flaw": "Front Elbow Dropping / Collapsed Arm",
      "why_it_hurts": "A collapsed or dropping front elbow forces the bottom hand to dominate, scooping the ball in the air towards extra cover.",
      "fix": "Point your front elbow directly at the mid-off/cover region throughout the downswing, letting the top hand guide the stroke.",
      "drill": "Top-Hand Only Tee Drives: Place the ball on a batting tee; remove bottom hand and stroke 25 drives keeping front elbow high."
    }
  ]
}
```

---

## 🚀 Setup & Execution Steps

### 1. Backend (FastAPI + SQLite)
Requires Python 3.10+.

```bash
# Navigate to backend directory
cd backend

# (Optional) Activate a virtual environment
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/Mac:
# source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run backend engine unit test
python tests/test_engine.py

# Launch FastAPI development server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
The backend API docs are available at: `http://localhost:8000/docs`.

> **ML classifier auto-selection**: `main.py` checks for `cricket_shot_classifier.onnx` at startup. If present, the ONNX `MLShotClassifier` is used; otherwise the rule-based `RuleBasedShotClassifier` runs automatically. Generate the ONNX weights with `train_shot_classifier.py` (root) or `backend/notebooks/train_shot_classifier.ipynb`.

### 2. Frontend (React + Vite + Tailwind)
Requires Node.js 18+.

```bash
# Navigate to frontend directory
cd frontend

# Install packages (includes framer-motion + recharts for animations & charts)
npm install

# Type-check
npx tsc --noEmit

# Start Vite dev server
npm run dev
```
Open your browser at `http://localhost:5173`.

> **Note on model weights**: Trained ONNX / PyTorch weights (`cricket_yolo.onnx`, `cricket_shot_classifier.onnx`, `*.pt`, `*.pth`) are **gitignored** and not shipped in the repo. The app runs in rule-based + kinematic-fallback mode out of the box. Generate weights with `train_yolo.py` / `train_shot_classifier.py` (or the Colab notebooks in `backend/notebooks/`) and place `cricket_yolo.onnx` / `cricket_shot_classifier.onnx` at the repo root to unlock ML-powered detection and classification.

---

## 📹 Camera Perspectives & Calibration

- **Front-On View (Default & Calibrated for MVP)**:
  - Position: Camera facing the batsman from the bowler/umpire crease direction.
  - Measures: Lateral head fall, shoulder rotation, front foot placement towards covers, and bat swing line through extra cover.
- **Side-On View**:
  - Position: Camera positioned on crease line at point/cover or square leg.
  - Measures: Front knee flexion angle (115°-145°), backlift apex height, and forward stride length.
- **Batter Hand Toggle**:
  - Switch between **Right-Handed** and **Left-Handed** stances in the top right Settings modal. Front joints automatically invert (e.g. left arm/leg becomes front side for right-handers).

---

## 📁 Remote Dataset Access & Loaders

Run any remote loader script directly without downloading manual zip files:

1. **Hugging Face (`vicky521/cricket-shot` & `rokmr/cricket-shot`)**:
   ```bash
   python backend/datasets/huggingface_loader.py
   ```
   Uses streaming mode (`streaming=True`) and dynamically inspects dataset splits and column schemas.
2. **CricShot10 (`github.com/ascuet/CricShot10`)**:
   ```bash
   python backend/datasets/cricshot10_loader.py
   ```
   Queries the GitHub repository manifest and cloud mirrors.
3. **Kaggle (`aneesh10/cricket-shot-dataset`)**:
   ```bash
   export KAGGLE_USERNAME="your_username"
   export KAGGLE_KEY="your_api_key"
   python backend/datasets/kaggle_loader.py
   ```
4. **Roboflow Universe YOLO Models (`cricket-2-7snzq`, `cricket-bat-detection-hlbdq`)**:
   ```bash
   export ROBOFLOW_API_KEY="your_roboflow_key"
   python backend/datasets/roboflow_loader.py
   ```

---

## 🏷️ Coach Quality Scores & Flaw Labeling Pipeline

Because no public quality rating dataset exists for cricket batting biomechanics, this repository includes a turnkey coach labeling pipeline:

- **JSON Schema**: `backend/datasets/labeling_template.json`
- **CSV Template**: `backend/datasets/labeling_schema.csv` (`clip_id, shot_type, score, timing_score, flaws, camera_angle, rater, notes`)
- **Label Studio Setup**:
  1. Open [Label Studio](https://labelstud.io).
  2. Create a new project: "Cricket Shot Biomechanics".
  3. Copy and paste the XML template from `backend/datasets/label_studio_config.xml` into the Labeling Setup code view.
  4. Import your side-on/front-on 60 FPS video clips to rate strokes out of 10 and tag specific flaws with timestamp markers.

---

## 🧠 Training & Exporting Models (Google Colab / Kaggle)

Train and export models either via the Colab/Kaggle notebooks or the root-level Python scripts:

**Notebooks (`backend/notebooks/`):**
1. **`train_cricket_yolo.ipynb`**:
   - Fine-tunes YOLOv8 on Roboflow cricket bat and ball datasets.
   - Evaluates mAP50 / mAP50-95.
   - Exports trained weights to **ONNX** (`cricket_yolo.onnx`) and **TensorFlow.js**.
2. **`train_shot_classifier.ipynb`**:
   - Streams clips from Hugging Face & CricShot10.
   - Trains a Temporal Bidirectional GRU network on 33 MediaPipe landmark trajectories.
   - Exports the classifier model to **ONNX** (`cricket_shot_classifier.onnx`) to slot into the swappable `MLShotClassifier` in `app/engine/shot_classifier.py`.

**Root-level scripts (alternative to notebooks):**
- `train_yolo.py` — trains the YOLOv8n ball detector and exports `cricket_yolo.onnx`.
- `train_shot_classifier.py` — trains the shot classifier and exports `cricket_shot_classifier.onnx`.

Place exported `cricket_yolo.onnx` / `cricket_shot_classifier.onnx` at the repo root; the backend auto-detects them at startup.

---

## ➕ Extending to Other Shots (Zero Code Changes)

Extending analysis to Straight Drive, Pull, Cut, Sweep, Flick, and Defense requires **only editing configuration files**, without altering core engine code:

1. Open `backend/app/configs/shots_config.json`:
   - Define custom metric weights and camera-specific ideal thresholds under `"shot_types"`.
2. Open `backend/app/configs/flaws_drills.json`:
   - Add new flaw rules, "why it hurts" explanations, 1-line fixes, and prescribed drills.
3. The engine automatically loads these rules dynamically!

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) - see the [LICENSE](LICENSE) file for details.

