"""
Cricket Flaw Detection & Coach Insights Engine
==============================================
Identifies biomechanical stroke flaws with severity ratings, exact frame occurrences,
measured values vs ideal ranges, and coach advice (why it hurts, 1-line fix, drill).
"""

from typing import List, Dict, Any, Tuple
from ..config import SHOTS_CONFIG, FLAWS_CONFIG

class FlawDetector:
    def __init__(self, shot_type: str = "cover_drive"):
        self.shot_type = shot_type
        self.shot_config = SHOTS_CONFIG.get("shot_types", {}).get(shot_type, {})
        self.flaw_rules = FLAWS_CONFIG.get("shots", {}).get(shot_type, {}).get("flaws", {})

    def evaluate_flaws_and_score(
        self,
        metrics: Dict[str, float],
        diagnostics: Dict[str, Any],
        impact_frame: int
    ) -> Tuple[float, float, List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Calculates:
        1. overall_score (/10)
        2. timing_score (/10)
        3. flaws list matching exact format: [{ name, severity, frame, measured, ideal, affected_joint }]
        4. tips list matching exact format: [{ flaw, why_it_hurts, fix, drill }]
        """
        # 1. Compute weighted overall score
        weights = self.shot_config.get("weights", {
            "head_position": 0.20,
            "front_elbow": 0.20,
            "footwork": 0.15,
            "balance": 0.15,
            "timing": 0.15,
            "bat_swing_path": 0.10,
            "follow_through": 0.05
        })

        weighted_sum = 0.0
        total_weight = 0.0
        for metric_name, weight in weights.items():
            val = metrics.get(metric_name, 7.0)
            weighted_sum += val * weight
            total_weight += weight

        overall_score = round(weighted_sum / max(1e-5, total_weight), 1)
        timing_score = round(metrics.get("timing", 7.0), 1)

        # 2. Rule-based flaw evaluation
        flaws: List[Dict[str, Any]] = []
        tips: List[Dict[str, Any]] = []

        # Flaw A: Head Falling Away
        head_dev = diagnostics.get("head_lateral_deviation_pct", 0.0)
        if head_dev > 5.5:
            severity = "high" if head_dev > 8.0 else ("medium" if head_dev > 6.5 else "low")
            rule = self.flaw_rules.get("head_falling_away", {})
            flaws.append({
                "name": "Head Falling Away to Off-Side",
                "severity": severity,
                "frame": impact_frame,
                "measured": head_dev,
                "ideal": rule.get("ideal_range", "0.0% - 4.5%"),
                "affected_joint": rule.get("affected_joint", "nose")
            })
            tips.append({
                "flaw": "Head Falling Away to Off-Side",
                "why_it_hurts": rule.get("why_it_hurts", "Head fall causes hands to slice away from the ball into slips."),
                "fix": rule.get("fix", "Lead into the drive with your head; eyes level over front knee."),
                "drill": rule.get("drill", "Drop-Ball Target Driving: 25 repetitions holding head still over contact.")
            })

        # Flaw B: Front Elbow Dropping
        elbow_angle = diagnostics.get("front_elbow_angle_deg", 95.0)
        elbow_elevation = diagnostics.get("front_elbow_elevation_deg", 75.0)
        if elbow_elevation < 60.0 or elbow_angle < 75.0 or elbow_angle > 130.0:
            severity = "high" if elbow_elevation < 50.0 or elbow_angle > 135.0 else "medium"
            rule = self.flaw_rules.get("front_elbow_dropping", {})
            flaws.append({
                "name": "Front Elbow Dropping / Collapsed Arm",
                "severity": severity,
                "frame": impact_frame,
                "measured": elbow_elevation,
                "ideal": rule.get("ideal_range", "70.0° - 110.0°"),
                "affected_joint": rule.get("affected_joint", "left_elbow")
            })
            tips.append({
                "flaw": "Front Elbow Dropping / Collapsed Arm",
                "why_it_hurts": rule.get("why_it_hurts", "A dropping elbow forces bottom hand dominance, popping the ball in the air."),
                "fix": rule.get("fix", "Point your front elbow towards mid-off throughout the downswing."),
                "drill": rule.get("drill", "Top-Hand Only Tee Drives: 25 drives with top-hand leading exclusively.")
            })

        # Flaw C: Bat Coming Across the Line
        bat_dev = diagnostics.get("bat_path_deviation_deg", 0.0)
        if bat_dev > 8.0:
            severity = "high" if bat_dev > 14.0 else ("medium" if bat_dev > 10.0 else "low")
            rule = self.flaw_rules.get("bat_across_the_line", {})
            flaws.append({
                "name": "Bat Coming Across the Line / Slicing",
                "severity": severity,
                "frame": impact_frame,
                "measured": bat_dev,
                "ideal": rule.get("ideal_range", "-5.0° to +5.0°"),
                "affected_joint": rule.get("affected_joint", "left_wrist")
            })
            tips.append({
                "flaw": "Bat Coming Across the Line / Slicing",
                "why_it_hurts": rule.get("why_it_hurts", "Swinging across the line reduces sweet-spot impact and risks outside edges."),
                "fix": rule.get("fix", "Bring bat down smoothly from second slip straight through extra cover corridor."),
                "drill": rule.get("drill", "Two-Stump Channel Drill: Swing bat cleanly between two upright markers.")
            })

        # Flaw D: Front foot reach / stride
        stride_norm = diagnostics.get("stride_extension_norm", 1.0)
        if stride_norm < 0.80 or stride_norm > 1.65:
            severity = "high" if stride_norm < 0.65 else "medium"
            rule = self.flaw_rules.get("short_stride_reach", {})
            flaws.append({
                "name": "Front Foot Not to the Pitch of the Ball",
                "severity": severity,
                "frame": max(0, impact_frame - 3),
                "measured": stride_norm,
                "ideal": rule.get("ideal_range", "0.85 - 1.45 norm"),
                "affected_joint": rule.get("affected_joint", "left_ankle")
            })
            tips.append({
                "flaw": "Front Foot Not to the Pitch of the Ball",
                "why_it_hurts": rule.get("why_it_hurts", "Reaching with hands without footwork causes lunging away from the eyes."),
                "fix": rule.get("fix", "Commit a positive stride toward the line and bounce of the ball."),
                "drill": rule.get("drill", "Shadow Step & Freeze: 30 repetitions planting front foot towards cover.")
            })

        # Flaw E: Balance on follow-through
        transfer = diagnostics.get("weight_transfer_ratio", 0.70)
        balance_metric = metrics.get("balance", 8.0)
        if balance_metric < 6.8:
            severity = "high" if balance_metric < 5.0 else "medium"
            rule = self.flaw_rules.get("balance_loss_follow_through", {})
            flaws.append({
                "name": "Loss of Balance on Follow-Through",
                "severity": severity,
                "frame": min(impact_frame + 6, impact_frame + 10),
                "measured": balance_metric,
                "ideal": rule.get("ideal_range", "8.0 - 10.0 / 10"),
                "affected_joint": rule.get("affected_joint", "left_hip")
            })
            tips.append({
                "flaw": "Loss of Balance on Follow-Through",
                "why_it_hurts": rule.get("why_it_hurts", "Toppling off-balance indicates upper-body lunging without solid knee flexion."),
                "fix": rule.get("fix", "Hold your finish pose like a statue for 3 seconds after every drive."),
                "drill": rule.get("drill", "3-Second Pose Hold: Freeze on flexed front knee without wobbling.")
            })

        return overall_score, timing_score, flaws, tips
