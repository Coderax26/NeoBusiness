'use client';

import React, { useState } from 'react';
import { Dialog } from '../foundations/Dialog.js';
import { Button } from '../foundations/Button.js';
import { ProgressBar } from '../foundations/FeedbackStates.js';

export interface ColumnMapping {
  csvHeader: string;
  fieldKey: string;
  label: string;
  required?: boolean;
}

export interface ValidatedRow<T> {
  rowIndex: number;
  data: T;
  isValid: boolean;
  errors: string[];
}

export interface CsvImportModalProps<T> {
  open: boolean;
  onClose: () => void;
  title: string;
  entityName: string;
  expectedHeaders: { key: keyof T; label: string; required?: boolean; example: string }[];
  validator: (row: Record<string, string>, index: number) => { isValid: boolean; errors: string[]; parsed: T };
  onImport: (validRows: T[]) => Promise<{ importedCount: number; skippedCount: number }>;
}

export function CsvImportModal<T>({
  open,
  onClose,
  title,
  entityName,
  expectedHeaders,
  validator,
  onImport,
}: CsvImportModalProps<T>) {
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'summary'>('upload');
  const [rows, setRows] = useState<ValidatedRow<T>[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [importProgress, setImportProgress] = useState(0);
  const [summary, setSummary] = useState<{ imported: number; skipped: number } | null>(null);

  const handleDownloadTemplate = () => {
    const headers = expectedHeaders.map((h) => h.label).join(',');
    const examples = expectedHeaders.map((h) => `"${h.example}"`).join(',');
    const csvContent = `${headers}\n${examples}\n`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${entityName.toLowerCase()}-template.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = String(evt.target?.result || '');
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) return;

      const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
      const parsedRows: ValidatedRow<T>[] = [];

      for (let i = 1; i < lines.length; i++) {
        // Simple CSV splitter
        const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
        const rowObj: Record<string, string> = {};
        expectedHeaders.forEach((h, colIdx) => {
          rowObj[String(h.key)] = cols[colIdx] || '';
        });

        const validation = validator(rowObj, i);
        parsedRows.push({
          rowIndex: i,
          data: validation.parsed,
          isValid: validation.isValid,
          errors: validation.errors,
        });
      }

      setRows(parsedRows);
      setStep('preview');
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = async () => {
    const validRows = rows.filter((r) => r.isValid).map((r) => r.data);
    setStep('importing');
    setImportProgress(25);

    try {
      const res = await onImport(validRows);
      setImportProgress(100);
      setSummary({ imported: res.importedCount, skipped: res.skippedCount + rows.filter((r) => !r.isValid).length });
      setStep('summary');
    } catch {
      setImportProgress(100);
      setSummary({ imported: 0, skipped: rows.length });
      setStep('summary');
    }
  };

  const validCount = rows.filter((r) => r.isValid).length;
  const invalidCount = rows.filter((r) => !r.isValid).length;

  return (
    <Dialog open={open} onClose={onClose} title={title} maxWidth="xl">
      {step === 'upload' && (
        <div className="space-y-6 my-2">
          <div className="p-4 bg-teal-950/20 border border-teal-500/30 rounded-2xl flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-white">Need the correct column format?</div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Download the standardized CSV template with instructions and sample rows.
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={handleDownloadTemplate}>
              📥 Download Template
            </Button>
          </div>

          <div className="border-2 border-dashed border-zinc-700 hover:border-teal-500/60 rounded-3xl p-8 text-center bg-zinc-950/40 transition-colors">
            <div className="text-4xl mb-3">📄</div>
            <h4 className="text-sm font-bold text-white">Drop your populated CSV file here</h4>
            <p className="text-xs text-zinc-400 mt-1 mb-4">
              Accepts CSV files with UTF-8 encoding (up to 500 rows)
            </p>
            <label className="inline-block">
              <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
              <span className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-medium text-xs cursor-pointer shadow-md">
                Browse Files
              </span>
            </label>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-4 my-2">
          <div className="flex items-center justify-between bg-zinc-900 p-3 rounded-xl border border-zinc-800 text-xs">
            <div>
              <span className="text-zinc-400">File:</span> <strong className="text-white">{fileName}</strong>
            </div>
            <div className="flex gap-3">
              <span className="text-emerald-400 font-semibold">✓ {validCount} Valid</span>
              {invalidCount > 0 && <span className="text-rose-400 font-semibold">✕ {invalidCount} Invalid</span>}
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-400 font-semibold uppercase">
                <tr>
                  <th className="p-2.5 w-16">Row</th>
                  <th className="p-2.5 w-24">Status</th>
                  <th className="p-2.5">Details / Validation Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {rows.map((r) => (
                  <tr key={r.rowIndex} className={r.isValid ? 'bg-zinc-950' : 'bg-rose-950/20'}>
                    <td className="p-2.5 font-mono text-zinc-400">#{r.rowIndex}</td>
                    <td className="p-2.5">
                      {r.isValid ? (
                        <span className="text-emerald-400 font-bold">✓ Ready</span>
                      ) : (
                        <span className="text-rose-400 font-bold">✕ Error</span>
                      )}
                    </td>
                    <td className="p-2.5 text-zinc-300">
                      {r.isValid ? (
                        <span className="text-zinc-400">Row formatted correctly</span>
                      ) : (
                        <span className="text-rose-300 font-medium">{r.errors.join('; ')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between items-center pt-2">
            <Button size="sm" variant="secondary" onClick={() => setStep('upload')}>
              ← Upload Another File
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={validCount === 0}
              onClick={handleConfirmImport}
            >
              Import {validCount} Valid Records →
            </Button>
          </div>
        </div>
      )}

      {step === 'importing' && (
        <div className="text-center py-10 space-y-4">
          <div className="text-2xl animate-spin">⏳</div>
          <h4 className="text-sm font-bold text-white">Importing Records to Database...</h4>
          <div className="max-w-xs mx-auto">
            <ProgressBar value={importProgress} />
          </div>
        </div>
      )}

      {step === 'summary' && summary && (
        <div className="text-center py-8 space-y-4">
          <div className="text-4xl">🎉</div>
          <h4 className="text-base font-bold text-white">Import Completed</h4>
          <p className="text-xs text-zinc-300 max-w-sm mx-auto">
            Successfully imported <strong className="text-emerald-400 font-mono">{summary.imported}</strong> {entityName} records.
            {summary.skipped > 0 && (
              <span> Skipped {summary.skipped} invalid rows.</span>
            )}
          </p>
          <div className="pt-4 flex justify-center">
            <Button variant="primary" size="md" onClick={onClose}>
              Done & View Records
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/**
 * Universal CSV export utility for master lists and reports (§8).
 */
export function exportToCsv<T>(
  filename: string,
  rows: T[],
  columns: { key: keyof T | ((r: T) => any); label: string }[],
): void {
  if (!rows || rows.length === 0) return;
  const headerLine = columns.map((c) => `"${c.label.replace(/"/g, '""')}"`).join(',');
  const rowLines = rows.map((r) =>
    columns
      .map((c) => {
        const val = typeof c.key === 'function' ? c.key(r) : r[c.key];
        const strVal = val === undefined || val === null ? '' : String(val);
        return `"${strVal.replace(/"/g, '""')}"`;
      })
      .join(','),
  );
  const csvContent = [headerLine, ...rowLines].join('\n');
  if (typeof document !== 'undefined') {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
}

/**
 * Pure CSV parser and validator helper (F3-06)
 */
export function parseAndValidateCsv<T>(
  csvText: string,
  expectedHeaders: { key: keyof T; label: string }[],
  validator: (row: Record<string, string>, index: number) => { isValid: boolean; errors: string[]; parsed: T },
): { rows: ValidatedRow<T>[]; validCount: number; invalidCount: number } {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { rows: [], validCount: 0, invalidCount: 0 };

  const parsedRows: ValidatedRow<T>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const rowObj: Record<string, string> = {};
    expectedHeaders.forEach((h, colIdx) => {
      rowObj[String(h.key)] = cols[colIdx] || '';
    });

    const validation = validator(rowObj, i);
    parsedRows.push({
      rowIndex: i,
      data: validation.parsed,
      isValid: validation.isValid,
      errors: validation.errors,
    });
  }

  const validCount = parsedRows.filter((r) => r.isValid).length;
  const invalidCount = parsedRows.filter((r) => !r.isValid).length;

  return { rows: parsedRows, validCount, invalidCount };
}
