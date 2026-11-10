import React from 'react';
import { Play, Dumbbell, User as UserIcon } from 'lucide-react';
import { CameraAngle, BatterHand } from '../types/cricket';

const NAV_ITEMS: Array<{ id: 'video' | 'drills'; label: string; icon: React.ElementType }> = [
  { id: 'video', label: 'Video Analysis', icon: Play },
  { id: 'drills', label: 'Drills', icon: Dumbbell },
];

const CAMERA_ANGLES: CameraAngle[] = ['front_on', 'side_on'];
const BATTER_HANDS: BatterHand[] = ['right', 'left'];

interface SideNavProps {
  active: 'video' | 'drills';
  onSelect: (id: 'video' | 'drills') => void;
  cameraAngle: CameraAngle;
  onCameraAngleChange: (a: CameraAngle) => void;
  batterHand: BatterHand;
  onBatterHandChange: (h: BatterHand) => void;
}

export const SideNav: React.FC<SideNavProps> = ({
  active,
  onSelect,
  cameraAngle,
  onCameraAngleChange,
  batterHand,
  onBatterHandChange,
}) => {
  return (
    <aside
      className="fixed left-0 top-0 bottom-0 z-20 w-56 bg-[#242833] border-r border-[rgba(255,255,255,0.06)] flex flex-col shrink-0"
      aria-label="Main navigation"
    >
      {/* User/app chip at top of sidebar */}
      <div className="flex items-center gap-2 px-4 py-5 border-b border-[rgba(255,255,255,0.06)] shrink-0">
        <div className="w-10 h-10 rounded-[10px] bg-gradient-to-br from-[#1FB5D6] to-[#7B7FE0] flex items-center justify-center shadow-lg shadow-[#1FB5D6]/25">
          <div className="w-full h-full bg-[#2B2F3A] rounded-[8px] flex items-center justify-center text-xl">
            🏏
          </div>
        </div>
        <div className="min-w-0 flex flex-col">
          <div className="text-xs font-bold text-[#FFFFFF] truncate">CricVision Pro</div>
          <span className="text-[10px] text-[#6E7486] font-numeric truncate">Batter 01</span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-3 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-xs font-semibold transition-colors ${
                isActive
                  ? 'bg-[#3A3F4E] border-l-2 border-[#1FB5D6] text-[#1FB5D6] shadow-lg shadow-[#1FB5D6]/15'
                  : 'text-[#6E7486] hover:text-[#FFFFFF] hover:bg-[#323744]/60 border-transparent'
              }`}
            >
              <Icon className="w-4.5 h-4.5 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Camera angle / handedness toggles */}
      <div className="p-3 border-t border-[rgba(255,255,255,0.06)] space-y-3">
        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#6E7486]">
          <span>Camera angle</span>
        </div>
        <div className="flex gap-1">
          {CAMERA_ANGLES.map((a) => (
            <button
              key={a}
              onClick={() => onCameraAngleChange(a)}
              className={`flex-1 py-1.5 rounded-[8px] text-[11px] font-semibold border transition-colors ${
                cameraAngle === a
                  ? 'bg-[#1FB5D6] text-[#052E16] border-[#1FB5D6]'
                  : 'bg-[#242833] border-[rgba(255,255,255,0.10)] text-[#AAB0BD] hover:bg-[#323744] hover:border-[#555E72]'
              }`}
            >
              {a === 'front_on' ? 'Front-on' : 'Side-on'}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#6E7486] mt-2">
          <span>Batter hand</span>
        </div>
        <div className="flex gap-1">
          {BATTER_HANDS.map((h) => (
            <button
              key={h}
              onClick={() => onBatterHandChange(h)}
              className={`flex-1 py-1.5 rounded-[8px] text-[11px] font-semibold border transition-colors ${
                batterHand === h
                  ? 'bg-[#1FB5D6] text-[#052E16] border-[#1FB5D6]'
                  : 'bg-[#242833] border-[rgba(255,255,255,0.10)] text-[#AAB0BD] hover:bg-[#323744] hover:border-[#555E72]'
              }`}
            >
              {h === 'right' ? 'Right' : 'Left'}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
};
