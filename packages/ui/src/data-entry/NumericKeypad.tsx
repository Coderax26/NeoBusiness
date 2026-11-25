import React from 'react';

export interface NumericKeypadProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  allowDecimals?: boolean;
  submitLabel?: string;
  className?: string;
}

export const NumericKeypad: React.FC<NumericKeypadProps> = ({
  value,
  onChange,
  onSubmit,
  allowDecimals = true,
  submitLabel = 'Enter ↵',
  className = '',
}) => {
  const handlePress = (char: string) => {
    if (char === 'CLEAR') {
      onChange('0');
      return;
    }
    if (char === 'BACK') {
      if (value.length <= 1) {
        onChange('0');
      } else {
        onChange(value.slice(0, -1));
      }
      return;
    }
    if (char === '.') {
      if (!allowDecimals || value.includes('.')) return;
      onChange(value + '.');
      return;
    }

    if (value === '0') {
      onChange(char);
    } else {
      onChange(value + char);
    }
  };

  const keys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    [allowDecimals ? '.' : '', '0', 'BACK'],
  ];

  return (
    <div className={`w-full max-w-sm mx-auto select-none ${className}`}>
      {/* Display */}
      <div className="bg-sheet border border-rule-strong rounded-[6px] p-4 mb-3 text-right">
        <span className="text-4xl font-semibold text-ink tabular-nums tracking-tight">
          {value || '0'}
        </span>
      </div>

      {/* Grid of 56px+ touch buttons */}
      <div className="grid grid-cols-3 gap-2.5">
        {keys.flat().map((k, idx) => {
          if (!k) return <div key={idx} />;

          const isAction = k === 'BACK';

          return (
            <button
              key={idx}
              type="button"
              onClick={() => handlePress(k)}
              className={`h-[68px] min-h-[56px] rounded-[6px] text-2xl font-semibold flex items-center justify-center transition-colors active:scale-95 focus:outline-none focus:ring-2 focus:ring-action ${
                isAction
                  ? 'bg-sunken hover:bg-sheet text-haldi border border-rule-strong'
                  : 'bg-sunken hover:bg-sheet text-ink border border-rule'
              }`}
            >
              {k === 'BACK' ? '⌫' : k}
            </button>
          );
        })}
      </div>

      {/* Bottom Action Bar */}
      <div className="grid grid-cols-2 gap-2.5 mt-2.5">
        <button
          type="button"
          onClick={() => handlePress('CLEAR')}
          className="h-14 min-h-[56px] rounded-[6px] text-base font-semibold bg-sheet hover:bg-sunken text-ink-2 border border-rule-strong active:scale-95"
        >
          Clear
        </button>
        {onSubmit && (
          <button
            type="button"
            onClick={onSubmit}
            className="h-14 min-h-[56px] rounded-[6px] text-lg font-bold bg-[#F2C230] hover:bg-[#FAD14B] text-[#16140F] active:scale-95"
          >
            {submitLabel}
          </button>
        )}
      </div>
    </div>
  );
};
