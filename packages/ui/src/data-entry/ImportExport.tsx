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
        <div className="space-y-5 my-2">
          <div className="p-4 bg-paper border border-rule rounded-[4px] flex items-center justify-between">
            <div>
              <div className="text-[14px] font-semibold text-ink">Need the correct column format?</div>
              <p className="text-[13px] text-ink-3 mt-0.5">
                Download the standardized CSV template with instructions and sample rows.
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={handleDownloadTemplate}>
              Download Template
            </Button>
          </div>

          <div className="border-2 border-dashed border-rule-strong hover:border-action rounded-[4px] p-8 text-center bg-paper/60 transition-colors">
            <h4 className="text-[15px] font-semibold text-ink">Drop your populated CSV file here</h4>
            <p className="text-[13px] text-ink-3 mt-1 mb-4">
              Accepts CSV files with UTF-8 encoding (up to 500 rows)
            </p>
            <label className="inline-block">
              <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
              <span className="inline-flex items-center px-4 py-2 rounded-[3px] bg-action hover:bg-action-hover text-white font-medium text-[13.5px] cursor-pointer">
                Browse Files
              </span>
            </label>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-4 my-2">
          <div className="flex items-center justify-between bg-paper p-3 rounded-[3px] border border-rule text-[13px]">
            <div>
              <span className="text-ink-3">File:</span> <strong className="text-ink">{fileName}</strong>
            </div>
            <div className="flex gap-3">
              <span className="text-leaf font-semibold">✓ {validCount} Valid</span>
              {invalidCount > 0 && <span className="text-madder font-semibold">✕ {invalidCount} Invalid</span>}
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto border border-rule rounded-[4px] overflow-hidden bg-sheet">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-paper border-b border-ink text-ink-3 font-medium">
                <tr>
                  <th className="p-2.5 w-16">Row</th>
                  <th className="p-2.5 w-24">Status</th>
                  <th className="p-2.5">Details / Validation Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {rows.map((r) => (
                  <tr key={r.rowIndex} className={r.isValid ? 'bg-sheet' : 'bg-madder-soft'}>
                    <td className="p-2.5 font-mono text-ink-3">#{r.rowIndex}</td>
                    <td className="p-2.5">
                      {r.isValid ? (
                        <span className="text-leaf font-semibold">✓ Ready</span>
                      ) : (
                        <span className="text-madder font-semibold">✕ Error</span>
                      )}
                    </td>
                    <td className="p-2.5 text-ink-2">
                      {r.isValid ? (
                        <span className="text-ink-3">Row formatted correctly</span>
                      ) : (
                        <span className="text-madder font-medium">{r.errors.join('; ')}</span>
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
          <h4 className="text-[15px] font-semibold text-ink">Importing Records...</h4>
          <div className="max-w-xs mx-auto">
            <ProgressBar value={importProgress} />
          </div>
        </div>
      )}

      {step === 'summary' && summary && (
        <div className="text-center py-8 space-y-4">
          <div className="w-10 h-10 rounded-full bg-leaf-soft text-leaf font-bold flex items-center justify-center mx-auto">
            ✓
          </div>
          <h4 className="text-[16px] font-serif font-medium text-ink">Import Completed</h4>
          <p className="text-[13.5px] text-ink-2 max-w-sm mx-auto">
            Successfully imported <strong className="text-leaf font-mono">{summary.imported}</strong> {entityName} records.
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
