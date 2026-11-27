'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { INITIAL_EXTENSIONS, type ErpExtensionItem } from '../../../src/lib/extensions-data';
import { SettingsPageHeader } from '../../../src/components/settings/SettingsPageHeader';

const FRIENDLY_EXTENSION_DESCRIPTIONS: Record<string, { title: string; description: string }> = {
  'ext-1': {
    title: 'WhatsApp Order Intake',
    description: 'Turn incoming customer WhatsApp messages into draft sales orders automatically.',
  },
  'ext-2': {
    title: 'Special Customer Price Lists & UPI Payment Links',
    description: 'Set custom contract prices for key buyers and include instant UPI payment links on invoices.',
  },
  'ext-3': {
    title: 'Barcode & QR Scanner Support',
    description: 'Scan product labels and storage bins with a handheld scanner or phone camera.',
  },
  'ext-4': {
    title: 'Batch Traceability & Quality Checks',
    description: 'Track raw material lots through production batches to customer deliveries for quick recall.',
  },
  'ext-5': {
    title: 'Bank Statement Matching & Expense Approvals',
    description: 'Import bank statements and match customer receipts and supplier payments automatically.',
  },
  'ext-6': {
    title: 'Staff Payroll & Driver Incentives',
    description: 'Calculate piece-rate wages, statutory deductions, and delivery trip incentives.',
  },
  'ext-7': {
    title: 'Vehicle Maintenance & Route Planning',
    description: 'Schedule truck servicing reminders and plan efficient daily delivery routes.',
  },
  'ext-8': {
    title: 'Smart Business Assistant & Custom Reports',
    description: 'Ask plain questions about your sales and build custom summary tables.',
  },
};

const PRIORITY_LABELS: Record<'ALL' | 'H' | 'M' | 'L', string> = {
  ALL: 'All Add-Ons',
  H: 'Recommended',
  M: 'Helpful',
  L: 'Optional',
};

