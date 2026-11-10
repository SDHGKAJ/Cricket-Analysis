import React from 'react';

interface DonutRingProps {
  /** 0-100 score, or null for not-detected (dashed empty ring) */
  score: number | null;
  size?: number;
  /** Tile accent color (for not-detected we ignore and use grey track) */
  accent?: string;
  className?: string;
}

/**
 * DonutRing — white ring on darker track, fills clockwise by score.
 * Not-detected (null) renders a dashed empty grey ring.
 */
export const DonutRing: React.FC<DonutRingProps> = ({ score, size = 96, accent, className = '' }) => {
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = score == null ? circumference : circumference * (1 - Math.max(0, Math.min(100, score)) / 100);

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-label={score == null ? 'Metric not detected' : `${score.toFixed(0)}% score`}
      role="img"
    >
      {/* Track */}
      <circle
        cx="50"
        cy="50"
        r={radius}
        stroke="rgba(255,255,255,0.10)"
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
      />
      {/* Value ring */}
      {score != null && (
        <circle
          cx="50"
          cy="50"
          r={radius}
          stroke={accent ?? '#1FB5D6'}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      )}
      {/* Not-detected dashed ring */}
      {score == null && (
        <circle
          cx="50"
          cy="50"
          r={radius}
          stroke="#444A5B"
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray="12 12"
        />
      )}
    </svg>
  );
};

export default DonutRing;
