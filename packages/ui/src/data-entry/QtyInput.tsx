import React, { useState } from 'react';
import { formatQty, type DualUomConfig } from '@neo/shared';

export interface QtyInputProps {
  label: string;
  qty: string;
  uom: string;
  onQtyChange: (qty: string) => void;
  onUomChange?: (uom: string) => void;
  availableUoms?: string[];
  dualUomConfig?: DualUomConfig;
  error?: string;
  helperText?: string;
  size?: 'md' | 'floor';
  className?: string;
}

export const QtyInput: React.FC<QtyInputProps> = ({
  label,
  qty,
  uom,
  onQtyChange,
  onUomChange,
  availableUoms = ['kg', 'crate', 'litre', 'pcs', 'box'],
  dualUomConfig,
  error,
  helperText,
  size = 'md',
  className = '',
}) => {
  const [internalQty, setInternalQty] = useState(qty);

  const handleBlur = () => {
    const num = parseFloat(internalQty);
    if (!Number.isNaN(num) && num >= 0) {
      const fixed = Number(num.toFixed(3)).toString();
      onQtyChange(fixed);
      setInternalQty(fixed);
    } else {
      onQtyChange('0');
      setInternalQty('0');
    }
  };

  const dualUomHint = dualUomConfig && qty ? formatQty(qty, uom, dualUomConfig) : null;

  const sizeClasses = {
    md: 'min-h-[40px] text-sm py-2 px-3',
    floor: 'min-h-[56px] text-lg font-bold py-3 px-4 rounded-xl',
  };

  return (
    <div className={`w-full ${className}`}>
      <label className="block text-xs font-semibold text-zinc-300 mb-1.5 select-none">
        {label}
      </label>
      <div className="flex rounded-lg overflow-hidden border border-zinc-800 focus-within:ring-2 focus-within:ring-teal-500">
        <input
          type="text"
          inputMode="decimal"
          value={internalQty}
          onChange={(e) => setInternalQty(e.target.value)}
          onBlur={handleBlur}
          className={`flex-1 bg-zinc-900 px-3 py-2 text-right font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none ${sizeClasses[size]}`}
          placeholder="0.000"
        />
        {onUomChange && availableUoms.length > 1 ? (
          <select
            value={uom}
            onChange={(e) => onUomChange(e.target.value)}
            className="bg-zinc-800 border-l border-zinc-700 px-3 text-xs font-semibold text-zinc-200 focus:outline-none"
          >
            {availableUoms.map((u) => (
              <option key={u} value={u} className="bg-zinc-900">
                {u}
              </option>
            ))}
          </select>
        ) : (
          <span className="bg-zinc-800/80 border-l border-zinc-700 px-3.5 flex items-center text-xs font-semibold text-zinc-400 select-none">
            {uom}
          </span>
        )}
      </div>

      {dualUomHint && (
        <div className="mt-1 text-[11px] text-teal-300 font-mono flex items-center gap-1">
          <span>⇄</span>
          <span>Dual UoM Preview: {dualUomHint}</span>
        </div>
      )}

      {error ? (
        <p role="alert" className="text-xs text-rose-400 mt-1 font-medium">{error}</p>
      ) : helperText ? (
        <p className="text-xs text-zinc-400 mt-1">{helperText}</p>
      ) : null}
    </div>
  );
};

export interface PhoneInputProps {
  label: string;
  value: string; // E.g. "9876543210" or "+919876543210"
  onChange: (value: string) => void;
  error?: string;
  helperText?: string;
  required?: boolean;
}

export const PhoneInput: React.FC<PhoneInputProps> = ({
  label,
  value,
  onChange,
  error,
  helperText,
  required,
}) => {
  // Strip non-digits
  const digits = value.replace(/\D/g, '');
  const localDigits = digits.startsWith('91') && digits.length > 10 ? digits.slice(2) : digits;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    const clean = raw.slice(0, 10);
    onChange(clean);
  };

  // Format as 5 + 5 digits: "98765 43210"
  const formatted =
    localDigits.length > 5
      ? `${localDigits.slice(0, 5)} ${localDigits.slice(5)}`
      : localDigits;

  return (
    <div className="w-full">
      <label className="block text-xs font-semibold text-zinc-300 mb-1.5 select-none">
        {label}
        {required && <span className="text-rose-400 ml-1">*</span>}
      </label>
      <div className="flex rounded-lg overflow-hidden border border-zinc-800 focus-within:ring-2 focus-within:ring-teal-500">
        <span className="bg-zinc-800 px-3 flex items-center text-xs font-semibold text-zinc-400 select-none border-r border-zinc-700">
          🇮🇳 +91
        </span>
        <input
          type="tel"
          inputMode="numeric"
          maxLength={11}
          value={formatted}
          onChange={handleChange}
          className="flex-1 bg-zinc-900 px-3.5 py-2 text-sm text-zinc-100 font-mono placeholder-zinc-500 focus:outline-none min-h-[40px]"
          placeholder="98765 43210"
        />
      </div>
      {error ? (
        <p role="alert" className="text-xs text-rose-400 mt-1 font-medium">{error}</p>
      ) : helperText ? (
        <p className="text-xs text-zinc-400 mt-1">{helperText}</p>
      ) : null}
    </div>
  );
};

