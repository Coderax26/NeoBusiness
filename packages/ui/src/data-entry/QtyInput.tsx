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
    md: 'min-h-[40px] text-[14.5px] py-2 px-3',
    floor: 'min-h-[56px] text-lg font-bold py-3 px-4 rounded-[6px]',
  };

  return (
    <div className={`w-full ${className}`}>
      <label className="block text-[13px] font-medium text-ink-2 mb-1.5 select-none">
        {label}
      </label>
      <div className="flex rounded-[3px] overflow-hidden border border-rule-strong focus-within:ring-2 focus-within:ring-action/25 focus-within:border-action">
        <input
          type="text"
          inputMode="decimal"
          value={internalQty}
          onChange={(e) => setInternalQty(e.target.value)}
          onBlur={handleBlur}
          className={`flex-1 bg-sheet px-3 py-2 text-right font-mono tabular-nums text-ink placeholder-ink-3 focus:outline-none ${sizeClasses[size]}`}
          placeholder="0.000"
        />
        {onUomChange && availableUoms.length > 1 ? (
          <select
            value={uom}
            onChange={(e) => onUomChange(e.target.value)}
            className="bg-paper border-l border-rule-strong px-3 text-[13px] font-medium text-ink-2 focus:outline-none"
          >
            {availableUoms.map((u) => (
              <option key={u} value={u} className="bg-sheet text-ink">
                {u}
              </option>
            ))}
          </select>
        ) : (
          <span className="bg-paper border-l border-rule-strong px-3.5 flex items-center text-[13px] font-medium text-ink-2 select-none">
            {uom}
          </span>
        )}
      </div>

      {dualUomHint && (
        <div className="mt-1 text-[13px] text-action font-mono flex items-center gap-1">
          <span>⇄</span>
          <span>Dual UoM Preview: {dualUomHint}</span>
        </div>
      )}

      {error ? (
        <p role="alert" className="text-[13px] text-madder mt-1 font-medium">{error}</p>
      ) : helperText ? (
        <p className="text-[13px] text-ink-3 mt-1">{helperText}</p>
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
  const digits = value.replace(/\D/g, '');
  const localDigits = digits.startsWith('91') && digits.length > 10 ? digits.slice(2) : digits;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    const clean = raw.slice(0, 10);
    onChange(clean);
  };

  const formatted =
    localDigits.length > 5
      ? `${localDigits.slice(0, 5)} ${localDigits.slice(5)}`
      : localDigits;

  return (
    <div className="w-full">
      <label className="block text-[13px] font-medium text-ink-2 mb-1.5 select-none">
        {label}
        {required && <span className="text-madder ml-1">*</span>}
      </label>
      <div className="flex rounded-[3px] overflow-hidden border border-rule-strong focus-within:ring-2 focus-within:ring-action/25 focus-within:border-action">
        <span className="bg-paper px-3 flex items-center text-[13.5px] font-medium text-ink-2 select-none border-r border-rule">
          +91
        </span>
        <input
          type="tel"
          inputMode="numeric"
          maxLength={11}
          value={formatted}
          onChange={handleChange}
          className="flex-1 bg-sheet px-3.5 py-2 text-[15px] text-ink font-mono placeholder-ink-3 focus:outline-none min-h-[40px]"
          placeholder="98765 43210"
        />
      </div>
      {error ? (
        <p role="alert" className="text-[13px] text-madder mt-1 font-medium">{error}</p>
      ) : helperText ? (
        <p className="text-[13px] text-ink-3 mt-1">{helperText}</p>
      ) : null}
    </div>
  );
};
