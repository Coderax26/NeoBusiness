'use client';

import React, { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { type DeliveryIssueRecord } from '../../../../src/lib/logistics-data';

export default function DeliveryIssuesDeskPage() {
  const [issues, setIssues] = useState<DeliveryIssueRecord[]>([]);
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'OPEN' | 'RESOLVED'>('ALL');
  const [resolvingIssue, setResolvingIssue] = useState<DeliveryIssueRecord | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<'REDELIVER' | 'CREDIT_NOTE' | 'WRITE_OFF'>('CREDIT_NOTE');

  useEffect(() => {
    let active = true;
    fetch('/api/proxy/issues')
      .then((r) => (r.ok ? r.json() : []))
      .then((res) => {
        if (!active) return;
        const rows = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
        setIssues(rows);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const filteredIssues = useMemo(
    () => issues.filter((iss) => (filterStatus === 'ALL' ? true : iss.status === filterStatus)),
    [issues, filterStatus],
  );

  async function confirmResolve() {
    if (!resolvingIssue) return;
    await fetch(`/api/proxy/trips/issues/${encodeURIComponent(resolvingIssue.id)}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolutionOutcome: selectedOutcome }),
    }).catch(() => {});
    setIssues((prev) =>
      prev.map((item) =>
        item.id === resolvingIssue.id
          ? { ...item, status: 'RESOLVED', resolutionOutcome: selectedOutcome }
          : item,
      ),
    );
    setResolvingIssue(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Delivery Issues Desk</h1>
          <p className="text-sm text-ink-3">
            Review driver-reported shortages, damaged stock, or customer disputes with photo evidence and resolve them.
          </p>
        </div>
        <div className="flex gap-2">
          {(['ALL', 'OPEN', 'RESOLVED'] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setFilterStatus(status)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                filterStatus === status
                  ? 'bg-blue-600 text-white'
                  : 'border border-rule bg-sheet text-ink-2 hover:bg-sunken'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredIssues.length === 0 ? (
          <div className="rounded-[3px] border border-rule bg-sheet p-8 text-center text-sm text-ink-3">
            No delivery issues found.
          </div>
        ) : (
          filteredIssues.map((issue) => (
            <div key={issue.id} className="rounded-[3px] border border-rule bg-sheet p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-ink">{issue.issueNo}</span>
                    <span className="rounded bg-madder-soft px-2 py-0.5 text-xs font-semibold text-madder">{issue.type}</span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        issue.status === 'OPEN' ? 'bg-haldi-soft text-haldi' : 'bg-leaf-soft text-leaf'
                      }`}
                    >
                      {issue.status}
                    </span>
                  </div>
                  <div className="mt-1 text-sm font-semibold text-ink">
                    {issue.customerName} · Order {issue.stopOrderNo} ·{' '}
                    <Link href={`/logistics/trips/${issue.tripId}`} className="text-action hover:underline">
                      {issue.tripNo}
                    </Link>
                  </div>
                  <p className="mt-1.5 text-sm text-ink-3">{issue.description}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-ink-3">
                    <span>Reported: {issue.reportedAt}</span>
                    {issue.photoName && <span className="font-mono text-ink-2">📷 {issue.photoName}</span>}
                    {issue.resolutionOutcome && (
                      <span className="font-semibold text-leaf">Outcome: {issue.resolutionOutcome}</span>
                    )}
                  </div>
                </div>

                {issue.status === 'OPEN' && (
                  <button
                    type="button"
                    onClick={() => setResolvingIssue(issue)}
                    className="rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Resolve Issue
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Resolve Modal */}
      {resolvingIssue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-[4px] border border-rule bg-sheet p-6 shadow-xl">
            <h2 className="text-lg font-bold text-ink">Resolve {resolvingIssue.issueNo}</h2>
            <p className="mt-1 text-xs text-ink-3">
              Select resolution outcome for {resolvingIssue.customerName} ({resolvingIssue.stopOrderNo}).
            </p>
            <div className="mt-4 space-y-2">
              {(['REDELIVER', 'CREDIT_NOTE', 'WRITE_OFF'] as const).map((outcome) => (
                <label
                  key={outcome}
                  className={`flex cursor-pointer items-center justify-between rounded-[3px] border p-3 text-sm ${
                    selectedOutcome === outcome
                      ? 'border-blue-500 bg-blue-500/15 font-semibold text-blue-300'
                      : 'border-rule bg-paper text-ink-2'
                  }`}
                >
                  <span>{outcome.replace('_', ' ')}</span>
                  <input
                    type="radio"
                    name="outcome"
                    checked={selectedOutcome === outcome}
                    onChange={() => setSelectedOutcome(outcome)}
                  />
                </label>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResolvingIssue(null)}
                className="rounded-lg border border-rule-strong bg-paper px-4 py-2 text-sm font-semibold text-ink-2 hover:bg-sunken"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmResolve}
                className="rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Confirm Resolution
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
