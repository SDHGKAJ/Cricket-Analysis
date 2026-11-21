import React from 'react';
import { MetricStatus } from '../types/cricket';

interface StatusBadgeProps {
  status: MetricStatus;
  label?: string;
  className?: string;
}

const DEFAULT_LABEL: Record<MetricStatus, string> = {
  good: 'Good',
  medium: 'Fair',
  bad: 'Needs work',
  not_detected: 'Not measured',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label, className = '' }) => (
  <span className={`pill pill-${status in DEFAULT_LABEL ? status : 'not_detected'} ${className}`}>
    {label ?? DEFAULT_LABEL[status]}
  </span>
);

export default StatusBadge;
