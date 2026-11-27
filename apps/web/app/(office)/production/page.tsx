'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { KpiCard, Badge, Button, Card } from '@neo/ui';
import {
  type WorkOrderRecord,
  type RmRequisitionRecord,
  type WastageRecord,
} from '../../../src/lib/production-data';

export default function ProductionOverviewPage() {
  const [workOrders, setWorkOrders] = useState<WorkOrderRecord[]>([]);
  const [rmReqs, setRmReqs] = useState<RmRequisitionRecord[]>([]);
  const [wastageLogs, setWastageLogs] = useState<WastageRecord[]>([]);

  useEffect(() => {
    let active = true;
    const storedSite =
      typeof window !== 'undefined' ? localStorage.getItem('neobus_active_site_id') : null;
    const siteQuery =
      storedSite && storedSite !== 'all' ? `?siteId=${encodeURIComponent(storedSite)}` : '';
    Promise.all([
      fetch(`/api/proxy/production/work-orders${siteQuery}`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/proxy/production/requisitions${siteQuery}`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/proxy/production/wastage${siteQuery}`).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([woRes, reqRes, wstRes]) => {
        if (!active) return;
        const woRows = Array.isArray(woRes) ? woRes : Array.isArray(woRes?.data) ? woRes.data : [];
        setWorkOrders(
          woRows.map((w: any) => {
            const outputFromArray = Array.isArray(w.outputs)
              ? w.outputs.reduce(
                  (s: number, o: any) =>
                    s + Number(o.actualQty ?? o.actual_qty ?? o.qtyProduced ?? o.qty_produced ?? 0),
                  0,
                )
              : 0;
            const issuedFromMaterials = Array.isArray(w.materials)
              ? w.materials.reduce(
                  (s: number, m: any) => s + Number(m.actualQty ?? m.actual_qty ?? 0),
                  0,
                )
              : 0;
            const actualOut = Number(w.actualOutputQty ?? outputFromArray);
            const varianceOutsideTol =
              w.status === 'COMPLETED' &&
              issuedFromMaterials > 0 &&
              Math.abs(100 - (actualOut / issuedFromMaterials) * 100) > 3;
            return {
              ...w,
              id: String(w.id),
              woNumber: String(w.woNumber ?? w.woNo ?? w.wo_no ?? ''),
              finishedItemName: String(w.finishedItemName ?? w.bomItemName ?? 'Item'),
              uom: String(w.uom ?? 'KG'),
              plannedQty: Number(w.plannedQty ?? w.planned_qty ?? 0),
              issuedRmQty: Number(w.issuedRmQty ?? issuedFromMaterials),
              actualOutputQty: actualOut,
              requiredBy: String(w.requiredBy ?? (w.createdAt ? String(w.createdAt).slice(0, 10) : '')),
              yieldVarianceException: Boolean(w.yieldVarianceException ?? varianceOutsideTol),
            };
          }),
        );
        const rawReqs = Array.isArray(reqRes) ? reqRes : Array.isArray(reqRes?.data) ? reqRes.data : [];
        const normalizedReqs: RmRequisitionRecord[] = rawReqs.map((r: any) => {
          const firstLine = Array.isArray(r.lines) && r.lines.length > 0 ? r.lines[0] : null;
          const totalLineQty = Array.isArray(r.lines)
            ? r.lines.reduce((s: number, l: any) => s + Number(l.requiredQty ?? l.qty ?? 0), 0)
            : Number(r.qty ?? 0);
          return {
            id: String(r.id),
            reqNo: String(r.reqNo ?? r.req_no ?? ''),
            itemId: String(firstLine?.itemId ?? r.itemId ?? ''),
            itemSku: String(firstLine?.itemSkuCode ?? r.itemSku ?? ''),
            itemName:
              Array.isArray(r.lines) && r.lines.length > 1
                ? `${firstLine?.itemName ?? 'Material'} (+${r.lines.length - 1} more)`
                : String(firstLine?.itemName ?? r.itemName ?? 'Raw Material'),
            qty: totalLineQty,
            uom: String(firstLine?.uom ?? r.uom ?? 'KG'),
            neededBy: String(r.requiredByDate ?? r.neededBy ?? '').slice(0, 10),
            sourceWoNo: String(r.sourceWoNo ?? r.reqNo ?? 'BOM Plan'),
            status: String(r.status ?? 'DRAFT') as RmRequisitionRecord['status'],
          };
        });
        setRmReqs(normalizedReqs);
        const rawWst = Array.isArray(wstRes) ? wstRes : Array.isArray(wstRes?.data) ? wstRes.data : [];
        setWastageLogs(
          rawWst.map((w: any) => ({
            ...w,
            id: String(w.id),
            qty: Number(w.qty ?? 0),
          })),
        );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const planned = workOrders.filter((w) => w.status === 'PLANNED').length;
  const running = workOrders.filter((w) => w.status === 'IN_PROGRESS').length;
  const done = workOrders.filter((w) => w.status === 'COMPLETED').length;

  const totalPlannedKg = workOrders.reduce((s, w) => s + Number(w.plannedQty || 0), 0);
  const totalOutputKg = workOrders.reduce((s, w) => s + Number(w.actualOutputQty || 0), 0);
  const outputVsPlanPct = totalPlannedKg > 0 ? ((totalOutputKg / totalPlannedKg) * 100).toFixed(1) : '0.0';
  const avgYieldPct = workOrders.length > 0
    ? (workOrders.reduce((s, w) => s + (w.plannedQty > 0 ? (w.actualOutputQty / w.plannedQty) * 100 : 100), 0) / workOrders.length).toFixed(1)
    : '0.0';
  const totalWastageKg = wastageLogs.reduce((s, w) => s + Number(w.qty || 0), 0);
  const wastagePct = totalOutputKg > 0 ? ((totalWastageKg / totalOutputKg) * 100).toFixed(2) : '0.00';

  const varianceAlerts = workOrders.filter((w) => w.yieldVarianceException);
  const openShortages = rmReqs.filter((r) =>
    ['DRAFT', 'PENDING', 'OPEN', 'APPROVED'].includes(String(r.status)),
  );

  const yieldTrend = workOrders.slice(0, 7).map((w, idx) => ({
    day: w.woNumber || `WO-${idx + 1}`,
    plannedKg: Number(w.plannedQty || 0),
    outputKg: Number(w.actualOutputQty || 0),
  }));
  const maxKg = Math.max(1, ...yieldTrend.map((d) => Math.max(d.plannedKg, d.outputKg)));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
            <h1 className="text-2xl font-bold text-ink">Production &amp; Factory Overview</h1>
          </div>
          <p className="text-sm text-ink-3 mt-1">
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
          trend={{ value: `${wastageLogs.length} events`, direction: wastageLogs.length > 0 ? 'down' : 'up'}}
 />
 </div>

 {/* Plan vs Actual Chart */}
 <Card className="p-5 bg-sheet border-rule">
 <div className="flex items-center justify-between mb-4">
 <h2 className="text-sm font-semibold text-ink">Plan vs Actual Output (kg)</h2>
 <div className="flex gap-4 text-xs text-ink-3">
 <span className="flex items-center gap-1.5">
 <span className="w-3 h-3 rounded bg-zinc-600" /> Planned
 </span>
 <span className="flex items-center gap-1.5">
 <span className="w-3 h-3 rounded bg-orange-500" /> Actual Output
 </span>
 </div>
 </div>
 <div className="grid grid-cols-7 gap-3 items-end h-44 pt-4">
 {yieldTrend.map((d) => (
 <div key={d.day} className="flex flex-col items-center gap-1.5 h-full justify-end">
 <div className="flex items-end gap-1 h-32 w-full justify-center">
 <div
 className="w-4 bg-sunken rounded-t"
 style={{ height: `${(d.plannedKg / maxKg) * 100}%` }}
 title={`Planned: ${d.plannedKg} kg`}
 />
 <div
 className="w-4 bg-orange-500 rounded-t"
 style={{ height: `${(d.outputKg / maxKg) * 100}%` }}
 title={`Output: ${d.outputKg} kg`}
 />
 </div>
 <span className="text-[11px] text-ink-3 font-mono">{d.day}</span>
 </div>
 ))}
 </div>
 </Card>

 {/* Bottom 3 Panels: Orders Waiting, Material Shortages, Yield Variance Alerts */}
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
 <Card className="p-5 bg-sheet border-rule space-y-3">
 <div className="flex items-center justify-between">
 <h3 className="text-sm font-semibold text-ink">Orders Waiting for Production</h3>
 <Badge variant="info">IN_PRODUCTION_SOURCING</Badge>
 </div>
 {workOrders.filter((w) => w.linkedSalesOrderNo && w.status !=='COMPLETED').map(
            (w) => (
              <div
                key={w.id}
                className="p-3 rounded-lg bg-paper border border-rule text-xs flex justify-between items-center"
              >
                <div>
                  <div className="font-mono text-orange-400 font-bold">{w.linkedSalesOrderNo}</div>
                  <div className="text-ink">{w.customerName}</div>
                </div>
                <div className="text-right font-mono text-ink-3">
                  <div>{w.plannedQty} {w.uom}</div>
                  <div>Due {w.requiredBy}</div>
                </div>
              </div>
            ),
          )}
        </Card>

        <Card className="p-5 bg-sheet border-rule space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Material Shortages</h3>
            <Badge variant="warning">{openShortages.length} open</Badge>
          </div>
          {openShortages.map((s) => (
            <div
              key={s.id}
              className="p-3 rounded-lg bg-paper border border-rule text-xs flex justify-between items-center"
            >
              <div>
                <div className="text-ink font-medium">{s.itemName}</div>
                <div className="text-ink-3">For {s.sourceWoNo}</div>
              </div>
              <span className="font-mono text-haldi font-bold">
                {s.qty} {s.uom}
              </span>
            </div>
          ))}
          <Link href="/production/requisitions">
            <Button variant="secondary" className="w-full">Manage RM Requisitions →</Button>
          </Link>
        </Card>

        <Card className="p-5 bg-sheet border-rule space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Yield Variance Alerts</h3>
            <Badge variant="danger">{varianceAlerts.length} alert</Badge>
          </div>
          {varianceAlerts.map((w) => (
            <div
              key={w.id}
              className="p-3 rounded-lg bg-madder-soft border border-madder/30 text-xs"
            >
              <div className="flex justify-between font-bold text-madder">
                <span>{w.woNumber}</span>
                <span>YIELD_VARIANCE</span>
              </div>
              <div className="text-ink mt-1">{w.finishedItemName}</div>
              <div className="text-ink-3 mt-0.5">
                Issued {w.issuedRmQty} kg → Output {w.actualOutputQty} kg
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

