'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Badge, Card } from '@neo/ui';
import { INITIAL_WASTAGE_LOGS, type WastageRecord } from '../../../src/lib/production-data';

export default function ProductionWastagePage() {
  const [logs] = useState<WastageRecord[]>(INITIAL_WASTAGE_LOGS);

  const byReason = ['BURNT', 'SPILLED', 'QUALITY_REJECT', 'OTHER'].map((reason) => ({
    reason,
    qty: logs.filter((l) => l.reason === reason).reduce((s, l) => s + l.qty, 0),
  }));
  const maxQty = Math.max(1, ...byReason.map((r) => r.qty));

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs text-zinc-400 mb-1">
          <Link href="/production" className="hover:text-white">Production</Link>
          <span>/</span>
          <span className="text-orange-400">Wastage Log</span>
        </div>
        <h1 className="text-2xl font-bold text-white">Production Wastage &amp; Write-Offs</h1>
        <p className="text-sm text-zinc-400">
          Track wastage by reason and item; large write-offs trigger WASTAGE_WRITEOFF approval.
        </p>
      </div>

      <Card className="p-5 bg-zinc-900 border-zinc-800">
        <h2 className="text-sm font-semibold text-white mb-4">Wastage Breakdown by Reason (kg)</h2>
        <div className="space-y-3">
          {byReason.map((r) => (
            <div key={r.reason} className="flex items-center gap-3 text-xs">
              <div className="w-32 text-zinc-300 font-medium">{r.reason.replace('_', ' ')}</div>
              <div className="flex-1 h-3 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-rose-500"
                  style={{ width: `${(r.qty / maxQty) * 100}%` }}
                />
              </div>
              <div className="w-16 text-right font-mono text-white font-bold">{r.qty} kg</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-950/80 border-b border-zinc-800 text-xs uppercase text-zinc-400">
            <tr>
              <th className="p-3">Wastage #</th>
              <th className="p-3">Work Order &amp; Item</th>
              <th className="p-3">Reason</th>
              <th className="p-3 text-right">Qty</th>
              <th className="p-3">Approval</th>
              <th className="p-3">Logged At</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/70">
            {logs.map((w) => (
              <tr key={w.id} className="hover:bg-zinc-800/40">
                <td className="p-3 font-mono text-xs text-rose-400 font-semibold">{w.wastageNo}</td>
                <td className="p-3">
                  <div className="text-white font-medium">{w.itemName}</div>
                  <div className="text-[11px] font-mono text-zinc-500">{w.woNumber}</div>
                </td>
                <td className="p-3 text-xs text-zinc-300">{w.reason}</td>
                <td className="p-3 text-right font-mono font-bold text-rose-400">
                  {w.qty} {w.uom}
                </td>
                <td className="p-3">
                  {w.requiresWriteOffApproval ? (
                    <Badge variant="warning">WASTAGE_WRITEOFF</Badge>
                  ) : (
                    <Badge variant="success">Within Threshold</Badge>
                  )}
                </td>
                <td className="p-3 text-xs font-mono text-zinc-400">{w.loggedAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

