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
    default: 'border-rule bg-sheet text-ink',
    brand: 'border-action/30 bg-sheet text-ink',
    info: 'border-action/30 bg-sheet text-ink',
    success: 'border-leaf/30 bg-sheet text-ink',
    warning: 'border-haldi/40 bg-haldi-soft/50 text-ink',
    danger: 'border-madder/40 bg-madder-soft/50 text-ink',
  };

  return (
    <div
      onClick={onClick}
      className={`px-4 py-3.5 rounded-[4px] border flex flex-col justify-between transition-colors ${
        onClick ? 'cursor-pointer hover:border-action' : ''
      } ${toneClasses[tone] || toneClasses.default}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-medium text-ink-2">
          {title}
        </span>
        {trend && (
          <span
            className={`text-[12.5px] font-medium ${
              trend.direction === 'up'
                ? 'text-leaf'
                : trend.direction === 'down'
                ? 'text-madder'
                : 'text-ink-3'
            }`}
          >
            {trend.direction === 'up' ? '↑ ' : trend.direction === 'down' ? '↓ ' : ''}
            {trend.label}
          </span>
        )}
      </div>

      <div className="my-2 flex items-baseline justify-between">
        <div className="text-[26px] leading-tight font-serif font-medium text-ink tabular-nums">
          {value}
        </div>
        {points && (
          <svg className="w-24 h-7 text-action" fill="none">
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

      {subtitle && <span className="text-[13px] text-ink-3">{subtitle}</span>}
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
    <div className="p-3 bg-paper border border-rule rounded-[3px] flex items-center justify-between text-[13px]">
      <div>
        <div className="text-ink-2 font-medium">{label}</div>
        <div className="mt-1 flex items-center gap-2 font-mono text-[13px]">
          <span className="text-ink-3">Exp: {expected}</span>
          <span className="text-rule-strong">|</span>
          <span className="font-semibold text-ink">Act: {actual}</span>
        </div>
      </div>
      <div
        className={`px-2 py-0.5 rounded-[3px] font-mono text-[12.5px] font-medium ${
          isFavorable ? 'bg-leaf-soft text-leaf' : 'bg-madder-soft text-madder'
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
  const toneClass = isOver || pct > 90 ? 'bg-madder' : pct > 75 ? 'bg-haldi' : 'bg-action';

  return (
    <div className="w-full p-3 bg-paper border border-rule rounded-[3px]">
      <div className="flex justify-between items-center text-[13px] mb-1.5">
        <span className="font-medium text-ink">
          {customerName ? `${customerName} Credit` : 'Credit utilization'}
        </span>
        <span className="font-mono text-ink-2">
          {formatINR(used)} / {formatINR(limit)} ({pct}%)
        </span>
      </div>
      <div className="w-full h-2 rounded-[1px] bg-sunken overflow-hidden">
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
}> = ({ floorPrice, targetPrice, currentPrice }) => {
  const numCurrent = parseFloat(currentPrice);
  const numFloor = parseFloat(floorPrice);
  const isBelow = numCurrent < numFloor;

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-[3px] border text-[13px] font-mono bg-paper border-rule-strong">
      <span className="text-ink-2">Floor: ₹{floorPrice}</span>
      <span className="text-rule-strong">·</span>
      <span className="text-ink-2">Target: ₹{targetPrice}</span>
      <span
        className={`px-2 py-0.5 rounded-[3px] text-[12.5px] font-semibold ${
          isBelow ? 'bg-madder-soft text-madder' : 'bg-leaf-soft text-leaf'
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
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-[3px] text-[13px] font-mono font-semibold border ${
        isHigh
          ? 'bg-leaf-soft text-leaf border-leaf/30'
          : isMid
          ? 'bg-haldi-soft text-haldi border-haldi/30'
          : 'bg-madder-soft text-madder border-madder/30'
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
    <div className="relative pl-6 border-l border-rule-strong space-y-5 my-4">
      {events.map((ev) => (
        <div key={ev.id} className="relative">
          <span className="absolute -left-[29px] top-1.5 w-2.5 h-2.5 rounded-full bg-leaf ring-4 ring-sheet" />
          <div className="text-[14px] font-medium text-ink">{ev.title}</div>
          <div className="text-[13px] text-ink-3 mt-0.5 flex gap-2">
            <span>By {ev.actor}</span>
            <span>·</span>
            <span>{formatISTDate(ev.timestamp, true)}</span>
          </div>
          {ev.notes && (
            <p className="mt-1.5 text-[13px] text-ink-2 bg-paper p-2 rounded-[3px] border border-rule">
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
    <div className="p-4 rounded-[4px] border border-rule-strong bg-sheet">
      <div className="flex items-center justify-between mb-1.5">
        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-haldi">
          <span className="w-[7px] h-[7px] rounded-full bg-current" />
          {type.replace(/_/g, ' ')}
        </span>
        <span className="text-[12.5px] text-ink-3 font-mono">{id}</span>
      </div>
      <h4 className="text-[15px] font-medium text-ink mb-1">{title}</h4>
      <p className="text-[13.5px] text-ink-2 mb-2 leading-relaxed">{summary}</p>
      <div className="text-[13px] text-madder bg-madder-soft px-3 py-2 rounded-[3px] mb-3 border-l-2 border-madder">
        <strong>Impact:</strong> {impact}
      </div>
      <div className="flex gap-2 justify-end">
        {onCounter && (
          <Button size="sm" variant="secondary" onClick={() => onCounter(id)}>
            Counter offer
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => onReject(id)}>
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
}: {
  columns: KanbanColumn<T>[];
  onMoveItem?: (itemId: string, targetColId: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 w-full overflow-x-auto pb-4">
      {columns.map((col) => (
        <div key={col.id} className="bg-paper border border-rule rounded-[4px] p-3.5 flex flex-col">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-ink">
            <h4 className="text-[14px] font-semibold text-ink">{col.title}</h4>
            <span className="text-[13px] text-ink-3 font-mono">
              {col.items.length}
            </span>
          </div>
          <div className="flex flex-col gap-2.5 flex-1 overflow-y-auto">
            {col.items.map((item) => (
              <div
                key={item.id}
                className="p-3 bg-sheet border border-rule rounded-[3px] hover:border-action transition-colors"
              >
                <div className="text-[14px] font-medium text-ink mb-1">{item.title}</div>
                {item.subtitle && <div className="text-[13px] text-ink-3">{item.subtitle}</div>}
                {item.badge && (
                  <span className="mt-2 inline-block text-[12.5px] font-medium px-2 py-0.5 rounded-[3px] bg-action-soft text-action">
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
      <div className="w-full h-96 bg-paper border border-rule rounded-[4px] flex items-center justify-center p-4">
        {documentUrl ? (
          <iframe src={documentUrl} title={title} className="w-full h-full rounded-[3px] bg-white" />
        ) : (
          <div className="text-center text-ink-3 text-[13.5px]">
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
    info: 'bg-sheet text-ink border-rule',
    warning: 'bg-haldi-soft text-haldi border-haldi/30',
    danger: 'bg-madder-soft text-madder border-madder/30',
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full">
      {buckets.map((b, idx) => (
        <div key={idx} className={`p-3.5 rounded-[4px] border ${toneClasses[b.tone]}`}>
          <div className="text-[13px] font-medium text-ink-2">{b.label}</div>
          <div className="text-[22px] font-serif font-medium mt-1 text-ink tabular-nums">{formatINR(b.amount)}</div>
          <div className="text-[12.5px] text-ink-3 mt-0.5">{b.count} invoices</div>
        </div>
      ))}
    </div>
  );
};
