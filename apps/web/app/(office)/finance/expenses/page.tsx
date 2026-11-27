'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Button, KpiCard } from '@neo/ui';
import { formatINR } from '@neo/shared';

interface ExpenseRow {
  id: string;
  siteId?: string;
  siteName?: string;
  category: string;
  amount: number;
  refNo?: string;
  notes?: string;
  date: string;
}

const CATEGORIES = ['FUEL', 'UTILITIES', 'MAINTENANCE', 'OFFICE', 'PACKAGING', 'TRANSPORT', 'MISC'];

export default function FinanceExpensesPage() {
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
  const [siteId, setSiteId] = useState('');
  const [category, setCategory] = useState('FUEL');
  const [amount, setAmount] = useState('');
  const [refNo, setRefNo] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<{ text: string; isError?: boolean } | null>(null);

  const loadExpenses = useCallback(async (selectedSite?: string) => {
    try {
      const qs = selectedSite && selectedSite !== 'all' ? `?siteId=${encodeURIComponent(selectedSite)}` : '';
      const res = await fetch(`/api/proxy/finance/expenses${qs}`);
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      setExpenses(
        rows.map((e: any) => ({
          id: String(e.id),
          siteId: e.site_id ?? e.siteId,
          siteName: String(e.site_name ?? e.siteName ?? ''),
          category: String(e.category ?? e.entry_type ?? 'EXPENSE').replace(/^EXPENSE_/, ''),
          amount: Math.abs(Number(e.amount ?? 0)),
          refNo: e.ref_no ?? e.refNo ?? '',
          notes: e.notes ?? e.note ?? '',
          date: String(e.entry_date ?? e.date ?? e.created_at ?? '').slice(0, 10),
        })),
      );
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const storedSite =
      typeof window !== 'undefined' ? localStorage.getItem('neobus_active_site_id') ?? '' : '';
    Promise.all([
      fetch('/api/auth/me').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/proxy/sites').then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([me, sList]) => {
        const list = Array.isArray(sList) ? sList : Array.isArray(sList?.data) ? sList.data : [];
        setSites(list.map((s: any) => ({ id: String(s.id), name: String(s.name) })));
        const resolved =
          (storedSite && storedSite !== 'all' ? storedSite : '') ||
          me?.user?.activeSiteId ||
          list[0]?.id ||
          '';
        if (resolved) setSiteId(String(resolved));
        void loadExpenses(resolved || undefined);
      })
      .catch(() => {
        void loadExpenses();
      });
  }, [loadExpenses]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number(amount);
    if (!siteId || !parsed || parsed <= 0) {
      setBanner({ text: 'Select a valid site and enter an amount greater than 0.', isError: true });
      return;
    }
    setBanner(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/proxy/finance/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId,
          category,
          amount: parsed,
          ...(refNo.trim() ? { refNo: refNo.trim() } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          date,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || data?.error?.message || `HTTP ${res.status}`);
      }
      setAmount('');
      setRefNo('');
      setNotes('');
      setBanner({ text: `Logged ₹${parsed.toLocaleString('en-IN')} operating expense (${category}).` });
      await loadExpenses(siteId);
    } catch (err) {
      setBanner({ text: `Failed to log expense: ${(err as Error).message}`, isError: true });
    } finally {
      setSubmitting(false);
    }
  };

  const totalSpend = expenses.reduce((s, x) => s + x.amount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Operating Expenses &amp; Petty Cash</h1>
        <p className="text-sm text-ink-3">
          Log site-level operating expenses directly to the Cashbook ledger.
        </p>
      </div>

      {banner && (
        <div
          className={`rounded-[3px] border p-3 text-sm font-medium ${
            banner.isError
              ? 'border-madder/30 bg-madder-soft text-madder'
              : 'border-leaf/30 bg-leaf-soft text-leaf'
          }`}
        >
          {banner.text}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard title="Logged Expenses" value={String(expenses.length)} subtitle="Recorded entries" tone="default" />
        <KpiCard title="Total Spend" value={formatINR(totalSpend)} subtitle="Posted to cashbook" tone="warning" />
        <KpiCard
          title="Top Category"
          value={expenses[0]?.category || '—'}
          subtitle="Most recent classification"
          tone="default"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <form onSubmit={handleCreate} className="rounded-[3px] border border-rule bg-sheet p-5 space-y-4 text-xs">
          <h2 className="text-base font-bold text-ink">Record Operating Expense</h2>
          <div>
            <label className="block font-semibold text-ink-3 mb-1">Site *</label>
            <select
              value={siteId}
              onChange={(e) => {
                setSiteId(e.target.value);
                void loadExpenses(e.target.value);
              }}
              className="w-full rounded border border-rule bg-paper px-3 py-2 text-ink"
              required
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-ink-3 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded border border-rule bg-paper px-3 py-2 text-ink"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-ink-3 mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded border border-rule bg-paper px-3 py-2 text-ink"
              />
            </div>
          </div>
          <div>
            <label className="block font-semibold text-ink-3 mb-1">Amount (₹) *</label>
            <input
              type="number"
              min="1"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 1250"
              className="w-full rounded border border-rule bg-paper px-3 py-2 text-ink font-mono"
              required
            />
          </div>
          <div>
            <label className="block font-semibold text-ink-3 mb-1">Bill / Voucher Ref</label>
            <input
              type="text"
              value={refNo}
              onChange={(e) => setRefNo(e.target.value)}
              placeholder="Optional voucher ref"
              className="w-full rounded border border-rule bg-paper px-3 py-2 text-ink"
            />
          </div>
          <div>
            <label className="block font-semibold text-ink-3 mb-1">Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Purpose or paid-to details"
              className="w-full rounded border border-rule bg-paper px-3 py-2 text-ink"
            />
          </div>
          <Button variant="primary" type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Saving...' : '+ Post Expense to Cashbook'}
          </Button>
        </form>

        <div className="lg:col-span-2 overflow-hidden rounded-[3px] border border-rule bg-sheet">
          <div className="border-b border-rule bg-paper px-5 py-3 text-sm font-bold text-ink">
            Expense Ledger
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-paper uppercase text-ink-3">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Reference &amp; Notes</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {expenses.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-ink-3">
                    No operating expenses recorded yet.
                  </td>
                </tr>
              ) : (
                expenses.map((ex) => (
                  <tr key={ex.id} className="hover:bg-sunken">
                    <td className="px-4 py-3 font-mono text-ink-3">{ex.date}</td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-sunken px-2 py-0.5 font-semibold text-ink-2">
                        {ex.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink">
                      {ex.refNo && <span className="font-mono text-action mr-2">{ex.refNo}</span>}
                      <span>{ex.notes || '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-madder">
                      -{formatINR(ex.amount)}
                    </td>
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
