/**
 * Design Tokens (§3 Visual Language)
 * Deep teal brand, obsidian dark + clean slate light surfaces, accessible semantic tones,
 * 4px spatial grid, and 40px/56px touch target boundaries.
 */

export const COLOR_TOKENS = {
  brand: {
    50: '#F0FDFA',
    100: '#CCFBF1',
    200: '#99F6E4',
    300: '#5EEAD4',
    400: '#2DD4BF',
    500: '#14B8A6',
    600: '#0F766E', // Deep teal brand primary (§3.1)
    700: '#0F5F58',
    800: '#115E59',
    900: '#134E48',
    950: '#042F2E',
  },
  semantics: {
    success: {
      light: '#16A34A', // Green
      bg: 'rgba(22, 163, 74, 0.12)',
      border: 'rgba(22, 163, 74, 0.35)',
      text: '#4ADE80',
    },
    warning: {
      light: '#D97706', // Amber
      bg: 'rgba(217, 119, 6, 0.12)',
      border: 'rgba(217, 119, 6, 0.35)',
      text: '#FBBF24',
    },
    danger: {
      light: '#DC2626', // Red
      bg: 'rgba(220, 38, 38, 0.12)',
      border: 'rgba(220, 38, 38, 0.35)',
      text: '#F87171',
    },
    info: {
      light: '#2563EB', // Blue
      bg: 'rgba(37, 99, 235, 0.12)',
      border: 'rgba(37, 99, 235, 0.35)',
      text: '#60A5FA',
    },
    neutral: {
      light: '#64748B', // Slate
      bg: 'rgba(100, 116, 139, 0.12)',
      border: 'rgba(100, 116, 139, 0.35)',
      text: '#94A3B8',
    },
  },
  moduleAccents: {
    commercial: '#0F766E', // Teal
    procurement: '#6366F1', // Indigo
    inventory: '#F59E0B', // Amber
    production: '#EA580C', // Orange
    logistics: '#2563EB', // Blue
    finance: '#16A34A', // Green
    control: '#8B5CF6', // Purple
  },
  surfaces: {
    dark: {
      canvas: '#09090B',
      card: '#18181B',
      cardElevated: '#27272A',
      border: '#27272A',
      textMain: '#F4F4F5',
      textMuted: '#A1A1AA',
    },
    light: {
      canvas: '#F8FAFC',
      card: '#FFFFFF',
      cardElevated: '#F1F5F9',
      border: '#E2E8F0',
      textMain: '#0F172A',
      textMuted: '#64748B',
    },
  },
} as const;

export const TYPOGRAPHY = {
  fonts: {
    sans: 'Inter, system-ui, -apple-system, sans-serif',
    mono: '"JetBrains Mono", monospace',
    devanagari: '"Noto Sans Devanagari", sans-serif',
  },
  lineHeight: {
    latin: 1.5,
    devanagari: 1.6,
  },
  scale: {
    caption: '12px',
    bodySm: '14px',
    body: '16px',
    h4: '20px',
    h3: '24px',
    h2: '32px',
    kpi: '40px',
    floorBody: '18px',
  },
} as const;

export const SPACING = {
  grid: 4, // 4px baseline
  radius: {
    button: 8,
    card: 12,
    modal: 16,
    pill: 9999,
  },
  touch: {
    desktopMin: 40, // 40px desktop clickable target (§4 U16)
    floorMin: 56, // 56px Floor Mode touch target with gloves
  },
} as const;
