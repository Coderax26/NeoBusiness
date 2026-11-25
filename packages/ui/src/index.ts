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
export * from './data-entry/ImportExport.js';

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
      glassCard: 'bg-sheet border border-rule rounded-[4px]',
      elevatedCard: 'bg-sheet border border-rule-strong rounded-[4px]',
    },
    cleanSlateLight: {
      canvas: 'bg-paper text-ink',
      glassCard: 'bg-sheet border border-rule rounded-[4px]',
      elevatedCard: 'bg-sheet border border-rule-strong rounded-[4px]',
    },
  },
  accents: {
    emerald: { hex: '#2D6A40', badge: 'bg-leaf-soft text-leaf border-leaf/30' },
    indigo: { hex: '#2A4384', badge: 'bg-action-soft text-action border-action/30' },
    amber: { hex: '#94600E', badge: 'bg-haldi-soft text-haldi border-haldi/30' },
    rose: { hex: '#A3342B', badge: 'bg-madder-soft text-madder border-madder/30' },
    neutral: { hex: '#77716A', badge: 'bg-sunken text-ink-2 border-rule-strong' },
  },
  typography: {
    sans: '"IBM Plex Sans", "IBM Plex Sans Devanagari", system-ui, sans-serif',
    mono: '"IBM Plex Mono", monospace',
    devanagari: '"IBM Plex Sans Devanagari", "Noto Sans Devanagari", sans-serif',
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
