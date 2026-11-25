import React from 'react';
import { getHumanStatus } from '@neo/i18n';

export type StatusPillTone =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'slate'
  | 'sky'
  | 'indigo';

export interface StatusPillProps {
  entity?: string; // e.g. 'ORDER', 'INVOICE', 'PO', 'EXCEPTION', 'THREE_WAY_MATCH'
  status?: string; // e.g. 'PENDING_APPROVAL', 'CONFIRMED'
  label?: string; // Optional direct label override
  tone?: StatusPillTone; // Optional direct tone override
  locale?: 'en' | 'mr';
  className?: string;
  children?: React.ReactNode;
}

const TONE_CLASSES: Record<StatusPillTone, string> = {
  success: 'text-leaf',
  emerald: 'text-leaf',
  warning: 'text-haldi',
  amber: 'text-haldi',
  danger: 'text-madder',
  rose: 'text-madder',
  info: 'text-action',
  sky: 'text-action',
  indigo: 'text-action',
  neutral: 'text-ink-2',
  slate: 'text-ink-2',
};

const SHAPE_CLASSES: Record<StatusPillTone, string> = {
  success: 'w-[7px] h-[7px] rounded-full bg-current',
  emerald: 'w-[7px] h-[7px] rounded-full bg-current',
  warning: 'w-[7px] h-[7px] rounded-full bg-current',
  amber: 'w-[7px] h-[7px] rounded-full bg-current',
  danger: 'w-[7px] h-[7px] rounded-[1px] rotate-45 bg-current',
  rose: 'w-[7px] h-[7px] rounded-[1px] rotate-45 bg-current',
  info: 'w-[7px] h-[7px] rounded-full bg-current',
  sky: 'w-[7px] h-[7px] rounded-full bg-current',
  indigo: 'w-[7px] h-[7px] rounded-full bg-current',
  neutral: 'w-[7px] h-[7px] rounded-full border border-current bg-transparent',
  slate: 'w-[7px] h-[7px] rounded-full border border-current bg-transparent',
};

export const StatusPill: React.FC<StatusPillProps> = ({
  entity = 'ORDER',
  status,
  label: explicitLabel,
  tone: explicitTone,
  locale = 'en',
  className = '',
  children,
}) => {
  const human = status ? getHumanStatus(entity, status, locale) : null;
  const resolvedTone: StatusPillTone = explicitTone || (human?.tone as StatusPillTone) || 'neutral';
  const resolvedLabel =
    explicitLabel ??
    (typeof children === 'string' ? children : undefined) ??
    (human ? (locale === 'mr' ? human.mr : human.en) : status || 'Status');

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[13px] font-semibold ${
        TONE_CLASSES[resolvedTone] || TONE_CLASSES.neutral
      } ${className}`}
      role="status"
      aria-label={`${entity} status: ${resolvedLabel}`}
      title={human?.description || String(resolvedLabel)}
    >
      <span aria-hidden="true" className={SHAPE_CLASSES[resolvedTone] || SHAPE_CLASSES.neutral} />
      <span>{children ?? resolvedLabel}</span>
    </span>
  );
};
