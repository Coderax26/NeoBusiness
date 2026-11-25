import React from 'react';

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

export interface DatePickerProps {
  label: string;
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  error?: string;
  helperText?: string;
}

export const DatePicker: React.FC<DatePickerProps> = ({
  label,
  value,
  onChange,
  error,
  helperText,
}) => {
  return (
    <div className="w-full">
      <label className="block text-[13px] font-medium text-ink-2 mb-1.5 select-none">
        {label}
      </label>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-sheet border border-rule-strong rounded-[3px] px-3.5 py-2 text-[14.5px] text-ink focus:outline-none focus:ring-2 focus:ring-action/25 focus:border-action min-h-[40px]"
      />
      {error ? (
        <p role="alert" className="text-[13px] text-madder mt-1 font-medium">{error}</p>
      ) : helperText ? (
        <p className="text-[13px] text-ink-3 mt-1">{helperText}</p>
      ) : null}
    </div>
  );
};

export interface DateRangePickerProps {
  label: string;
  range: DateRange;
  onChange: (range: DateRange) => void;
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  label,
  range,
  onChange,
}) => {
  const getPreset = (preset: 'today' | 'yesterday' | 'this_week' | 'this_month' | 'last_month' | 'fy'): DateRange => {
    const now = new Date();
    const toYMD = (d: Date) => d.toISOString().split('T')[0];

    switch (preset) {
      case 'today':
        return { startDate: toYMD(now), endDate: toYMD(now) };
      case 'yesterday': {
        const y = new Date(now);
        y.setDate(y.getDate() - 1);
        return { startDate: toYMD(y), endDate: toYMD(y) };
      }
      case 'this_week': {
        const first = new Date(now);
        first.setDate(first.getDate() - first.getDay());
        return { startDate: toYMD(first), endDate: toYMD(now) };
      }
      case 'this_month': {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        return { startDate: toYMD(start), endDate: toYMD(now) };
      }
      case 'last_month': {
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const end = new Date(now.getFullYear(), now.getMonth(), 0);
        return { startDate: toYMD(start), endDate: toYMD(end) };
      }
      case 'fy': {
        const currentYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
        const start = new Date(currentYear, 3, 1);
        return { startDate: toYMD(start), endDate: toYMD(now) };
      }
    }
  };

  const presets = [
    { id: 'today', label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: 'this_week', label: 'This Week' },
    { id: 'this_month', label: 'This Month' },
    { id: 'last_month', label: 'Last Month' },
    { id: 'fy', label: 'Current FY' },
  ] as const;

  return (
    <div className="w-full">
      <label className="block text-[13px] font-medium text-ink-2 mb-1.5 select-none">
        {label}
      </label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(getPreset(p.id))}
            className="px-2.5 py-1 text-[13px] font-medium rounded-[3px] bg-paper hover:bg-sunken text-ink-2 hover:text-ink border border-rule-strong transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={range.startDate}
          onChange={(e) => onChange({ ...range, startDate: e.target.value })}
          className="flex-1 bg-sheet border border-rule-strong rounded-[3px] px-3 py-1.5 text-[13.5px] text-ink min-h-[36px]"
        />
        <span className="text-ink-3 text-[13px]">to</span>
        <input
          type="date"
          value={range.endDate}
          onChange={(e) => onChange({ ...range, endDate: e.target.value })}
          className="flex-1 bg-sheet border border-rule-strong rounded-[3px] px-3 py-1.5 text-[13.5px] text-ink min-h-[36px]"
        />
      </div>
    </div>
  );
};
