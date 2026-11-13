'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { INITIAL_DELIVERY_ISSUES, type DeliveryIssueRecord } from '../../../src/lib/logistics-data';

export default function DeliveryIssuesDeskPage() {
  const [issues, setIssues] = useState<DeliveryIssueRecord[]>(INITIAL_DELIVERY_ISSUES);
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'OPEN' | 'RESOLVED'>('ALL');
  const [resolvingIssue, setResolvingIssue] = useState<DeliveryIssueRecord | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<'REDELIVER' | 'CREDIT_NOTE' | 'WRITE_OFF'>('CREDIT_NOTE');

  const filteredIssues = useMemo(
    () => issues.filter((iss) => (filterStatus === 'ALL' ? true : iss.status === filterStatus)),
    [issues, filterStatus],
  );

  function confirmResolve() {
    if (!resolvingIssue) return;
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
          <h1 className="text-2xl font-bold text-slate-900">Delivery Issues Desk</h1>
          <p className="text-sm text-slate-500">
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
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredIssues.map((issue) => (
          <div key={issue.id} className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-slate-900">{issue.issueNo}</span>
                  <span className="rounded bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">{issue.type}</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      issue.status === 'OPEN' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {issue.status}
                  </span>
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-800">
                  {issue.customerName} · Order {issue.stopOrderNo} ·{' '}
                  <Link href={`/logistics/trips/${issue.tripId}`} className="text-blue-600 hover:underline">
                    {issue.tripNo}
                  </Link>
                </div>
                <p className="mt-1.5 text-sm text-slate-600">{issue.description}</p>
                <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                  <span>Reported: {issue.reportedAt}</span>
                  {issue.photoName && <span className="font-mono text-slate-700">📷 {issue.photoName}</span>}
                  {issue.resolutionOutcome && (
                    <span className="font-semibold text-emerald-700">Outcome: {issue.resolutionOutcome}</span>
                  )}
                </div>
              </div>

              {issue.status === 'OPEN' && (
                <button
                  type="button"
                  onClick={() => setResolvingIssue(issue)}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Resolve Issue
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Resolve Modal */}
      {resolvingIssue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">Resolve {resolvingIssue.issueNo}</h2>
            <p className="mt-1 text-xs text-slate-500">
              Select resolution outcome for {resolvingIssue.customerName} ({resolvingIssue.stopOrderNo}).
            </p>
            <div className="mt-4 space-y-2">
              {(['REDELIVER', 'CREDIT_NOTE', 'WRITE_OFF'] as const).map((outcome) => (
                <label
                  key={outcome}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 text-sm ${
                    selectedOutcome === outcome ? 'border-blue-600 bg-blue-50 font-semibold text-blue-900' : 'border-slate-200'
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
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmResolve}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
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

