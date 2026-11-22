import React from 'react';
import { formatINR, formatISTDate } from '@neo/shared';
import { buildSparklineSvgPoints } from '../index.js';
import { Button } from '../foundations/Button.js';
import { Dialog } from '../foundations/Dialog.js';

export interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  trend?: {
    direction: 'up' | 'down' | 'neutral';
    label?: string;
    value?: string | number;
  };
  sparklineValues?: number[];
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'brand' | 'info' | string;
  onClick?: () => void;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  subtitle,
  trend,
  sparklineValues,
  tone = 'default',
  onClick,
}) => {
  const points = sparklineValues ? buildSparklineSvgPoints(sparklineValues, 100, 28) : '';

  const toneClasses: Record<string, string> = {
    default: 'border-zinc-800 bg-zinc-900/60 text-zinc-100',
    brand: 'border-teal-500/30 bg-teal-950/20 text-teal-100',
    info: 'border-sky-500/30 bg-sky-950/20 text-sky-100',
    success: 'border-emerald-500/30 bg-emerald-950/20 text-emerald-100',
    warning: 'border-amber-500/30 bg-amber-950/20 text-amber-100',
    danger: 'border-rose-500/30 bg-rose-950/20 text-rose-100',
  };

  return (
    <div
      onClick={onClick}
      className={`p-5 rounded-2xl border flex flex-col justify-between shadow-lg transition-transform hover:-translate-y-0.5 ${
        onClick ? 'cursor-pointer' : ''
      } ${toneClasses[tone] || toneClasses.default}`}
    >
      <div className="flex items-start justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          {title}
        </span>
        {trend && (
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded ${
              trend.direction === 'up'
                ? 'bg-emerald-500/15 text-emerald-400'
                : trend.direction === 'down'
                ? 'bg-rose-500/15 text-rose-400'
                : 'bg-zinc-700/20 text-zinc-400'
            }`}
          >
            {trend.direction === 'up' ? '↑ ' : trend.direction === 'down' ? '↓ ' : '→ '}
            {trend.label}
          </span>
        )}
      </div>

      <div className="my-3 flex items-baseline justify-between">
        <div className="text-2xl font-bold font-mono tracking-tight text-white">{value}</div>
        {points && (
          <svg className="w-24 h-7 text-teal-400" fill="none">
            <polyline
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={points}
            />
          </svg>
        )}
      </div>

      {subtitle && <span className="text-xs text-zinc-400">{subtitle}</span>}
    </div>
  );
};

export const StatCompare: React.FC<{
  label: string;
  expected: string;
  actual: string;
  variance: string;
  isFavorable?: boolean;
}> = ({ label, expected, actual, variance, isFavorable = true }) => {
  return (
    <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-between text-xs">
      <div>
        <div className="text-zinc-400 font-medium">{label}</div>
        <div className="mt-1 flex items-center gap-2 font-mono">
          <span className="text-zinc-300">Exp: {expected}</span>
          <span className="text-zinc-500">|</span>
          <span className="font-bold text-white">Act: {actual}</span>
        </div>
      </div>
      <div
        className={`px-2 py-1 rounded font-mono font-bold ${
          isFavorable ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'
        }`}
      >
        {variance}
      </div>
    </div>
  );
};

export const CreditMeter: React.FC<{
  used: number;
  limit: number;
  customerName?: string;
}> = ({ used, limit, customerName }) => {
  const pct = limit > 0 ? Math.min(Math.round((used / limit) * 100), 100) : 100;
  const isOver = used > limit;
  const toneClass = isOver || pct > 90 ? 'bg-rose-500' : pct > 75 ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <div className="w-full p-3 bg-zinc-900/60 border border-zinc-800 rounded-xl">
      <div className="flex justify-between items-center text-xs mb-1.5">
        <span className="font-semibold text-zinc-300">
          {customerName ? `${customerName} Credit` : 'Credit Utilization'}
        </span>
        <span className="font-mono text-zinc-400">
          {formatINR(used)} / {formatINR(limit)} ({pct}%)
        </span>
      </div>
      <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
        <div className={`h-full ${toneClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

export const PriceBandChip: React.FC<{
  costPrice: string;
  floorPrice: string;
  targetPrice: string;
  currentPrice: string;
}> = ({ costPrice, floorPrice, targetPrice, currentPrice }) => {
  const numCurrent = parseFloat(currentPrice);
  const numFloor = parseFloat(floorPrice);
  const isBelow = numCurrent < numFloor;

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono bg-zinc-900/90 border-zinc-800">
      <span className="text-zinc-400">Floor: ₹{floorPrice}</span>
      <span className="text-zinc-600">•</span>
      <span className="text-zinc-400">Target: ₹{targetPrice}</span>
      <span
        className={`px-2 py-0.5 rounded text-[11px] font-bold ${
          isBelow ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'
        }`}
      >
        {isBelow ? 'Below Floor' : 'In Band'}
      </span>
    </div>
  );
};

export const MarginBadge: React.FC<{ marginPct: number }> = ({ marginPct }) => {
  const isHigh = marginPct >= 18;
  const isMid = marginPct >= 10 && marginPct < 18;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border ${
        isHigh
          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
          : isMid
          ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
          : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
      }`}
    >
      Margin: {marginPct.toFixed(1)}%
    </span>
  );
};

export interface TimelineEvent {
  id: string;
  title: string;
  actor: string;
  timestamp: string;
  notes?: string;
  tone?: 'success' | 'warning' | 'info';
}

export const Timeline: React.FC<{ events: TimelineEvent[] }> = ({ events }) => {
  return (
    <div className="relative pl-6 border-l-2 border-zinc-800 space-y-6 my-4">
      {events.map((ev) => (
        <div key={ev.id} className="relative">
          <span className="absolute -left-[31px] top-1 w-3 h-3 rounded-full bg-teal-500 ring-4 ring-zinc-950" />
          <div className="text-xs font-bold text-white">{ev.title}</div>
          <div className="text-[11px] text-zinc-400 mt-0.5 flex gap-2">
            <span>By {ev.actor}</span>
            <span>•</span>
            <span>{formatISTDate(ev.timestamp, true)}</span>
          </div>
          {ev.notes && (
            <p className="mt-1 text-xs text-zinc-300 bg-zinc-900/60 p-2 rounded border border-zinc-800">
              {ev.notes}
            </p>
          )}
        </div>
      ))}
    </div>
  );
};

export interface ExceptionCardProps {
  id: string;
  type: string;
  title: string;
  summary: string;
  impact: string;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onCounter?: (id: string) => void;
}

export const ExceptionCard: React.FC<ExceptionCardProps> = ({
  id,
  type,
  title,
  summary,
  impact,
  onApprove,
  onReject,
  onCounter,
}) => {
  return (
    <div className="p-4 rounded-xl border border-amber-500/40 bg-zinc-900/80 shadow-md">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
          {type}
        </span>
        <span className="text-xs text-zinc-500 font-mono">ID: {id}</span>
      </div>
      <h4 className="text-sm font-bold text-white mb-1">{title}</h4>
      <p className="text-xs text-zinc-300 mb-2 leading-relaxed">{summary}</p>
      <div className="text-xs text-rose-300 bg-rose-950/20 p-2 rounded mb-4 border border-rose-500/20">
        <strong>Business Impact:</strong> {impact}
      </div>
      <div className="flex gap-2 justify-end">
        {onCounter && (
          <Button size="sm" variant="ghost" onClick={() => onCounter(id)}>
            Counter Offer
          </Button>
        )}
        <Button size="sm" variant="danger" onClick={() => onReject(id)}>
          Reject
        </Button>
        <Button size="sm" variant="primary" onClick={() => onApprove(id)}>
          Approve
        </Button>
      </div>
    </div>
  );
};

export interface KanbanColumn<T> {
  id: string;
  title: string;
  items: T[];
}

export function KanbanBoard<T extends { id: string; title: string; subtitle?: string; badge?: string }>({
  columns,
  onMoveItem,
}: {
  columns: KanbanColumn<T>[];
  onMoveItem?: (itemId: string, targetColId: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 w-full overflow-x-auto pb-4">
      {columns.map((col) => (
        <div key={col.id} className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300">{col.title}</h4>
            <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-mono">
              {col.items.length}
            </span>
          </div>
          <div className="flex flex-col gap-2.5 flex-1 overflow-y-auto">
            {col.items.map((item) => (
              <div
                key={item.id}
                className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors shadow-sm"
              >
                <div className="text-xs font-bold text-white mb-1">{item.title}</div>
                {item.subtitle && <div className="text-[11px] text-zinc-400">{item.subtitle}</div>}
                {item.badge && (
                  <span className="mt-2 inline-block text-[10px] font-semibold px-2 py-0.5 rounded bg-teal-500/15 text-teal-300">
                    {item.badge}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export const DocumentViewer: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  documentUrl?: string;
}> = ({ open, onClose, title, documentUrl }) => {
  return (
    <Dialog open={open} onClose={onClose} title={title} maxWidth="xl">
      <div className="w-full h-96 bg-zinc-950 border border-zinc-800 rounded-xl flex items-center justify-center p-4">
        {documentUrl ? (
          <iframe src={documentUrl} title={title} className="w-full h-full rounded" />
        ) : (
          <div className="text-center text-zinc-400 text-xs">
            <div className="text-3xl mb-2">📄</div>
            <span>Document Preview</span>
          </div>
        )}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={() => window.print()}>
          Print
        </Button>
        <Button size="sm" variant="primary" onClick={onClose}>
          Done
        </Button>
      </div>
    </Dialog>
  );
};

export const AgingBuckets: React.FC<{
  buckets: { label: string; amount: string; count: number; tone: 'info' | 'warning' | 'danger' }[];
}> = ({ buckets }) => {
  const toneClasses = {
    info: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
    warning: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    danger: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full">
      {buckets.map((b, idx) => (
        <div key={idx} className={`p-3.5 rounded-xl border ${toneClasses[b.tone]}`}>
          <div className="text-xs font-semibold uppercase">{b.label}</div>
          <div className="text-lg font-bold font-mono mt-1 text-white">{formatINR(b.amount)}</div>
          <div className="text-[11px] opacity-80 mt-0.5">{b.count} invoices</div>
        </div>
      ))}
    </div>
  );
};

