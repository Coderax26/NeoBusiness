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
    default: 'border-zinc-800 bg-zinc-900/60 text-zinc-100',
    success: 'border-emerald-500/30 bg-emerald-950/20 text-emerald-100',
    warning: 'border-amber-500/30 bg-amber-950/20 text-amber-100',
    danger: 'border-rose-500/30 bg-rose-950/20 text-rose-100',
  };

  return (
    <div
      className={`glass-card p-5 rounded-xl border flex flex-col justify-between shadow-lg ${toneClasses[tone]}`}
    >
      <div className="flex items-start justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          {title}
        </span>
        {trend && (
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded ${
              trend.direction === 'up'
                ? 'bg-emerald-500/10 text-emerald-400'
                : trend.direction === 'down'
                ? 'bg-rose-500/10 text-rose-400'
                : 'bg-zinc-700/20 text-zinc-400'
            }`}
          >
            {trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '→'} {trend.label}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-baseline justify-between">
        <div className="text-2xl font-bold tracking-tight text-white">{value}</div>
        {points && (
          <svg className="w-24 h-7 stroke-indigo-400 fill-none" viewBox="0 0 100 28">
            <polyline
              points={points}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>

      {subtitle && <p className="mt-1 text-xs text-zinc-400">{subtitle}</p>}
    </div>
  );
};

