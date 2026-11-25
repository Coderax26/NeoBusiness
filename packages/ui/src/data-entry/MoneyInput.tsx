import React, { forwardRef, useState, useEffect } from 'react';
import { formatINR, toScaled, fromScaled } from '@neo/shared';

export interface MoneyInputProps {
  label?: string;
  value: string; // Exact decimal string (e.g. "482450.00")
  onChange: (value: string) => void;
  helperText?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  size?: 'md' | 'floor';
  className?: string;
  id?: string;
}

/**
 * Normalizes user input including Indian words like "1 lakh", "2.5 cr", "100000", "₹ 1,00,000.50"
 * into an exact decimal string without IEEE-754 floating-point drift.
 */
export function parseForgivingMoney(input: string): string {
  if (!input) return '0.00';
  let s = input.trim().toLowerCase().replace(/[₹,\s]/g, '');

  if (s.endsWith('lakh') || s.endsWith('lac') || s.endsWith('l')) {
    const numPart = s.replace(/(lakh|lac|l)$/, '');
    const scaled = toScaled(numPart || '1');
    const multiplied = scaled * 100000n;
    return fromScaled(multiplied, 2);
  }

  if (s.endsWith('crore') || s.endsWith('cr')) {
    const numPart = s.replace(/(crore|cr)$/, '');
    const scaled = toScaled(numPart || '1');
    const multiplied = scaled * 10000000n;
    return fromScaled(multiplied, 2);
  }

  if (s.endsWith('k')) {
    const numPart = s.replace(/k$/, '');
    const scaled = toScaled(numPart || '1');
    const multiplied = scaled * 1000n;
    return fromScaled(multiplied, 2);
  }

  try {
    const scaled = toScaled(s);
    return fromScaled(scaled, 2);
  } catch {
    return '0.00';
  }
}

export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(
  (
    {
      label,
      value,
      onChange,
      helperText,
      error,
      disabled,
      required,
      size = 'md',
      className = '',
      id,
    },
    ref,
  ) => {
    const [displayStr, setDisplayStr] = useState<string>(value);
    const [isFocused, setIsFocused] = useState(false);

    useEffect(() => {
      if (!isFocused) {
        setDisplayStr(value);
      }
    }, [value, isFocused]);

    const handleBlur = () => {
      setIsFocused(false);
      const cleanValue = parseForgivingMoney(displayStr);
      onChange(cleanValue);
      setDisplayStr(cleanValue);
    };

    const inputId = id || (label ? `money-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);

    const sizeClasses = {
      md: 'min-h-[40px] text-[14.5px] py-2 px-3',
      floor: 'min-h-[56px] text-lg font-bold py-3 px-4 rounded-[6px]',
    };

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-[13px] font-medium text-ink-2 mb-1.5 select-none">
            {label}
            {required && <span className="text-madder ml-1">*</span>}
          </label>
        )}
        <div className="relative flex items-center">
          <span className="absolute left-3 text-ink-3 font-medium pointer-events-none text-sm select-none">
            ₹
          </span>
          <input
            ref={ref}
            id={inputId}
            type="text"
            inputMode="decimal"
            disabled={disabled}
            value={isFocused ? displayStr : formatINR(value, { showSymbol: false })}
            onFocus={() => {
              setIsFocused(true);
              setDisplayStr(value);
            }}
            onChange={(e) => setDisplayStr(e.target.value)}
            onBlur={handleBlur}
            className={`w-full bg-sheet border rounded-[3px] pl-7 pr-3 text-right font-mono tabular-nums text-ink placeholder-ink-3 focus:outline-none focus:ring-2 focus:ring-action/25 transition-colors ${
              sizeClasses[size]
            } ${error ? 'border-madder bg-madder-soft' : 'border-rule-strong focus:border-action'} ${className}`}
            placeholder="0.00"
          />
        </div>
        {error ? (
          <p role="alert" className="text-[13px] text-madder mt-1 font-medium">{error}</p>
        ) : helperText ? (
          <p className="text-[13px] text-ink-3 mt-1">{helperText}</p>
        ) : null}
      </div>
    );
  },
);
MoneyInput.displayName = 'MoneyInput';

export const MoneyText: React.FC<{
  amount: string | number | null | undefined;
  className?: string;
  decimals?: number;
}> = ({ amount, className = '', decimals = 2 }) => {
  return (
    <span className={`font-mono tabular-nums text-ink select-all ${className}`}>
      {formatINR(amount, { showSymbol: true, decimals })}
    </span>
  );
};
