/**
 * @neo/ui — NeoBus Design System & Usability Component Library (§5)
 */

export * from './tokens.js';
export * from './theme/theme-provider.js';
export * from './theme/tailwind-preset.js';

// Foundations (§5.1)
export * from './foundations/Button.js';
export * from './foundations/IconButton.js';
export * from './foundations/Badge.js';
export * from './foundations/StatusPill.js';
export * from './foundations/HelpTip.js';
export * from './foundations/Tooltip.js';
export * from './foundations/Card.js';
export * from './foundations/Dialog.js';
export * from './foundations/Drawer.js';
export * from './foundations/FeedbackStates.js';

// Data Entry (§5.2)
export * from './data-entry/Inputs.js';
export * from './data-entry/MoneyInput.js';
export * from './data-entry/QtyInput.js';
export * from './data-entry/DatePickers.js';
export * from './data-entry/NumericKeypad.js';
export * from './data-entry/Pickers.js';
export * from './data-entry/LineItemGrid.js';

// Data Display (§5.3)
export * from './data-display/DataTable.js';
export * from './data-display/DisplayWidgets.js';

// Templates (§5.4)
export * from './templates/PageTemplates.js';

// Help Primitives (F1-10)
export * from './help/HelpPrimitives.js';

// Legacy / View-Model Compatibility
export const DESIGN_TOKENS = {
  themes: {
    obsidianDark: {
      canvas: 'bg-zinc-950 text-zinc-100',
      glassCard:
        'backdrop-blur-md bg-zinc-900/60 border border-zinc-800/70 shadow-xl shadow-black/25',
      elevatedCard:
        'backdrop-blur-xl bg-zinc-900/80 border border-indigo-500/30 shadow-2xl shadow-indigo-950/30',
    },
    cleanSlateLight: {
      canvas: 'bg-slate-50 text-slate-900',
      glassCard:
        'backdrop-blur-md bg-white/80 border border-slate-200/80 shadow-lg shadow-slate-900/5',
      elevatedCard:
        'backdrop-blur-xl bg-white/95 border border-indigo-500/30 shadow-xl shadow-indigo-900/10',
    },
  },
  accents: {
    emerald: { hex: '#10B981', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
    indigo: { hex: '#6366F1', badge: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30' },
    amber: { hex: '#F59E0B', badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
    rose: { hex: '#EF4444', badge: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
    neutral: { hex: '#71717A', badge: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30' },
  },
  typography: {
    sans: 'Inter, system-ui, sans-serif',
    mono: '"JetBrains Mono", monospace',
    devanagari: '"Noto Sans Devanagari", sans-serif',
    devanagariLineHeight: 1.6,
  },
  touchTargetMinPx: 48,
} as const;

export type EntityType =
  | 'ORDER'
  | 'INVOICE'
  | 'AR_AGING'
  | 'PO'
  | 'WORK_ORDER'
  | 'TRIP'
  | 'EXCEPTION';

export type SemanticTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface StatusPillTheme {
  tone: SemanticTone;
  icon: string;
  className: string;
}

const STATUS_MAP: Record<EntityType, Record<string, SemanticTone>> = {
  ORDER: {
    DRAFT: 'neutral',
    PENDING_APPROVAL: 'warning',
    CONFIRMED: 'info',
    IN_PRODUCTION_SOURCING: 'info',
    READY: 'success',
    DISPATCHED: 'info',
    DELIVERED: 'success',
    DELIVERED_FULL: 'success',
    DELIVERED_PARTIAL: 'warning',
    CLOSED: 'neutral',
    CANCELLED: 'danger',
    REJECTED: 'danger',
  },
  INVOICE: {
    UNPAID: 'neutral',
    PARTIAL: 'warning',
    PAID: 'success',
    OVERDUE: 'danger',
  },
  AR_AGING: {
    '0_7': 'info',
    '8_15': 'warning',
    '16_30': 'warning',
    '30_PLUS': 'danger',
  },
  PO: {
    DRAFT: 'neutral',
    PENDING_APPROVAL: 'warning',
    ISSUED: 'info',
    PARTIALLY_RECEIVED: 'info',
    CLOSED: 'success',
  },
  WORK_ORDER: {
    PLANNED: 'neutral',
    QUEUED: 'neutral',
    IN_PROGRESS: 'info',
    COOKING: 'info',
    PROCESSING: 'info',
    PACKING: 'info',
    COMPLETED: 'success',
    VARIANCE_FLAG: 'danger',
  },
  TRIP: {
    PLANNED: 'neutral',
    LOADING: 'neutral',
    IN_TRANSIT: 'info',
    COMPLETED: 'success',
    FAILED: 'danger',
  },
  EXCEPTION: {
    PENDING: 'warning',
    APPROVED: 'success',
    REJECTED: 'danger',
    COUNTERED: 'info',
    EXPIRED: 'neutral',
  },
};

const TONE_ICONS: Record<SemanticTone, string> = {
  success: '✓',
  warning: '▲',
  danger: '✕',
  info: '●',
  neutral: '○',
};

const TONE_CLASSES: Record<SemanticTone, string> = {
  success: DESIGN_TOKENS.accents.emerald.badge,
  warning: DESIGN_TOKENS.accents.amber.badge,
  danger: DESIGN_TOKENS.accents.rose.badge,
  info: DESIGN_TOKENS.accents.indigo.badge,
  neutral: DESIGN_TOKENS.accents.neutral.badge,
};

export function getStatusPillTheme(entity: EntityType, status: string): StatusPillTheme {
  const tone = STATUS_MAP[entity]?.[status] ?? 'neutral';
  return {
    tone,
    icon: TONE_ICONS[tone],
    className: TONE_CLASSES[tone],
  };
}

export function buildSparklineSvgPoints(
  values: number[],
  width = 120,
  height = 32,
): string {
  if (!values || values.length === 0) return '';
  if (values.length === 1) return `0,${height / 2} ${width},${height / 2}`;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return values
    .map((v, idx) => {
      const x = Number(((idx / (values.length - 1)) * width).toFixed(1));
      const y = Number((height - ((v - min) / range) * (height - 6) - 3).toFixed(1));
      return `${x},${y}`;
    })
    .join(' ');
}
