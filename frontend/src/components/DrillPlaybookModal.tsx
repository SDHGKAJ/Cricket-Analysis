import React from 'react';
import { X, Dumbbell, Target, CheckCircle2, AlertTriangle, Lightbulb, Play } from 'lucide-react';

interface DrillPlaybookModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const COACH_DRILLS = [
  {
    id: 'DRILL-01',
    title: 'Top-Hand Dominance & Tee Drive',
    targetFlaw: 'Front Elbow Dropping / Collapsed Arm',
    severity: 'High',
    equipment: 'Batting Tee + 12 Practice Balls',
    reps: '4 Sets x 15 Repetitions',
    cue: 'Point your front elbow directly at extra cover throughout the entire downswing.',
    description: 'Place the cricket ball on a batting tee positioned outside the off-stump line. Remove your bottom hand completely from the handle. Lead into the ball taking a positive front stride, stroking drives exclusively with your top hand leading and guiding the bat.',
    coachingPoints: [
      'Top hand controls line and elevation along the turf.',
      'Front elbow remains higher than the front wrist at impact.',
      'Hold the follow-through pose for 2 seconds to cement muscle memory.'
    ]
  },
  {
    id: 'DRILL-02',
    title: 'Drop-Ball Target Precision Driving',
    targetFlaw: 'Head Falling Away to Off-Side',
    severity: 'High',
    equipment: 'Partner / Coach + Marked Floor Target',
    reps: '3 Sets x 20 Repetitions',
    cue: 'Lead with your head into the line of the drive; eyes dead level over the front knee.',
    description: 'A coach stands 4 feet ahead on the off-side and drops a tennis/leather ball from shoulder height onto a chalk target on the batting crease. As the ball drops, stride forward and drive through the line while keeping your chin firmly over the bounce point.',
    coachingPoints: [
      'Do not allow the head to tilt towards the slips.',
      'Eyeline must stay parallel with the horizon.',
      'Nose directly over front knee flexion.'
    ]
  },
  {
    id: 'DRILL-03',
    title: 'Two-Stump Channel Corridor Swing',
    targetFlaw: 'Bat Coming Across the Line / Slicing',
    severity: 'High',
    equipment: 'Two Upright Stumps / Cones placed 1.5 ft apart',
    reps: '4 Sets x 12 Repetitions',
    cue: 'Bring the blade down smoothly from second slip straight through extra cover.',
    description: 'Place two upright stumps or cones 18 inches apart along the desired cover drive corridor. Practice downswinging from backlift through this narrow channel without brushing either stump.',
    coachingPoints: [
      'Eliminates outside-in slicing.',
      'Ensures full face of the bat presents toward the target.',
      'Maximizes sweet-spot surface area.'
    ]
  },
  {
    id: 'DRILL-04',
    title: 'Shadow Step & 3-Second Balance Freeze',
    targetFlaw: 'Loss of Balance on Follow-Through',
    severity: 'Medium',
    equipment: 'Mirror or Video Camera',
    reps: '3 Sets x 15 Repetitions',
    cue: 'Finish like a statue! Hold your front knee base until the ball would reach the boundary rope.',
    description: 'Execute full shadow cover drives at 80% speed. On finishing the follow-through, freeze motion completely for 3 full seconds without allowing the rear leg or torso to sway.',
    coachingPoints: [
      'Weight transferred 70-80% onto the flexed front sole.',
      'Back foot on toe with toe pointing forward.',
      'Center of mass stable over solid front knee base.'
    ]
  }
];

export const DrillPlaybookModal: React.FC<DrillPlaybookModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="enterprise-card-active rounded-3xl max-w-3xl w-full p-6 border border-slate-700 shadow-2xl relative max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
              <Dumbbell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                Batting Masterclass Drill Playbook
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold">
                  BCCI &amp; ECB CERTIFIED
                </span>
              </h3>
              <p className="text-xs text-slate-400">Prescribed biomechanical correction routines for batsman stroke flaws</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drill Cards Grid */}
        <div className="overflow-y-auto space-y-4 pr-1 flex-1">
          {COACH_DRILLS.map((drill) => (
            <div
              key={drill.id}
              className="bg-slate-900/80 rounded-2xl p-5 border border-slate-800 hover:border-slate-700 transition-all space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-xs mb-1">
                    <span className="font-mono text-emerald-400 font-bold">{drill.id}</span>
                    <span className="text-slate-500">•</span>
                    <span className="text-rose-400 font-semibold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Corrects: {drill.targetFlaw}
                    </span>
                  </div>
                  <h4 className="text-base font-bold text-white">{drill.title}</h4>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-[11px] font-mono text-slate-400 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 block">
                    {drill.reps}
                  </span>
                </div>
              </div>

              {/* Cue banner */}
              <div className="bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-xl text-xs text-emerald-300 flex items-start gap-2">
                <Lightbulb className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-emerald-300 font-bold mr-1">Coach Cue:</strong>
                  "{drill.cue}"
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">{drill.description}</p>

              {/* Key Coaching Points */}
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 text-xs">
                <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1.5">
                  Execution Checkpoints:
                </div>
                <div className="space-y-1">
                  {drill.coachingPoints.map((pt, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-slate-300 text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>{pt}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-800 mt-4 shrink-0 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            Recommended: Practice 20 mins prior to live net sessions.
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-glow-green transition-all"
          >
            Close &amp; Return to Practice
          </button>
        </div>
      </div>
    </div>
  );
};
