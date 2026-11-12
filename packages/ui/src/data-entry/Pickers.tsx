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
    brand: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
    success: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    warning: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    danger: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    neutral: 'bg-zinc-700/40 text-zinc-300 border-zinc-600',
  };

  return (
    <div className={`relative w-full ${className}`}>
      <label className="block text-xs font-semibold text-zinc-300 mb-1.5 select-none">
        {label}
        {required && <span className="text-rose-400 ml-1">*</span>}
      </label>

      {/* Selected Box / Search Input */}
      <div
        onClick={() => setIsOpen(true)}
        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 flex items-center justify-between cursor-pointer hover:border-zinc-700 min-h-[44px]"
      >
        {selectedItem ? (
          <div className="flex items-center gap-2.5">
            <Avatar name={selectedItem.title} size="sm" />
            <div>
              <div className="text-sm font-semibold text-zinc-100">{selectedItem.title}</div>
              {selectedItem.subtitle && (
                <div className="text-xs text-zinc-400">{selectedItem.subtitle}</div>
              )}
            </div>
          </div>
        ) : (
          <span className="text-sm text-zinc-500">{placeholder}</span>
        )}
        <span className="text-zinc-500 text-xs">▼</span>
      </div>

      {/* Dropdown with search and recent items */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-2 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-2.5 animate-fade-in">
          <div className="mb-2">
            <input
              type="text"
              autoFocus
              placeholder="Type to filter..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 px-2 py-1">
            {query ? 'Matching Results' : recentItems.length > 0 ? 'Recent Items' : 'All Items'}
          </div>

          <div className="max-h-56 overflow-y-auto divide-y divide-zinc-800/60">
            {filtered.length === 0 ? (
              <div className="p-3 text-center text-xs text-zinc-500">No matching items found.</div>
            ) : (
              filtered.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    onSelect(item);
                    setIsOpen(false);
                  }}
                  className="p-2.5 rounded-lg hover:bg-zinc-800 flex items-center justify-between cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <Avatar name={item.title} size="sm" />
                    <div>
                      <div className="text-xs font-semibold text-zinc-100">{item.title}</div>
                      {item.subtitle && <div className="text-[11px] text-zinc-400">{item.subtitle}</div>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-right">
                    {item.metadata && (
                      <span className="text-[11px] text-zinc-400 font-mono">{item.metadata}</span>
                    )}
                    {item.badge && (
                      <span
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
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

          <div className="mt-2 pt-2 border-t border-zinc-800 flex justify-end">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-xs text-zinc-400 hover:text-white px-2 py-1"
            >
              Close
            </button>
          </div>
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
