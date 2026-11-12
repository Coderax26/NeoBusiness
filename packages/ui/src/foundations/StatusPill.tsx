import React from 'react';
import { getHumanStatus } from '@neo/i18n';

export interface StatusPillProps {
  entity: string; // e.g. 'ORDER', 'INVOICE', 'PO', 'EXCEPTION', 'THREE_WAY_MATCH'
  status: string; // e.g. 'PENDING_APPROVAL', 'CONFIRMED'
  locale?: 'en' | 'mr';
  className?: string;
}

const TONE_CLASSES = {
  success: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  warning: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  danger: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  info: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  neutral: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
};

const SYMBOLS = {
  success: '✓',
  warning: '▲',
  danger: '✕',
  info: '●',
  neutral: '○',
};

export const StatusPill: React.FC<StatusPillProps> = ({
  entity,
  status,
  locale = 'en',
  className = '',
}) => {
  const human = getHumanStatus(entity, status, locale);
  const tone = human.tone;
  const label = locale === 'mr' ? human.mr : human.en;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${TONE_CLASSES[tone]} ${className}`}
      role="status"
      aria-label={`${entity} status: ${label}`}
      title={human.description}
    >
      <span aria-hidden="true" className="font-bold text-[10px]">
        {SYMBOLS[tone]}
      </span>
      <span>{label}</span>
    </span>
  );
};
