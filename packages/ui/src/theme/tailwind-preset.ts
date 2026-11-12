import { COLOR_TOKENS, TYPOGRAPHY, SPACING } from '../tokens.js';

export const neoTailwindPreset = {
  theme: {
    extend: {
      colors: {
        brand: COLOR_TOKENS.brand,
        semantic: COLOR_TOKENS.semantics,
        module: COLOR_TOKENS.moduleAccents,
      },
      fontFamily: {
        sans: [TYPOGRAPHY.fonts.sans],
        mono: [TYPOGRAPHY.fonts.mono],
        devanagari: [TYPOGRAPHY.fonts.devanagari],
      },
      minHeight: {
        'touch-desktop': `${SPACING.touch.desktopMin}px`,
        'touch-floor': `${SPACING.touch.floorMin}px`,
      },
      minWidth: {
        'touch-desktop': `${SPACING.touch.desktopMin}px`,
        'touch-floor': `${SPACING.touch.floorMin}px`,
      },
      borderRadius: {
        card: `${SPACING.radius.card}px`,
        modal: `${SPACING.radius.modal}px`,
      },
    },
  },
};

