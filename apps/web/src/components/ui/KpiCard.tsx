import React from 'react';
import { buildSparklineSvgPoints } from '@neo/ui';

export interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  trend?: {
    direction: 'up' | 'down' | 'neutral';
    label: string;
  };
  sparklineValues?: number[];
  tone?: 'default' | 'success' | 'warning' | 'danger';
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  subtitle,
  trend,
  sparklineValues,
  tone = 'default',
}) => {
  const points = sparklineValues ? buildSparklineSvgPoints(sparklineValues, 100, 28) : '';

  const toneClasses = {
    default: 'border-rule bg-sheet text-ink',
    success: 'border-leaf/30 bg-sheet text-ink',
    warning: 'border-haldi/40 bg-haldi-soft/50 text-ink',
    danger: 'border-madder/40 bg-madder-soft/50 text-ink',
  };

  return (
    <div
      className={`px-4 py-3.5 rounded-[4px] border flex flex-col justify-between${toneClasses[tone]}`}
    >
      <div className="flex items-start justify-between">
        <span className="text-[13px] font-medium text-ink-2">
          {title}
        </span>
        {trend && (
          <span
            className={`text-[12.5px] font-medium${
              trend.direction === 'up'
                ? 'text-leaf'
                : trend.direction === 'down'
                ? 'text-madder'
                : 'text-ink-3'
            }`}
          >
            {trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : ''} {trend.label}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-baseline justify-between">
        <div className="text-[26px] font-serif font-medium tracking-tight text-ink tabular-nums">{value}</div>
        {points && (
          <svg className="w-24 h-7 stroke-action fill-none" viewBox="0 0 100 28">
            <polyline
              points={points}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>

      {subtitle && <p className="mt-1 text-[13px] text-ink-3">{subtitle}</p>}
    </div>
  );
};
