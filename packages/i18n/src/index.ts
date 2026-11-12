import { EN_MESSAGES, type TranslationKey } from './messages/en.js';
import { MR_MESSAGES } from './messages/mr.js';

export type SupportedLocale = 'en' | 'mr';

const DICTIONARIES: Record<SupportedLocale, Record<TranslationKey, string>> = {
  en: EN_MESSAGES,
  mr: MR_MESSAGES,
};

/**
 * Translates a key into the requested locale ('en' | 'mr').
 * Never returns raw keys for valid TranslationKeys.
 */
export function t(
  locale: SupportedLocale,
  key: TranslationKey,
  params?: Record<string, string | number>,
): string {
  const dict = DICTIONARIES[locale] ?? DICTIONARIES.en;
  let template = dict[key] ?? DICTIONARIES.en[key] ?? key;

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      template = template.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return template;
}

export { EN_MESSAGES, MR_MESSAGES, type TranslationKey };
export * from './status-dictionary.js';
export * from './erp-glossary.js';

