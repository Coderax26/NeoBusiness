/** @type {import('tailwindcss').Config} */
const config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        paper: 'var(--paper)',
        sheet: 'var(--sheet)',
        sunken: 'var(--sunken)',
        rule: 'var(--rule)',
        'rule-strong': 'var(--rule-strong)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        'ink-3': 'var(--ink-3)',
        action: 'var(--indigo)',
        'action-hover': 'var(--indigo-hover)',
        'action-soft': 'var(--indigo-soft)',
        madder: 'var(--madder)',
        'madder-soft': 'var(--madder-soft)',
        leaf: 'var(--leaf)',
        'leaf-soft': 'var(--leaf-soft)',
        haldi: 'var(--haldi)',
        'haldi-soft': 'var(--haldi-soft)',
      },
      fontFamily: {
        sans: [
          'var(--font-sans)',
          'var(--font-devanagari)',
          'IBM Plex Sans',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
        serif: ['var(--font-serif)', 'Source Serif 4', 'Georgia', 'serif'],
        mono: ['var(--font-mono)', 'IBM Plex Mono', 'ui-monospace', 'monospace'],
        devanagari: [
          'var(--font-devanagari)',
          'IBM Plex Sans Devanagari',
          'Noto Sans Devanagari',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};

export default config;
