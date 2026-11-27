'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { evaluateEodChecklist, formatINR } from '@neo/shared';

interface CustodyWalletItem {
  userId: string;
  name: string;
  role: string;
  balance: string;
}

interface DepositSlipData {
  totalCash: string;
  totalCheques: string;
  totalUpi?: string;
  totalDeposit?: string;
  chequeCount: number;
  handoverCount?: number;
  cheques: Array<{ chequeNo: string; bank: string; chequeDate?: string; amount: string; status?: string }>;
}

export default function EodClosingPage() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [started, setStarted] = useState(true);
  const [openTripsCount, setOpenTripsCount] = useState(0);
  const [nonZeroFieldWalletsCount, setNonZeroFieldWalletsCount] = useState(0);
  const [nonZeroWallets, setNonZeroWallets] = useState<CustodyWalletItem[]>([]);
  const [uninvoicedDeliveriesCount, setUninvoicedDeliveriesCount] = useState(0);
  const [pendingHandoversCount, setPendingHandoversCount] = useState(0);
  const [undepositedChequesCount, setUndepositedChequesCount] = useState(0);
  const [depositSlipPrepared, setDepositSlipPrepared] = useState(true);
  const [depositSlip, setDepositSlip] = useState<DepositSlipData | null>(null);
  const [ownerPassword, setOwnerPassword] = useState('');
  const [signedOff, setSignedOff] = useState(false);
  const [eodError, setEodError] = useState<string | null>(null);
  const [activeSiteId, setActiveSiteId] = useState<string>('');

  const loadEodData = useCallback(async (date: string, siteId: string) => {
    setEodError(null);
    const hasSite = Boolean(siteId && siteId !== 'all');
    const siteOnlyQuery = hasSite ? `?siteId=${encodeURIComponent(siteId)}` : '';
    const siteAmpQuery = hasSite ? `&siteId=${encodeURIComponent(siteId)}` : '';

    const [chkRes, slipRes, trpRes, hndRes, chqRes] = await Promise.allSettled([
      fetch(`/api/proxy/eod/${encodeURIComponent(date)}/checklist${siteOnlyQuery}`).then(async (r) =>
        r.ok ? r.json() : r.status === 404 ? { __notStarted: true } : null,
      ),
      fetch(`/api/proxy/eod/${encodeURIComponent(date)}/deposit-slip${siteOnlyQuery}`).then((r) =>
        r.ok ? r.json() : null,
      ),
      fetch(`/api/proxy/trips?tripDate=${encodeURIComponent(date)}${siteAmpQuery}`).then((r) =>
        r.ok ? r.json() : [],
      ),
      fetch(`/api/proxy/handovers?date=${encodeURIComponent(date)}${siteAmpQuery}`).then((r) =>
        r.ok ? r.json() : [],
      ),
      fetch(`/api/proxy/cheques${siteOnlyQuery}`).then((r) => (r.ok ? r.json() : [])),
    ]);

    let hasBackendChecklist = false;
    if (chkRes.status === 'fulfilled' && chkRes.value) {
      const chk = chkRes.value?.data ?? chkRes.value;
      if (chk?.__notStarted) {
        setStarted(false);
        setSignedOff(false);
        setNonZeroWallets([]);
      } else {
        setStarted(true);
        setSignedOff(chk.status === 'SIGNED_OFF' || chk.status === 'CLOSED');
        if (chk.checks) {
          hasBackendChecklist = true;
          setOpenTripsCount(Number(chk.checks.trips?.count ?? 0));
          setNonZeroFieldWalletsCount(Number(chk.checks.handover?.nonZeroWallets ?? 0));
          setNonZeroWallets(
            Array.isArray(chk.checks.handover?.wallets) ? chk.checks.handover.wallets : [],
          );
          setUninvoicedDeliveriesCount(Number(chk.checks.uninvoiced?.count ?? 0));
        }
      }
    }

    if (slipRes.status === 'fulfilled' && slipRes.value) {
      const slipData = slipRes.value?.data ?? slipRes.value;
      if (slipData) setDepositSlip(slipData);
    }

    if (!hasBackendChecklist && trpRes.status === 'fulfilled') {
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
      const pending = rows.filter((h: any) => h.status === 'PENDING' || h.status === 'DISPUTED').length;
      setPendingHandoversCount(pending);
      if (!hasBackendChecklist) {
        setNonZeroFieldWalletsCount(pending);
      }
    }

    if (chqRes.status === 'fulfilled') {
      const rows = Array.isArray(chqRes.value)
        ? chqRes.value
        : Array.isArray(chqRes.value?.data)
          ? chqRes.value.data
          : [];
      setUndepositedChequesCount(rows.filter((c: any) => c.status === 'RECEIVED').length);
    }
  }, []);

  useEffect(() => {
    const storedSite =
      typeof window !== 'undefined' ? localStorage.getItem('neobus_active_site_id') ?? '' : '';
    setActiveSiteId(storedSite);
    loadEodData(selectedDate, storedSite).catch(() => {
      setEodError('Failed to load EOD checklist data.');
    });
  }, [selectedDate, loadEodData]);

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
    const siteQuery =
      activeSiteId && activeSiteId !== 'all' ? `?siteId=${encodeURIComponent(activeSiteId)}` : '';
    try {
      const res = await fetch(
        `/api/proxy/eod/${encodeURIComponent(selectedDate)}/signoff${siteQuery}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ remarks: 'Owner sign-off', password: ownerPassword }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error?.message || `HTTP ${res.status}`);
      }
      setSignedOff(true);
      await loadEodData(selectedDate, activeSiteId);
    } catch (err) {
      setEodError(`EOD sign-off failed: ${(err as Error).message}`);
    }
  }

  const siteQuery =
    activeSiteId && activeSiteId !== 'all' ? `?siteId=${encodeURIComponent(activeSiteId)}` : '';
  const slipCash = Number(depositSlip?.totalCash ?? 0);
  const slipCheques = Number(depositSlip?.totalCheques ?? 0);
  const slipUpi = Number(depositSlip?.totalUpi ?? 0);
  const slipTotal = Number(depositSlip?.totalDeposit ?? slipCash + slipCheques);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Guided End-of-Day (EOD) Close</h1>
          <p className="text-sm text-ink-3">
            All 6 checklist preconditions (including driver COD &amp; collector custody wallets) must be green before Owner sign-off.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-lg border border-rule bg-sheet px-3 py-2 text-sm text-ink"
          />
          {!started && (
            <button
              type="button"
              onClick={handleStartEod}
              className="rounded-lg bg-leaf px-4 py-2 text-sm font-semibold text-white"
            >
              Start EOD
            </button>
          )}
        </div>
      </div>

      {eodError && (
        <div className="rounded-[3px] border border-madder/30 bg-madder-soft p-4 text-sm font-semibold text-madder">
          {eodError}
        </div>
      )}

      {signedOff && (
        <div className="rounded-[3px] border border-leaf/30 bg-leaf-soft p-4 text-sm font-semibold text-leaf">
          ✓ EOD Close for {selectedDate} signed off by Owner. Day ledger is locked.
        </div>
      )}

      <div className="divide-y divide-rule overflow-hidden rounded-[3px] border border-rule bg-sheet">
        {checklist.rows.map((item) => (
          <div key={item.key} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div className="flex items-center gap-3">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
                  item.passed ? 'bg-leaf-soft text-leaf' : 'bg-madder-soft text-madder'
                }`}
              >
                {item.passed ? '✓' : '✕'}
              </span>
              <div>
                <div className="font-semibold text-ink">{item.label}</div>
                <div className={`text-xs ${item.passed ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {item.passed ? 'Passed' : item.detail}
                </div>
              </div>
            </div>
            {!item.passed && (
              <Link
                href={item.fixHref}
                className="rounded-lg border border-madder/30 bg-madder-soft px-3 py-1.5 text-xs font-semibold text-madder hover:opacity-90/20"
              >
                Resolve →
              </Link>
            )}
          </div>
        ))}
      </div>

      {nonZeroWallets.length > 0 && (
        <div className="rounded-[3px] border border-madder/30 bg-sheet p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-madder">
              Uncleared Field Custody Wallets ({nonZeroWallets.length})
            </h2>
            <Link href="/finance/handovers" className="text-xs font-semibold text-action hover:underline">
              Settle at Handover Desk →
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {nonZeroWallets.map((w) => (
              <div
                key={w.userId}
                className="flex items-center justify-between rounded border border-rule bg-paper px-3 py-2 text-xs"
              >
                <div>
                  <div className="font-semibold text-ink">{w.name}</div>
                  <div className="font-mono text-[11px] text-ink-3">{w.role}</div>
                </div>
                <span className="font-mono font-bold text-madder">{formatINR(w.balance)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {depositSlip && (
        <div className="rounded-[3px] border border-rule bg-sheet p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-ink">Bank Deposit Slip Breakdown</h2>
              <p className="text-xs text-ink-3">
                Physical cash &amp; cheques queued for bank deposit ({selectedDate}). UPI settles direct per OD-015.
              </p>
            </div>
            <a
              href={`/api/proxy/eod/${encodeURIComponent(selectedDate)}/deposit-slip/pdf${siteQuery}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-rule-strong bg-paper px-3 py-1.5 text-xs font-semibold text-action hover:bg-sunken"
            >
              Download Deposit Slip PDF
            </a>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded border border-rule bg-paper p-3">
              <div className="text-xs text-ink-3">Cash Deposit</div>
              <div className="mt-1 font-mono text-base font-bold text-ink">{formatINR(slipCash)}</div>
            </div>
            <div className="rounded border border-rule bg-paper p-3">
              <div className="text-xs text-ink-3">Cheques ({depositSlip.chequeCount})</div>
              <div className="mt-1 font-mono text-base font-bold text-action">{formatINR(slipCheques)}</div>
            </div>
            <div className="rounded border border-rule bg-paper p-3">
              <div className="text-xs text-ink-3">Total Bank Deposit</div>
              <div className="mt-1 font-mono text-base font-bold text-leaf">{formatINR(slipTotal)}</div>
            </div>
            <div className="rounded border border-rule bg-paper p-3">
              <div className="text-xs text-ink-3">Direct UPI (Info)</div>
              <div className="mt-1 font-mono text-base font-bold text-ink-2">{formatINR(slipUpi)}</div>
            </div>
          </div>
          {depositSlip.cheques?.length > 0 && (
            <div className="space-y-1.5">
              {depositSlip.cheques.map((c) => (
                <div
                  key={c.chequeNo}
                  className="flex items-center justify-between rounded border border-rule bg-paper px-3 py-1.5 text-xs"
                >
                  <span className="font-mono text-ink">
                    {c.chequeNo} · {c.bank}
                  </span>
                  <span className="font-mono font-semibold text-ink">{formatINR(c.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleOwnerSignOff} className="rounded-[3px] border border-rule bg-sheet p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-ink">Owner Sign-off</div>
            <div className="text-xs text-ink-3">
              {checklist.canSignOff
                ? 'All checks passed. Enter Owner password to lock EOD.'
                : `${checklist.rows.filter((r) => !r.passed).length} blocker(s) remaining before sign-off.`}
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-ink-2">
            <input
              type="checkbox"
              checked={depositSlipPrepared}
              onChange={(e) => setDepositSlipPrepared(e.target.checked)}
              className="rounded border-rule-strong bg-paper"
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
            className="flex-1 min-w-[200px] rounded-lg border border-rule bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-3 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!checklist.canSignOff || signedOff || !ownerPassword.trim()}
            className="rounded-lg bg-leaf px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-3"
          >
            {signedOff ? 'Signed Off' : 'Sign Off & Lock Day'}
          </button>
        </div>
      </form>
    </div>
  );
}
