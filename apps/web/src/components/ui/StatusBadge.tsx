import React from 'react';
import { getStatusPillTheme, type EntityType } from '@neo/ui';

export interface StatusBadgeProps {
  entity: EntityType;
  status: string;
  label?: string;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  entity,
  status,
  label,
  className = '',
}) => {
  const theme = getStatusPillTheme(entity, status);
  const displayLabel = label || status.replace(/_/g, ' ');

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[3px] text-[13px] font-medium border${theme.className}${className}`}
      role="status"
      aria-label={`${entity} status: ${displayLabel}`}
    >
      <span aria-hidden="true" className="text-[11px]">
        {theme.icon}
      </span>
      <span>{displayLabel}</span>
    </span>
  );
};
