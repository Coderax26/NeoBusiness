'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Badge, Card } from '@neo/ui';
import { type WastageRecord } from '../../../../src/lib/production-data';

export default function ProductionWastagePage() {
  const [logs, setLogs] = useState<WastageRecord[]>([]);

  useEffect(() => {
    let active = true;
    fetch('/api/proxy/production/wastage')
      .then((r) => (r.ok ? r.json() : []))
      .then((res) => {
        if (!active) return;
        setLogs(Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const byReason = ['BURNT', 'SPILLED', 'QUALITY_REJECT', 'OTHER'].map((reason) => ({
    reason,
    qty: logs.filter((l) => l.reason === reason).reduce((s, l) => s + l.qty, 0),
  }));
  const maxQty = Math.max(1, ...byReason.map((r) => r.qty));

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs text-ink-3 mb-1">
          <Link href="/production" className="hover:text-ink">Production</Link>
          <span>/</span>
          <span className="text-orange-400">Wastage Log</span>
        </div>
        <h1 className="text-2xl font-bold text-ink">Production Wastage &amp; Write-Offs</h1>
        <p className="text-sm text-ink-3">
          Track wastage by reason and item; large write-offs trigger WASTAGE_WRITEOFF approval.
        </p>
      </div>

      <Card className="p-5 bg-sheet border-rule">
        <h2 className="text-sm font-semibold text-ink mb-4">Wastage Breakdown by Reason (kg)</h2>
        <div className="space-y-3">
          {byReason.map((r) => (
            <div key={r.reason} className="flex items-center gap-3 text-xs">
              <div className="w-32 text-ink-2 font-medium">{r.reason.replace('_', ' ')}</div>
              <div className="flex-1 h-3 bg-sunken rounded-full overflow-hidden">
                <div
                  className="h-full bg-rose-500"
                  style={{ width: `${(r.qty / maxQty) * 100}%` }}
                />
              </div>
              <div className="w-16 text-right font-mono text-ink font-bold">{r.qty} kg</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="bg-sheet border border-rule rounded-[3px] overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper border-b border-rule text-xs uppercase text-ink-3">
            <tr>
              <th className="p-3">Wastage #</th>
              <th className="p-3">Work Order &amp; Item</th>
              <th className="p-3">Reason</th>
              <th className="p-3 text-right">Qty</th>
              <th className="p-3">Approval</th>
              <th className="p-3">Logged At</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {logs.map((w) => (
              <tr key={w.id} className="hover:bg-sunken">
                <td className="p-3 font-mono text-xs text-madder font-semibold">{w.wastageNo}</td>
                <td className="p-3">
                  <div className="text-ink font-medium">{w.itemName}</div>
                  <div className="text-[11px] font-mono text-ink-3">{w.woNumber}</div>
                </td>
                <td className="p-3 text-xs text-ink-2">{w.reason}</td>
                <td className="p-3 text-right font-mono font-bold text-madder">
                  {w.qty} {w.uom}
                </td>
                <td className="p-3">
                  {w.requiresWriteOffApproval ? (
                    <Badge variant="warning">WASTAGE_WRITEOFF</Badge>
                  ) : (
                    <Badge variant="success">Within Threshold</Badge>
                  )}
                </td>
                <td className="p-3 text-xs font-mono text-ink-3">{w.loggedAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

