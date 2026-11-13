'use client';

import React, { useState } from 'react';
import { E2E_SCENARIO_MATRIX, PERFORMANCE_BUDGETS } from '../../../../src/lib/rollout-data';

export default function RolloutReadinessPage() {
  const [releaseStage, setReleaseStage] = useState<'R1' | 'R2' | 'R3'>('R3');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quality, Security &amp; Go-Live Rollout Gate (Phase F14)</h1>
          <p className="text-sm text-slate-500">
            Cross-module E1–E12 E2E scenario verification, performance budgets, UAT SUS score (target ≥ 75), and feature-flag rollout.
          </p>
        </div>
        <div className="flex gap-1.5">
          {(['R1', 'R2', 'R3'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReleaseStage(r)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                releaseStage === r ? 'bg-emerald-600 text-white' : 'border border-slate-200 bg-white text-slate-700'
              }`}
            >
              Release {r}
            </button>
          ))}
        </div>
      </div>

      {/* Performance Budgets & UAT Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        {PERFORMANCE_BUDGETS.map((p) => (
          <div key={p.metric} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">{p.metric}</div>
            <div className="mt-1 text-lg font-bold text-emerald-700">{p.current}</div>
            <div className="text-[11px] text-slate-400">Budget: {p.budget}</div>
          </div>
        ))}
      </div>

      {/* E1-E12 Matrix */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 text-sm font-bold text-slate-800">
          Critical E2E Scenarios (E1–E12) · Active Gate: {releaseStage}
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50/50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Scenario</th>
              <th className="px-4 py-3">Phases</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {E2E_SCENARIO_MATRIX.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-2.5 font-mono font-bold text-slate-900">{e.id}</td>
                <td className="px-4 py-2.5 text-slate-800">{e.name}</td>
                <td className="px-4 py-2.5 text-xs text-slate-500">{e.phases}</td>
                <td className="px-4 py-2.5">
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                    {e.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

