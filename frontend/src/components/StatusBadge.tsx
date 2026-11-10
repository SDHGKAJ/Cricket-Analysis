import React from 'react';
import { MetricStatus } from '../types/cricket';

interface StatusBadgeProps {
  status: MetricStatus;
  label?: string;
  className?: string;
}

const STYLES: Record<MetricStatus, { className: string; defaultLabel: string }> = {
  good: { className: 'badge badge-good', defaultLabel: 'Good' },
  medium: { className: 'badge badge-medium', defaultLabel: 'Medium' },
  bad: { className: 'badge badge-bad', defaultLabel: 'Bad' },
  not_detected: { className: 'badge badge-none', defaultLabel: 'Not detected' },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label, className = '' }) => {
  const cfg = STYLES[status] ?? STYLES.not_detected;
  return (
    <span className={`${cfg.className} ${className}`} aria-label={`${cfg.defaultLabel}: ${label ?? ''}`}>
      {label ?? cfg.defaultLabel}
    </span>
  );
};

export default StatusBadge;
