import React from 'react';
import { getHumanStatus } from '@neo/i18n';

export type StatusPillTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

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
  success: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  warning: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  danger: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  info: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  neutral: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
};

const SYMBOLS: Record<StatusPillTone, string> = {
  success: '✓',
  warning: '▲',
  danger: '✕',
  info: '●',
  neutral: '○',
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
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
        TONE_CLASSES[resolvedTone] || TONE_CLASSES.neutral
      } ${className}`}
      role="status"
      aria-label={`${entity} status: ${resolvedLabel}`}
      title={human?.description || String(resolvedLabel)}
    >
      <span aria-hidden="true" className="font-bold text-[10px]">
        {SYMBOLS[resolvedTone] || SYMBOLS.neutral}
      </span>
      <span>{children ?? resolvedLabel}</span>
    </span>
  );
};
