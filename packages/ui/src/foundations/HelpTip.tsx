import React, { useState } from 'react';
import { explainTerm } from '@neo/i18n';

export interface HelpTipProps {
  termKey?: string; // e.g. 'AR', 'GRN', 'BOM', 'FLOOR_PRICE'
  customTip?: string;
  locale?: 'en' | 'mr';
  className?: string;
}

export const HelpTip: React.FC<HelpTipProps> = ({
  termKey,
  customTip,
  locale = 'en',
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const term = termKey ? explainTerm(termKey, locale) : null;

  const title = term ? `${term.plainWord} (${term.term})` : 'Help Tip';
  const explanation = customTip || (term ? (locale === 'mr' ? term.mr : term.en) : '');
  const example = term?.example;

  return (
    <span className={`relative inline-flex items-center ml-1 text-zinc-400 ${className}`}>
      <button
        type="button"
        aria-label={`Help: ${title}`}
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="w-4 h-4 rounded-full border border-zinc-600 hover:border-zinc-400 hover:text-white flex items-center justify-center text-[10px] font-bold transition-colors focus:outline-none focus:ring-1 focus:ring-teal-500"
      >
        ?
      </button>

      {open && (
        <div
          role="tooltip"
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs shadow-xl pointer-events-none"
        >
          <div className="font-semibold text-teal-300 mb-1">{title}</div>
          <p className="leading-relaxed text-zinc-300">{explanation}</p>
          {example && <div className="mt-1 text-[11px] text-zinc-400 italic">{example}</div>}
        </div>
      )}
    </span>
  );
};
