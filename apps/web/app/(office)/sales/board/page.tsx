'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, Badge } from '@neo/ui';
import { formatINR } from '@neo/shared';
import { INITIAL_SALES_ORDERS, type SalesOrderRecord, type SalesOrderStatus } from '../../../../src/lib/sales-data';

const BOARD_COLUMNS: { status: SalesOrderStatus; label: string; color: string }[] = [
  { status: 'DRAFT', label: 'Drafts', color: 'border-zinc-700' },
  { status: 'PENDING_APPROVAL', label: 'Waiting for Owner', color: 'border-amber-500/40' },
  { status: 'CONFIRMED', label: 'Confirmed', color: 'border-indigo-500/40' },
  { status: 'READY', label: 'Ready to Dispatch', color: 'border-teal-500/40' },
  { status: 'DELIVERED', label: 'Delivered', color: 'border-emerald-500/40' },
];

export default function SalesBoardPage() {
  const [orders, setOrders] = useState<SalesOrderRecord[]>(INITIAL_SALES_ORDERS);

  const moveOrder = (orderId: string, nextStatus: SalesOrderStatus) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o)),
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <h1 className="text-2xl font-black text-white">Sales Board (Kanban)</h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Visual pipeline of active customer orders from draft through delivery.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Link href="/sales/orders">
            <Button variant="secondary" size="sm">
              📋 Switch to Table View
            </Button>
          </Link>
          <Link href="/sales/orders/new">
            <Button variant="primary" size="sm">
              + New Quick Order
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {BOARD_COLUMNS.map((col) => {
          const cards = orders.filter((o) => o.status === col.status);
          return (
            <div
              key={col.status}
              className={`bg-zinc-900/60 border-t-2 ${col.color} border-x border-b border-zinc-800 rounded-2xl p-3 space-y-3 min-h-[380px]`}
            >
              <div className="flex items-center justify-between text-xs font-bold text-white pb-2 border-b border-zinc-800">
                <span>{col.label}</span>
                <Badge tone="neutral">{cards.length}</Badge>
              </div>

              {cards.length === 0 ? (
                <p className="text-[11px] text-zinc-600 text-center py-8">No orders</p>
              ) : (
                cards.map((o) => (
                  <div
                    key={o.id}
                    className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2 hover:border-teal-500/40 transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <Link href={`/sales/orders/${o.id}`} className="font-mono font-bold text-teal-400 hover:underline">
                        {o.orderNumber}
                      </Link>
                      <span className="font-mono font-bold text-white">{formatINR(o.grandTotal)}</span>
                    </div>
                    <div className="text-xs font-semibold text-zinc-200">{o.customerName}</div>
                    <div className="text-[11px] text-zinc-500">
                      {o.deliveryDate} • Slot {o.deliveryWindow}
                    </div>
                    {o.status === 'PENDING_APPROVAL' && (
                      <button
                        onClick={() => moveOrder(o.id, 'CONFIRMED')}
                        className="w-full py-1 rounded-lg bg-emerald-500/15 text-emerald-400 text-[11px] font-semibold hover:bg-emerald-500/25"
                      >
                        ✓ Quick Approve
                      </button>
                    )}
                    {o.status === 'CONFIRMED' && (
                      <button
                        onClick={() => moveOrder(o.id, 'READY')}
                        className="w-full py-1 rounded-lg bg-teal-500/15 text-teal-400 text-[11px] font-semibold hover:bg-teal-500/25"
                      >
                        Mark Ready →
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
