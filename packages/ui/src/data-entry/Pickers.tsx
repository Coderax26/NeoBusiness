import React, { useState } from 'react';
import { Avatar } from '../foundations/Tooltip.js';

export interface PickerItem {
  id: string;
  title: string;
  subtitle?: string;
  badge?: { label: string; tone: 'brand' | 'success' | 'warning' | 'danger' | 'neutral' };
  metadata?: string; // E.g. "Available stock: 420 kg" or "Credit: ₹1.2L / ₹2.0L"
}

export interface SearchPickerProps {
  label: string;
  placeholder?: string;
  items: PickerItem[];
  selectedId: string | null;
  onSelect: (item: PickerItem) => void;
  recentItems?: PickerItem[];
  helperText?: string;
  error?: string;
  required?: boolean;
  className?: string;
}

export const SearchPicker: React.FC<SearchPickerProps> = ({
  label,
  placeholder = 'Search or pick...',
  items,
  selectedId,
  onSelect,
  recentItems = [],
  helperText,
  error,
  required,
  className = '',
}) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const selectedItem = items.find((i) => i.id === selectedId);

  const filtered = query
    ? items.filter(
        (i) =>
          i.title.toLowerCase().includes(query.toLowerCase()) ||
          i.subtitle?.toLowerCase().includes(query.toLowerCase()) ||
          i.metadata?.toLowerCase().includes(query.toLowerCase()),
      )
    : recentItems.length > 0
    ? recentItems
    : items.slice(0, 8);

  const badgeToneClasses = {
    brand: 'bg-action-soft text-action border-action/30',
    success: 'bg-leaf-soft text-leaf border-leaf/30',
    warning: 'bg-haldi-soft text-haldi border-haldi/30',
    danger: 'bg-madder-soft text-madder border-madder/30',
    neutral: 'bg-sunken text-ink-2 border-rule-strong',
  };

  return (
    <div className={`relative w-full ${className}`}>
      <label className="block text-[13px] font-medium text-ink-2 mb-1.5 select-none">
        {label}
        {required && <span className="text-madder ml-1">*</span>}
      </label>

      {/* Selected Box / Search Input */}
      <div
        onClick={() => setIsOpen(true)}
        className="w-full bg-sheet border border-rule-strong rounded-[3px] p-2.5 flex items-center justify-between cursor-pointer hover:border-action min-h-[44px]"
      >
        {selectedItem ? (
          <div className="flex items-center gap-2.5">
            <Avatar name={selectedItem.title} size="sm" />
            <div>
              <div className="text-[14px] font-medium text-ink">{selectedItem.title}</div>
              {selectedItem.subtitle && (
                <div className="text-[13px] text-ink-3">{selectedItem.subtitle}</div>
              )}
            </div>
          </div>
        ) : (
          <span className="text-[14px] text-ink-3">{placeholder}</span>
        )}
        <span className="text-ink-3 text-xs">▾</span>
      </div>

      {/* Dropdown with search and recent items */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 bg-sheet border border-rule-strong rounded-[4px] shadow-xl p-2.5">
          <div className="mb-2">
            <input
              type="text"
              autoFocus
              placeholder="Type to filter..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-paper border border-rule-strong rounded-[3px] px-3 py-1.5 text-[13.5px] text-ink placeholder-ink-3 focus:outline-none focus:border-action"
            />
          </div>

          <div className="text-[13px] font-medium text-ink-3 px-2 py-1">
            {query ? 'Matching results' : recentItems.length > 0 ? 'Recent items' : 'All items'}
          </div>

          <div className="max-h-56 overflow-y-auto divide-y divide-rule">
            {filtered.length === 0 ? (
              <div className="p-3 text-center text-[13px] text-ink-3">No matching items found.</div>
            ) : (
              filtered.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    onSelect(item);
                    setIsOpen(false);
                  }}
                  className="p-2.5 rounded-[3px] hover:bg-paper flex items-center justify-between cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <Avatar name={item.title} size="sm" />
                    <div>
                      <div className="text-[13.5px] font-medium text-ink">{item.title}</div>
                      {item.subtitle && <div className="text-[13px] text-ink-3">{item.subtitle}</div>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-right">
                    {item.metadata && (
                      <span className="text-[13px] text-ink-2 font-mono">{item.metadata}</span>
                    )}
                    {item.badge && (
                      <span
                        className={`text-[13px] font-medium px-2 py-0.5 rounded-[3px] border ${
                          badgeToneClasses[item.badge.tone]
                        }`}
                      >
                        {item.badge.label}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-2 pt-2 border-t border-rule flex justify-end">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-[13px] text-ink-2 hover:text-ink px-2 py-1"
            >
              Close
            </button>
          </div>
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
