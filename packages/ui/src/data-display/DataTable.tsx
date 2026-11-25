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
  pageSize?: number;
  emptyTitle?: string;
  emptyDescription?: string;
}

export function DataTable<T extends { id: string | number }>({
  columns,
  data,
  loading = false,
  searchPlaceholder = 'Filter rows...',
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
      {/* Clean Ruled Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 py-2 border-b border-rule no-print">
        <div className="flex items-center gap-2 flex-1 max-w-sm">
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-paper border border-rule-strong rounded-[3px] px-3 py-1.5 text-[13.5px] text-ink placeholder-ink-3 focus:outline-none focus:border-action"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Column Chooser */}
          <div className="relative group">
            <button
              type="button"
              className="px-3 py-1.5 text-[13px] font-medium rounded-[3px] bg-sheet hover:bg-paper text-ink-2 border border-rule-strong flex items-center gap-1.5"
            >
              <span>Columns ({activeColumns.length})</span>
            </button>
            <div className="absolute right-0 top-full mt-1 hidden group-hover:block z-50 bg-sheet border border-rule-strong rounded-[4px] p-3 shadow-xl min-w-[190px]">
              <div className="text-[13px] font-semibold text-ink mb-2 pb-1 border-b border-rule">
                Toggle Columns
              </div>
              <div className="flex flex-col gap-1.5">
                {columns.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-[13px] text-ink-2 cursor-pointer">
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
            className="px-3 py-1.5 text-[13px] font-medium rounded-[3px] bg-sheet hover:bg-paper text-ink-2 border border-rule-strong flex items-center gap-1.5"
          >
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-1.5 text-[13px] font-medium rounded-[3px] bg-sheet hover:bg-paper text-ink-2 border border-rule-strong flex items-center gap-1.5"
          >
            <span>Print</span>
          </button>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && bulkActions.length > 0 && (
        <div className="flex items-center justify-between bg-action-soft border border-action/30 p-2.5 px-4 rounded-[3px] text-[13.5px] text-ink">
          <span>
            <strong className="text-action">{selectedIds.size}</strong> records selected
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

      {/* Ruled Ledger Table */}
      <div className="border-b border-rule overflow-hidden bg-sheet">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13.5px]">
            <thead className="border-b-[1.5px] border-ink text-ink-3 font-medium sticky top-0 z-10 bg-sheet">
              <tr>
                {enableSelection && (
                  <th className="py-2.5 px-3 w-10 text-center">
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
                    className={`py-2.5 px-3 font-medium ${
                      col.align === 'right'
                        ? 'text-right'
                        : col.align === 'center'
                        ? 'text-center'
                        : 'text-left'
                    } ${col.sortable !== false ? 'cursor-pointer hover:text-ink select-none' : ''}`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.header}
                      {sortCol === col.id && (
                        <span className="text-action">{sortDir === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-rule tabular-nums">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {enableSelection && <td className="py-3 px-3"><Skeleton height={16} width={16} /></td>}
                    {activeColumns.map((c) => (
                      <td key={c.id} className="py-3 px-3"><Skeleton height={16} /></td>
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
                    className={`hover:bg-paper/70 transition-colors ${
                      onRowClick ? 'cursor-pointer' : ''
                    } ${selectedIds.has(item.id) ? 'bg-action-soft' : ''}`}
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
                          className={`py-3 px-3 ${
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
