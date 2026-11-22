'use client';

import React, { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { evaluateEodChecklist } from '@neo/shared';

export default function EodClosingPage() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [started, setStarted] = useState(true);
  const [openTripsCount, setOpenTripsCount] = useState(0);
  const [nonZeroFieldWalletsCount, setNonZeroFieldWalletsCount] = useState(0);
  const [uninvoicedDeliveriesCount, setUninvoicedDeliveriesCount] = useState(0);
  const [pendingHandoversCount, setPendingHandoversCount] = useState(0);
  const [undepositedChequesCount, setUndepositedChequesCount] = useState(0);
  const [depositSlipPrepared, setDepositSlipPrepared] = useState(true);
  const [ownerPassword, setOwnerPassword] = useState('');
  const [signedOff, setSignedOff] = useState(false);
  const [eodError, setEodError] = useState<string | null>(null);
  const [activeSiteId, setActiveSiteId] = useState<string>('');

  const loadEodData = async (date: string, siteId: string) => {
    setEodError(null);
    const siteQuery = siteId && siteId !== 'all' ? `&siteId=${encodeURIComponent(siteId)}` : '';
    const [chkRes, trpRes, hndRes, chqRes] = await Promise.allSettled([
      fetch(`/api/proxy/eod/${encodeURIComponent(date)}/checklist`).then(async (r) =>
        r.ok ? r.json() : r.status === 404 ? { __notStarted: true } : null,
      ),
      fetch(`/api/proxy/trips?tripDate=${encodeURIComponent(date)}${siteQuery}`).then((r) =>
        r.ok ? r.json() : [],
      ),
      fetch(`/api/proxy/handovers?date=${encodeURIComponent(date)}${siteQuery}`).then((r) =>
        r.ok ? r.json() : [],
      ),
      fetch(`/api/proxy/cheques${siteId && siteId !== 'all' ? `?siteId=${encodeURIComponent(siteId)}` : ''}`).then((r) =>
        r.ok ? r.json() : [],
      ),
    ]);

    if (chkRes.status === 'fulfilled' && chkRes.value) {
      const chk = chkRes.value?.data ?? chkRes.value;
      if (chk?.__notStarted) {
        setStarted(false);
        setSignedOff(false);
      } else {
        setStarted(true);
        if (chk.status === 'SIGNED_OFF' || chk.status === 'CLOSED') {
          setSignedOff(true);
        } else {
          setSignedOff(false);
        }
        if (chk.checks) {
          setOpenTripsCount(Number(chk.checks.trips?.count ?? 0));
          setNonZeroFieldWalletsCount(Number(chk.checks.handover?.nonZeroWallets ?? 0));
          setUninvoicedDeliveriesCount(Number(chk.checks.uninvoiced?.count ?? 0));
        }
      }
    }
    if (trpRes.status === 'fulfilled') {
      const rows = Array.isArray(trpRes.value)
        ? trpRes.value
        : Array.isArray(trpRes.value?.data)
          ? trpRes.value.data
          : [];
      setOpenTripsCount(
        rows.filter((t: any) => !['COMPLETED', 'CLOSED', 'CANCELLED'].includes(String(t.status))).length,
      );
    }
    if (hndRes.status === 'fulfilled') {
      const rows = Array.isArray(hndRes.value)
        ? hndRes.value
        : Array.isArray(hndRes.value?.data)
          ? hndRes.value.data
          : [];
      const pending = rows.filter((h: any) => h.status === 'PENDING').length;
      setPendingHandoversCount(pending);
      setNonZeroFieldWalletsCount(pending);
    }
    if (chqRes.status === 'fulfilled') {
      const rows = Array.isArray(chqRes.value)
        ? chqRes.value
        : Array.isArray(chqRes.value?.data)
          ? chqRes.value.data
          : [];
      setUndepositedChequesCount(rows.filter((c: any) => c.status === 'RECEIVED').length);
    }
  };

  useEffect(() => {
    let active = true;
    const storedSite =
      typeof window !== 'undefined' ? localStorage.getItem('neobus_active_site_id') ?? '' : '';
    setActiveSiteId(storedSite);
    loadEodData(selectedDate, storedSite).catch(() => {
      if (active) setEodError('Failed to load EOD checklist data.');
    });
    return () => {
      active = false;
    };
  }, [selectedDate]);

  async function handleStartEod() {
    setEodError(null);
    try {
      const res = await fetch('/api/proxy/eod/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          ...(activeSiteId && activeSiteId !== 'all' ? { siteId: activeSiteId } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error?.message || `HTTP ${res.status}`);
      }
      setStarted(true);
      await loadEodData(selectedDate, activeSiteId);
    } catch (err) {
      setEodError(`Failed to start EOD: ${(err as Error).message}`);
    }
  }

  const checklist = useMemo(
    () =>
      evaluateEodChecklist({
        openTripsCount,
        nonZeroFieldWalletsCount,
        uninvoicedDeliveriesCount,
        pendingHandoversCount,
        undepositedChequesCount,
        depositSlipPrepared,
      }),
    [
      openTripsCount,
      nonZeroFieldWalletsCount,
      uninvoicedDeliveriesCount,
      pendingHandoversCount,
      undepositedChequesCount,
      depositSlipPrepared,
    ],
  );

  async function handleOwnerSignOff(e: React.FormEvent) {
    e.preventDefault();
    if (!checklist.canSignOff || !ownerPassword.trim()) return;
    setEodError(null);
    try {
      const res = await fetch(`/api/proxy/eod/${encodeURIComponent(selectedDate)}/signoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remarks: 'Owner sign-off', password: ownerPassword }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error?.message || `HTTP ${res.status}`);
      }
      setSignedOff(true);
    } catch (err) {
      setEodError(`EOD sign-off failed: ${(err as Error).message}`);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Guided End-of-Day (EOD) Close</h1>
          <p className="text-sm text-zinc-400">
            All 6 checklist preconditions must be green before Owner sign-off becomes available.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
          {!started && (
            <button
              type="button"
              onClick={handleStartEod}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Start EOD
            </button>
          )}
        </div>
      </div>

      {eodError && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm font-semibold text-rose-300">
          {eodError}
        </div>
      )}

      {signedOff && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-semibold text-emerald-300">
          ✓ EOD Close for {selectedDate} signed off by Owner. Day ledger is locked.
        </div>
      )}

      <div className="divide-y divide-zinc-800 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
        {checklist.rows.map((item) => (
          <div key={item.key} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div className="flex items-center gap-3">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
                  item.passed ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                }`}
              >
                {item.passed ? '✓' : '✕'}
              </span>
              <div>
                <div className="font-semibold text-zinc-100">{item.label}</div>
                <div className={`text-xs ${item.passed ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {item.passed ? 'Passed' : item.detail}
                </div>
              </div>
            </div>
            {!item.passed && (
              <Link
                href={item.fixHref}
                className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-400 hover:bg-rose-500/20"
              >
                Resolve →
              </Link>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={handleOwnerSignOff} className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-zinc-100">Owner Sign-off</div>
            <div className="text-xs text-zinc-400">
              {checklist.canSignOff
                ? 'All checks passed. Enter Owner password to lock EOD.'
                : `${checklist.rows.filter((r) => !r.passed).length} blocker(s) remaining before sign-off.`}
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={depositSlipPrepared}
              onChange={(e) => setDepositSlipPrepared(e.target.checked)}
              className="rounded border-zinc-700 bg-zinc-950"
            />
            Deposit slip prepared
          </label>
        </div>
        <div className="flex flex-wrap gap-3">
          <input
            type="password"
            value={ownerPassword}
            onChange={(e) => setOwnerPassword(e.target.value)}
            placeholder="Owner password"
            disabled={!checklist.canSignOff || signedOff}
            className="flex-1 min-w-[200px] rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!checklist.canSignOff || signedOff || !ownerPassword.trim()}
            className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            {signedOff ? 'Signed Off' : 'Sign Off & Lock Day'}
          </button>
        </div>
      </form>
    </div>
  );
}
