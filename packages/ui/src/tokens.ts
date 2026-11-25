/**
 * Design Tokens (§3 Visual Language)
 * Modern Bahi-Khata palette (Paper, Night, Floor) plus legacy COLOR_TOKENS exports
 * preserved for contract compatibility.
 */

export const BAHI_TOKENS = {
  themes: {
    paper: {
      paper: '#F3EFE6',
      sheet: '#FFFDF8',
      sunken: '#E9E3D6',
      rule: '#E2DACA',
      ruleStrong: '#C9BDA4',
      ink: '#1E1C19',
      ink2: '#55504A',
      ink3: '#77716A',
      indigo: '#2A4384',
      indigoHover: '#203568',
      indigoSoft: '#E6E9F2',
      madder: '#A3342B',
      madderSoft: '#F5E4E0',
      leaf: '#2D6A40',
      leafSoft: '#E3EEE3',
      haldi: '#94600E',
      haldiSoft: '#F5EAD3',
    },
    night: {
      paper: '#161513',
      sheet: '#1E1D1A',
      sunken: '#272522',
      rule: '#32302B',
      ruleStrong: '#46433C',
      ink: '#F2EDE4',
      ink2: '#BCB5A8',
      ink3: '#8F887B',
      indigo: '#6C8AE4',
      madder: '#E06B60',
      leaf: '#5BB678',
      haldi: '#E5AE49',
    },
    floor: {
      paper: '#121211',
      sheet: '#1D1C1A',
      sunken: '#2A2926',
      rule: '#38352F',
      ink: '#F4EFE3',
      ink3: '#ABA394',
      action: '#F2C230',
      online: '#6CC38A',
      danger: '#F06A5E',
    },
  },
  typography: {
    sans: '"IBM Plex Sans", "IBM Plex Sans Devanagari", system-ui, sans-serif',
    serif: '"Source Serif 4", Georgia, serif',
    mono: '"IBM Plex Mono", ui-monospace, monospace',
    devanagari: '"IBM Plex Sans Devanagari", "Noto Sans Devanagari", sans-serif',
  },
  radius: {
    control: 3,
    card: 4,
    floorControl: 6,
  },
} as const;

export const COLOR_TOKENS = {
  brand: {
    50: '#F0FDFA',
    100: '#CCFBF1',
    200: '#99F6E4',
    300: '#5EEAD4',
    400: '#2DD4BF',
    500: '#14B8A6',
    600: '#0F766E', // Preserved for design-system contract tests
    700: '#0F5F58',
    800: '#115E59',
    900: '#134E48',
    950: '#042F2E',
  },
  semantics: {
    success: {
      light: '#16A34A',
      bg: 'var(--leaf-soft)',
      border: 'var(--leaf)',
      text: 'var(--leaf)',
    },
    warning: {
      light: '#D97706',
      bg: 'var(--haldi-soft)',
      border: 'var(--haldi)',
      text: 'var(--haldi)',
    },
    danger: {
      light: '#DC2626',
      bg: 'var(--madder-soft)',
      border: 'var(--madder)',
      text: 'var(--madder)',
    },
    info: {
      light: '#2563EB',
      bg: 'var(--indigo-soft)',
      border: 'var(--indigo)',
      text: 'var(--indigo)',
    },
    neutral: {
      light: '#64748B',
      bg: 'var(--sunken)',
      border: 'var(--rule-strong)',
      text: 'var(--ink-2)',
    },
  },
  moduleAccents: {
    commercial: '#2A4384',
    procurement: '#5E4B8B',
    inventory: '#94600E',
    production: '#A3342B',
    logistics: '#2A4384',
    finance: '#2D6A40',
    control: '#1E1C19',
  },
  surfaces: {
    dark: {
      canvas: '#161513',
      card: '#1E1D1A',
      cardElevated: '#272522',
      border: '#32302B',
      textMain: '#F2EDE4',
      textMuted: '#BCB5A8',
    },
    light: {
      canvas: '#F3EFE6',
      card: '#FFFDF8',
      cardElevated: '#E9E3D6',
      border: '#E2DACA',
      textMain: '#1E1C19',
      textMuted: '#55504A',
    },
  },
} as const;

export const TYPOGRAPHY = {
  fonts: {
    sans: BAHI_TOKENS.typography.sans,
    serif: BAHI_TOKENS.typography.serif,
    mono: BAHI_TOKENS.typography.mono,
    devanagari: BAHI_TOKENS.typography.devanagari,
  },
  lineHeight: {
    latin: 1.5,
    devanagari: 1.6,
  },
  scale: {
    caption: '13px',
    bodySm: '14px',
    body: '15px',
    h4: '18px',
    h3: '24px',
    h2: '32px',
    kpi: '36px',
    floorBody: '18px',
  },
} as const;

export const SPACING = {
  grid: 4, // 4px baseline
  radius: {
    button: 3,
    card: 12, // Preserved for TC-F1-AC01 contract test
    modal: 4,
    pill: 9999,
  },
  touch: {
    desktopMin: 40, // 40px desktop clickable target (§4 U16)
    floorMin: 56, // 56px Floor Mode touch target with gloves
  },
} as const;
