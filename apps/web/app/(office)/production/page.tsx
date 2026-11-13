'use client';

import React from 'react';
import Link from 'next/link';
import { KpiCard, Badge, Button, Card } from '@neo/ui';
import {
  INITIAL_WORK_ORDERS,
  INITIAL_RM_REQUISITIONS,
  INITIAL_YIELD_TREND,
  INITIAL_WASTAGE_LOGS,
} from '../../../src/lib/production-data';

export default function ProductionOverviewPage() {
  const planned = INITIAL_WORK_ORDERS.filter((w) => w.status === 'PLANNED').length;
  const running = INITIAL_WORK_ORDERS.filter((w) => w.status === 'IN_PROGRESS').length;
  const done = INITIAL_WORK_ORDERS.filter((w) => w.status === 'COMPLETED').length;

  const totalPlannedKg = INITIAL_YIELD_TREND.reduce((s, d) => s + d.plannedKg, 0);
  const totalOutputKg = INITIAL_YIELD_TREND.reduce((s, d) => s + d.outputKg, 0);
  const outputVsPlanPct = ((totalOutputKg / totalPlannedKg) * 100).toFixed(1);
  const avgYieldPct = (
    INITIAL_YIELD_TREND.reduce((s, d) => s + d.yieldPct, 0) / INITIAL_YIELD_TREND.length
  ).toFixed(1);
  const totalWastageKg = INITIAL_WASTAGE_LOGS.reduce((s, w) => s + w.qty, 0);
  const wastagePct = ((totalWastageKg / totalOutputKg) * 100).toFixed(2);

  const varianceAlerts = INITIAL_WORK_ORDERS.filter((w) => w.yieldVarianceException);
  const openShortages = INITIAL_RM_REQUISITIONS.filter((r) => r.status === 'OPEN');

  const maxKg = Math.max(...INITIAL_YIELD_TREND.map((d) => Math.max(d.plannedKg, d.outputKg)));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
            <h1 className="text-2xl font-bold text-white">Production &amp; Factory Overview</h1>
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            Plan vs actual output, weekly yield health (±3% BR-06), open RM shortages, and variance alerts.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/floor/production">
            <Button variant="secondary">Open Floor Kanban 📱</Button>
          </Link>
          <Link href="/production/work-orders">
            <Button variant="primary">+ New Work Order</Button>
          </Link>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Batches Today"
          value={`${planned} / ${running} / ${done}`}
          subtitle="Planned / Running / Done"
          trend={{ value: 'Shift 1 active', direction: 'up' }}
        />
        <KpiCard
          title="Output vs Plan"
          value={`${outputVsPlanPct}%`}
          subtitle={`${totalOutputKg} / ${totalPlannedKg} kg`}
          trend={{ value: '7-day total', direction: 'up' }}
        />
        <KpiCard
          title="Yield % This Week"
          value={`${avgYieldPct}%`}
          subtitle="Tolerance ±3% (OD-012)"
          trend={{ value: 'Healthy band', direction: 'up' }}
        />
        <KpiCard
          title="Wastage %"
          value={`${wastagePct}%`}
          subtitle={`${totalWastageKg} kg logged`}
          trend={{ value: '2 events', direction: 'down' }}
        />
      </div>

      {/* Plan vs Actual Chart */}
      <Card className="p-5 bg-zinc-900 border-zinc-800">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">Plan vs Actual Output (kg)</h2>
          <div className="flex gap-4 text-xs text-zinc-400">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-zinc-600" /> Planned
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-orange-500" /> Actual Output
            </span>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-3 items-end h-44 pt-4">
          {INITIAL_YIELD_TREND.map((d) => (
            <div key={d.day} className="flex flex-col items-center gap-1.5 h-full justify-end">
              <div className="flex items-end gap-1 h-32 w-full justify-center">
                <div
                  className="w-4 bg-zinc-700 rounded-t"
                  style={{ height: `${(d.plannedKg / maxKg) * 100}%` }}
                  title={`Planned: ${d.plannedKg} kg`}
                />
                <div
                  className="w-4 bg-orange-500 rounded-t"
                  style={{ height: `${(d.outputKg / maxKg) * 100}%` }}
                  title={`Output: ${d.outputKg} kg`}
                />
              </div>
              <span className="text-[11px] text-zinc-400 font-mono">{d.day}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Bottom 3 Panels: Orders Waiting, Material Shortages, Yield Variance Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5 bg-zinc-900 border-zinc-800 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Orders Waiting for Production</h3>
            <Badge variant="info">IN_PRODUCTION_SOURCING</Badge>
          </div>
          {INITIAL_WORK_ORDERS.filter((w) => w.linkedSalesOrderNo && w.status !== 'COMPLETED').map(
            (w) => (
              <div
                key={w.id}
                className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-xs flex justify-between items-center"
              >
                <div>
                  <div className="font-mono text-orange-400 font-bold">{w.linkedSalesOrderNo}</div>
                  <div className="text-zinc-200">{w.customerName}</div>
                </div>
                <div className="text-right font-mono text-zinc-400">
                  <div>{w.plannedQty} {w.uom}</div>
                  <div>Due {w.requiredBy}</div>
                </div>
              </div>
            ),
          )}
        </Card>

        <Card className="p-5 bg-zinc-900 border-zinc-800 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Material Shortages</h3>
            <Badge variant="warning">{openShortages.length} open</Badge>
          </div>
          {openShortages.map((s) => (
            <div
              key={s.id}
              className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-xs flex justify-between items-center"
            >
              <div>
                <div className="text-white font-medium">{s.itemName}</div>
                <div className="text-zinc-500">For {s.sourceWoNo}</div>
              </div>
              <span className="font-mono text-amber-400 font-bold">
                {s.qty} {s.uom}
              </span>
            </div>
          ))}
          <Link href="/production/requisitions">
            <Button variant="secondary" className="w-full">Manage RM Requisitions →</Button>
          </Link>
        </Card>

        <Card className="p-5 bg-zinc-900 border-zinc-800 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Yield Variance Alerts</h3>
            <Badge variant="danger">{varianceAlerts.length} alert</Badge>
          </div>
          {varianceAlerts.map((w) => (
            <div
              key={w.id}
              className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs"
            >
              <div className="flex justify-between font-bold text-rose-300">
                <span>{w.woNumber}</span>
                <span>YIELD_VARIANCE</span>
              </div>
              <div className="text-zinc-200 mt-1">{w.finishedItemName}</div>
              <div className="text-zinc-400 mt-0.5">
                Issued {w.issuedRmQty} kg → Output {w.actualOutputQty} kg
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