export default function ErpExtensionsPage() {
  const [extensions, setExtensions] = useState<ErpExtensionItem[]>(() =>
    INITIAL_EXTENSIONS.map((item) => ({
      ...item,
      ...(FRIENDLY_EXTENSION_DESCRIPTIONS[item.id] || {}),
    })),
  );
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | 'H' | 'M' | 'L'>('ALL');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [latestBatch, setLatestBatch] = useState<{
    batchNo: string;
    itemName: string;
    siteName: string;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/proxy/admin/feature-flags')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        const list = Array.isArray(res?.flags)
          ? res.flags
          : Array.isArray(res?.data)
            ? res.data
            : [];
        const knownIds = new Set(INITIAL_EXTENSIONS.map((e) => e.id));
        const flagMap = new Map<string, boolean>();
        for (const f of list) {
          const key = String(f.key || '');
          if (knownIds.has(key)) {
            flagMap.set(key, Boolean(f.enabled));
          }
        }
        if (flagMap.size > 0) {
          setExtensions((prev) =>
            prev.map((item) =>
              flagMap.has(item.id)
                ? { ...item, enabledFlag: flagMap.get(item.id)! }
                : item,
            ),
          );
        }
      })
      .catch(() => {});

    fetch('/api/proxy/inventory/stock/current?limit=1')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        if (list[0]) {
          setLatestBatch({
            batchNo: list[0].batch_number ?? '-',
            itemName: list[0].item_name ?? 'Item',
            siteName: list[0].site_name ?? 'Site',
          });
          setBarcodeInput(list[0].batch_number ?? '');
        }
      })
      .catch(() => {});
  }, []);

  const filtered = useMemo(
    () =>
      extensions.filter((e) => (priorityFilter === 'ALL' ? true : e.priority === priorityFilter)),
    [extensions, priorityFilter],
  );

  async function toggleFlag(id: string) {
    const target = extensions.find((e) => e.id === id);
    const nextEnabled = !(target?.enabledFlag ?? false);
    setExtensions((prev) =>
      prev.map((e) => (e.id === id ? { ...e, enabledFlag: nextEnabled } : e)),
    );
    try {
      const res = await fetch(`/api/proxy/admin/feature-flags/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      if (res.ok) {
        setToast(
          `${target?.title || 'Add-on'} is now ${nextEnabled ? 'enabled' : 'turned off'}.`,
        );
      }
    } catch {
      // ignore network error
    }
  }

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        title="Optional Add-Ons & Tools"
        subtitle="Turn extra capabilities like barcode scanning, batch tracking, and WhatsApp order intake on or off."
        whatIsThis="Your core billing, inventory, and delivery tools are always active. Use this page to enable optional add-on tools when your business is ready for them."
      />

      {toast && (
        <div className="rounded-[3px] border border-leaf/30 bg-leaf-soft px-4 py-2.5 text-sm font-medium text-leaf">
          {toast}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {(['ALL', 'H', 'M', 'L'] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPriorityFilter(p)}
            className={`rounded-[3px] px-3 py-1.5 text-xs font-semibold ${
              priorityFilter === p
                ? 'bg-action text-white'
                : 'border border-rule-strong bg-sheet text-ink-2 hover:text-ink'
            }`}
          >
            {PRIORITY_LABELS[p]}
          </button>
        ))}
      </div>

      {/* Scanner & Batch Recall Tools */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-[4px] border border-rule bg-sheet p-5 space-y-3">
          <h2 className="text-base font-bold text-ink">Barcode &amp; QR Scanner Test</h2>
          <p className="text-xs text-ink-3">
            Works with handheld USB/Bluetooth barcode scanners and mobile phone cameras during stock counts.
          </p>
          <input
            type="text"
            value={barcodeInput}
            onChange={(e) => setBarcodeInput(e.target.value)}
            placeholder="Scan a barcode or type a batch number to test..."
            className="w-full rounded-[3px] border border-rule-strong bg-paper px-3 py-2 font-mono text-sm text-ink"
          />
          <div className="rounded-[3px] border border-leaf/30 bg-leaf-soft p-3 text-xs text-leaf">
            <strong>Detected Code:</strong>{' '}
            <span className="font-mono">{barcodeInput || 'Waiting for scan'}</span> — Ready for warehouse &amp; factory floor screens.
          </div>
        </div>

        <div className="rounded-[4px] border border-rule bg-sheet p-5 space-y-2">
          <h2 className="text-base font-bold text-ink">Product Batch Recall Lookup</h2>
          <p className="text-xs text-ink-3">
            Shows the latest active stock batch so you can trace where products came from and where they were delivered.
          </p>
          {latestBatch ? (
            <div className="rounded-[3px] border border-rule bg-paper p-3 space-y-1 text-xs">
              <div className="text-ink-2">
                Latest Batch: <strong className="font-mono text-ink">{latestBatch.batchNo}</strong>
              </div>
              <div className="text-ink-2">
                Product: <strong className="text-ink">{latestBatch.itemName}</strong>
              </div>
              <div className="text-ink-2">
                Location: <strong className="text-ink">{latestBatch.siteName}</strong>
              </div>
            </div>
          ) : (
            <div className="text-xs text-ink-3">
              No active stock batches found yet. Batches appear once stock is received or produced.
            </div>
          )}
        </div>
      </div>

      {/* Extensions Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {filtered.map((ext) => (
          <div
            key={ext.id}
            className="flex items-start justify-between gap-4 rounded-[4px] border border-rule bg-sheet p-5"
          >
            <div>
              <div className="flex items-center gap-2 text-xs">
                <span className="rounded bg-sunken px-2 py-0.5 font-semibold text-ink-2">
                  {ext.domain}
                </span>
                <span className="rounded bg-haldi-soft px-2 py-0.5 font-semibold text-haldi">
                  {PRIORITY_LABELS[ext.priority]}
                </span>
              </div>
              <h3 className="mt-2 text-base font-bold text-ink">{ext.title}</h3>
              <p className="mt-1 text-xs text-ink-2 leading-relaxed">{ext.description}</p>
            </div>
            <button
              type="button"
              onClick={() => void toggleFlag(ext.id)}
              className={`shrink-0 rounded-full px-3.5 py-1 text-xs font-semibold ${
                ext.enabledFlag
                  ? 'bg-leaf text-white'
                  : 'bg-paper border border-rule-strong text-ink-2 hover:text-ink'
              }`}
            >
              {ext.enabledFlag ? 'Enabled' : 'Turn On'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
