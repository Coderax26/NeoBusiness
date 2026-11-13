import React, { useState, useMemo } from 'react';
import { Button } from '../foundations/Button.js';
import { Skeleton, EmptyState } from '../foundations/FeedbackStates.js';

export interface ColumnDef<T> {
  id: string;
  header: string;
  accessorKey?: keyof T | string;
  cell?: (item: any) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
}

export interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  loading?: boolean;
  searchPlaceholder?: string;
  onRowClick?: (item: T) => void;
  enableSelection?: boolean;
  bulkActions?: { label: string; onClick: (selectedItems: T[]) => void; tone?: 'primary' | 'danger' }[];
  exportFileName?: string;
  emptyTitle?: string;
  emptyDescription?: string;
}

export function DataTable<T extends { id: string | number }>({
  columns,
  data,
  loading = false,
  searchPlaceholder = 'Search records...',
  onRowClick,
  enableSelection = false,
  bulkActions = [],
  exportFileName = 'export.csv',
  emptyTitle = 'No records found',
  emptyDescription = 'There are no items matching this criteria.',
}: DataTableProps<T>) {
  const [query, setQuery] = useState('');
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());
  const [visibleColIds, setVisibleColIds] = useState<Set<string>>(new Set(columns.map((c) => c.id)));

  // Filter
  const filtered = useMemo(() => {
    if (!query) return data;
    return data.filter((row) =>
      Object.values(row).some((val) =>
        String(val ?? '').toLowerCase().includes(query.toLowerCase()),
      ),
    );
  }, [data, query]);

  // Sort
  const sorted = useMemo(() => {
    if (!sortCol) return filtered;
    return [...filtered].sort((a, b) => {
      const col = columns.find((c) => c.id === sortCol);
      if (!col || !col.accessorKey) return 0;
      const va = (a as any)[col.accessorKey];
      const vb = (b as any)[col.accessorKey];
      if (va === vb) return 0;
      const res = va > vb ? 1 : -1;
      return sortDir === 'asc' ? res : -res;
    });
  }, [filtered, sortCol, sortDir, columns]);

  const toggleSort = (colId: string) => {
    if (sortCol === colId) {
      if (sortDir === 'asc') setSortDir('desc');
      else {
        setSortCol(null);
        setSortDir('asc');
      }
    } else {
      setSortCol(colId);
      setSortDir('asc');
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === sorted.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sorted.map((r) => r.id)));
    }
  };

  const toggleSelectRow = (id: string | number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleExportCSV = () => {
    const activeColumns = columns.filter((c) => visibleColIds.has(c.id));
    const headerRow = activeColumns.map((c) => `"${c.header}"`).join(',');
    const rows = sorted.map((row) =>
      activeColumns
        .map((c) => {
          const val = c.accessorKey ? (row as any)[c.accessorKey] : '';
          return `"${String(val ?? '').replace(/"/g, '""')}"`;
        })
        .join(','),
    );
    const csvContent = [headerRow, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = exportFileName;
    link.click();
    URL.revokeObjectURL(url);
  };

  const selectedRows = sorted.filter((r) => selectedIds.has(r.id));
  const activeColumns = columns.filter((c) => visibleColIds.has(c.id));

  return (
    <div className="w-full flex flex-col gap-3">
      {/* Table Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-900/60 p-3 rounded-xl border border-zinc-800">
        <div className="flex items-center gap-2 flex-1 max-w-sm">
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Column Chooser */}
          <div className="relative group">
            <button
              type="button"
              className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 flex items-center gap-1.5"
            >
              <span>Columns ({activeColumns.length})</span>
            </button>
            <div className="absolute right-0 top-full mt-1 hidden group-hover:block z-50 bg-zinc-900 border border-zinc-700 rounded-xl p-3 shadow-2xl min-w-[180px]">
              <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                Toggle Columns
              </div>
              <div className="flex flex-col gap-1.5">
                {columns.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleColIds.has(c.id)}
                      onChange={() => {
                        const next = new Set(visibleColIds);
                        if (next.has(c.id)) {
                          if (next.size > 1) next.delete(c.id);
                        } else {
                          next.add(c.id);
                        }
                        setVisibleColIds(next);
                      }}
                    />
                    <span>{c.header}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleExportCSV}
            className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 flex items-center gap-1.5"
          >
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 flex items-center gap-1.5"
          >
            <span>Print</span>
          </button>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && bulkActions.length > 0 && (
        <div className="flex items-center justify-between bg-teal-950/40 border border-teal-500/40 p-2.5 px-4 rounded-xl text-xs text-teal-200 animate-slide-down">
          <span>
            <strong className="text-white">{selectedIds.size}</strong> records selected
          </span>
          <div className="flex gap-2">
            {bulkActions.map((action, idx) => (
              <Button
                key={idx}
                size="sm"
                variant={action.tone === 'danger' ? 'danger' : 'primary'}
                onClick={() => action.onClick(selectedRows)}
              >
                {action.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Table Body */}
      <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950/40">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-400 font-semibold uppercase tracking-wider sticky top-0 z-10">
              <tr>
                {enableSelection && (
                  <th className="py-3 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={sorted.length > 0 && selectedIds.size === sorted.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                )}
                {activeColumns.map((col) => (
                  <th
                    key={col.id}
                    onClick={() => col.sortable !== false && toggleSort(col.id)}
                    className={`py-3 px-4 ${
                      col.align === 'right'
                        ? 'text-right'
                        : col.align === 'center'
                        ? 'text-center'
                        : 'text-left'
                    } ${col.sortable !== false ? 'cursor-pointer hover:text-white select-none' : ''}`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.header}
                      {sortCol === col.id && (
                        <span className="text-teal-400">{sortDir === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {enableSelection && <td className="py-3 px-3"><Skeleton height={16} width={16} /></td>}
                    {activeColumns.map((c) => (
                      <td key={c.id} className="py-3 px-4"><Skeleton height={16} /></td>
                    ))}
                  </tr>
                ))
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={activeColumns.length + (enableSelection ? 1 : 0)} className="py-10">
                    <EmptyState title={emptyTitle} description={emptyDescription} />
                  </td>
                </tr>
              ) : (
                sorted.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => onRowClick?.(item)}
                    className={`hover:bg-zinc-900/50 transition-colors ${
                      onRowClick ? 'cursor-pointer' : ''
                    } ${selectedIds.has(item.id) ? 'bg-teal-950/20' : ''}`}
                  >
                    {enableSelection && (
                      <td
                        className="py-3 px-3 text-center"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelectRow(item.id);
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={() => {}}
                        />
                      </td>
                    )}
                    {activeColumns.map((col) => {
                      const cellContext =
                        item && typeof item === 'object'
                          ? Object.assign(Object.create(item), item, {
                              row: (item as any).row ?? { original: item },
                              getValue: () =>
                                col.accessorKey ? (item as any)[col.accessorKey] : undefined,
                            })
                          : item;
                      const content = col.cell
                        ? col.cell(cellContext)
                        : col.accessorKey
                        ? String((item as any)[col.accessorKey] ?? '—')
                        : '—';
                      return (
                        <td
                          key={col.id}
                          className={`py-3 px-4 ${
                            col.align === 'right'
                              ? 'text-right font-mono'
                              : col.align === 'center'
                              ? 'text-center'
                              : 'text-left'
                          }`}
                        >
                          {content}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

