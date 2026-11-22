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
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 mb-3 text-right">
        <span className="text-3xl font-mono font-bold text-white tracking-wider">
          {value || '0'}
        </span>
      </div>

      {/* Grid of 56px touch buttons */}
      <div className="grid grid-cols-3 gap-2.5">
        {keys.flat().map((k, idx) => {
          if (!k) return <div key={idx} />;

          const isAction = k === 'BACK';

          return (
            <button
              key={idx}
              type="button"
              onClick={() => handlePress(k)}
              className={`h-16 min-h-[56px] rounded-xl text-xl font-bold flex items-center justify-center transition-transform active:scale-95 focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-md ${
                isAction
                  ? 'bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-zinc-700'
                  : 'bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-800'
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
          className="h-14 min-h-[56px] rounded-xl text-sm font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 active:scale-95"
        >
          Clear
        </button>
        {onSubmit && (
          <button
            type="button"
            onClick={onSubmit}
            className="h-14 min-h-[56px] rounded-xl text-base font-bold bg-teal-600 hover:bg-teal-500 text-white shadow-lg shadow-teal-950/40 border border-teal-500/40 active:scale-95"
          >
            Enter ↵
          </button>
        )}
      </div>
    </div>
  );
};

