'use client';

import React, { useState, useEffect } from 'react';

interface RolloutMetric {
  metric: string;
  current: string;
  budget: string;
}

interface E2EScenario {
  id: string;
  name: string;
  phases: string;
  status: string;
}

export default function RolloutReadinessPage() {
  const [releaseStage, setReleaseStage] = useState<'R1' | 'R2' | 'R3'>('R3');
  const [budgets, setBudgets] = useState<RolloutMetric[]>([]);
  const [scenarios, setScenarios] = useState<E2EScenario[]>([]);

  useEffect(() => {
    let active = true;
    fetch('/api/proxy/admin/rollout')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (!active || !res) return;
        const d = res.data || res;
        if (Array.isArray(d.budgets)) setBudgets(d.budgets);
        if (Array.isArray(d.scenarios)) setScenarios(d.scenarios);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Quality, Security &amp; Go-Live Rollout Gate (Phase F14)</h1>
          <p className="text-sm text-zinc-400">
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
                releaseStage === r
                  ? 'bg-emerald-600 text-white'
                  : 'border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              Release {r}
            </button>
          ))}
        </div>
      </div>

      {budgets.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          {budgets.map((p) => (
            <div key={p.metric} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <div className="text-xs text-zinc-400">{p.metric}</div>
              <div className="mt-1 text-lg font-bold text-emerald-400">{p.current}</div>
              <div className="text-[11px] text-zinc-500">Budget: {p.budget}</div>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
        <div className="border-b border-zinc-800 bg-zinc-950/60 px-5 py-3 text-sm font-bold text-zinc-100">
          Critical E2E Scenarios (E1–E12) · Active Gate: {releaseStage}
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-950/40 text-xs uppercase text-zinc-400">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Scenario</th>
              <th className="px-4 py-3">Phases</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {scenarios.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-zinc-500">
                  No rollout verification records loaded from backend.
                </td>
              </tr>
            ) : (
              scenarios.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-2.5 font-mono font-bold text-zinc-100">{e.id}</td>
                  <td className="px-4 py-2.5 text-zinc-200">{e.name}</td>
                  <td className="px-4 py-2.5 text-xs text-zinc-400">{e.phases}</td>
                  <td className="px-4 py-2.5">
                    <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                      {e.status}
                    </span>
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
