'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, KpiCard, exportToCsv } from '@neo/ui';
import { formatINR } from '@neo/shared';

interface CashbookRow {
  id: string;
  date: string;
  entryType: string;
  amount: number;
  refId?: string;
  note?: string;
}

export default function FinanceCashbookPage() {
  const [entries, setEntries] = useState<CashbookRow[]>([]);
  const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
  const [siteId, setSiteId] = useState('ALL');
  const [fromDate, setFromDate] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);

  const loadCashbook = useCallback(async (selectedSite: string, from: string, to: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedSite && selectedSite !== 'ALL') params.set('siteId', selectedSite);
      if (from) params.set('dateFrom', from);
      if (to) params.set('dateTo', to);
      const res = await fetch(`/api/proxy/finance/cashbook?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      setEntries(
        list.map((r: any) => ({
          id: String(r.id),
          date: String(r.entry_date ?? r.date ?? r.created_at ?? '').slice(0, 10),
          entryType: String(r.entry_type ?? r.entryType ?? 'ENTRY'),
          amount: Number(r.amount ?? 0),
          refId: r.ref_id ?? r.refNo ?? '',
          note: r.notes ?? r.note ?? '',
        })),
      );
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch('/api/proxy/sites')
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => {
        const sRows = Array.isArray(list) ? list : Array.isArray(list?.data) ? list.data : [];
        setSites(sRows.map((s: any) => ({ id: String(s.id), name: String(s.name) })));
      })
      .catch(() => {});
    void loadCashbook(siteId, fromDate, toDate);
  }, [loadCashbook, siteId, fromDate, toDate]);

  const { totalIn, totalOut, rowsWithBalance } = useMemo(() => {
    let inflow = 0;
    let outflow = 0;
    const chrono = entries.slice().reverse();
    let run = 0;
    const computed = chrono.map((e) => {
      if (e.amount >= 0) inflow += e.amount;
      else outflow += Math.abs(e.amount);
      run += e.amount;
      return { ...e, runningBalance: run };
    });
    return {
      totalIn: inflow,
      totalOut: outflow,
      rowsWithBalance: computed.reverse(),
    };
  }, [entries]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Site Cashbook Register</h1>
          <p className="text-sm text-ink-3">
            Consolidated cash inflows (collections &amp; handovers) and outflows (expenses &amp; supplier payments).
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            exportToCsv('cashbook-register.csv', rowsWithBalance, [
              { key: 'date', label: 'Date' },
              { key: 'entryType', label: 'Type' },
              { key: 'note', label: 'Narration' },
              { key: 'amount', label: 'Net Amount' },
              { key: 'runningBalance', label: 'Running Balance' },
            ])
          }
        >
          📤 Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard title="Cash Inflows" value={formatINR(totalIn)} subtitle="Receipts & deposits" tone="success" />
        <KpiCard title="Cash Outflows" value={formatINR(totalOut)} subtitle="Expenses & payouts" tone="danger" />
        <KpiCard title="Net Cash Flow" value={formatINR(totalIn - totalOut)} subtitle="Period balance" tone="default" />
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-[3px] border border-rule bg-sheet p-4 text-xs">
        <div>
          <label className="block font-semibold text-ink-3 mb-1">Site</label>
          <select
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="rounded border border-rule bg-paper px-3 py-1.5 text-ink"
          >
            <option value="ALL">All Sites</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-semibold text-ink-3 mb-1">From</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="rounded border border-rule bg-paper px-3 py-1.5 text-ink"
          />
        </div>
        <div>
          <label className="block font-semibold text-ink-3 mb-1">To</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded border border-rule bg-paper px-3 py-1.5 text-ink"
          />
        </div>
        <Button variant="secondary" size="sm" onClick={() => void loadCashbook(siteId, fromDate, toDate)}>
          ↻ Refresh
        </Button>
      </div>

      <div className="overflow-hidden rounded-[3px] border border-rule bg-sheet">
        <table className="w-full text-left text-xs">
          <thead className="bg-paper uppercase text-ink-3">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Entry Type</th>
              <th className="px-4 py-3">Narration / Ref</th>
              <th className="px-4 py-3 text-right">In / Out</th>
              <th className="px-4 py-3 text-right">Running Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-ink-3">
                  Loading cashbook entries...
                </td>
              </tr>
            ) : rowsWithBalance.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-ink-3">
                  No cashbook entries in this date range.
                </td>
              </tr>
            ) : (
              rowsWithBalance.map((row) => (
                <tr key={row.id} className="hover:bg-sunken">
                  <td className="px-4 py-3 font-mono text-ink-3">{row.date}</td>
                  <td className="px-4 py-3 font-mono font-semibold text-ink-2">{row.entryType}</td>
                  <td className="px-4 py-3 text-ink">{row.note || row.refId || '—'}</td>
                  <td
                    className={`px-4 py-3 text-right font-mono font-bold ${
                      row.amount >= 0 ? 'text-leaf' : 'text-madder'
                    }`}
                  >
                    {row.amount >= 0 ? `+${formatINR(row.amount)}` : `-${formatINR(Math.abs(row.amount))}`}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-ink">
                    {formatINR(row.runningBalance)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
