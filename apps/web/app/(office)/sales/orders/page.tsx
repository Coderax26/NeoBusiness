'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  DataTable,
  type ColumnDef,
  Button,
  KpiCard,
  Badge,
  StatusPill,
  Dialog,
  exportToCsv,
} from '@neo/ui';
import { formatINR, CANCEL_REASONS } from '@neo/shared';
import { type SalesOrderRecord, type SalesOrderStatus } from '../../../../src/lib/sales-data';

const STATUS_TABS: { key: string; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'DRAFT', label: 'Draft' },
  { key: 'PENDING_APPROVAL', label: 'Waiting approval' },
  { key: 'CONFIRMED', label: 'Confirmed' },
  { key: 'IN_PRODUCTION_SOURCING', label: 'Being made/sourced' },
  { key: 'READY', label: 'Ready' },
  { key: 'DISPATCHED', label: 'On the way' },
  { key: 'DELIVERED', label: 'Delivered' },
  { key: 'CANCELLED', label: 'Cancelled' },
];

export default function OrdersTrackerPage() {
  const [orders, setOrders] = useState<SalesOrderRecord[]>([]);
  const [viewMode, setViewMode] = useState<'table' | 'kanban' | 'calendar'>('table');
  const [statusTab, setStatusTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [savedView, setSavedView] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/orders');
      if (!res.ok) return;
      const rows = await res.json();
      if (!Array.isArray(rows)) return;

      const mapped: SalesOrderRecord[] = rows.map((r: any) => {
        const subtotal = Number(r.total_amount ?? 0);
        const gstTotal = Number((subtotal * 0.05).toFixed(2));
        const grandTotal = Number((subtotal + gstTotal).toFixed(2));
        const lineCount = Math.max(1, Number(r.lines_count ?? 1));
        const deliveryDate = r.delivery_date
          ? String(r.delivery_date).split('T')[0]
          : new Date().toISOString().split('T')[0];
        const win = r.delivery_time_window;
        const deliveryWindow: SalesOrderRecord['deliveryWindow'] =
          win === '04-08' || win === '10-12' || win === '13-16' || win === '18-21'
            ? win
            : '10-12';
        return {
          id: String(r.id),
          orderNumber: String(r.order_no || r.orderNumber || ''),
          customerId: String(r.customer_id || ''),
          customerName: String(r.customer_name || 'Customer'),
          siteName: String(r.site_name || 'NeoCore Factory — Mumbai'),
          deliveryDate,
          deliveryWindow,
          status: (r.order_status || 'DRAFT') as SalesOrderStatus,
          createdAt: String(r.created_at_idx || new Date().toISOString()),
          createdBy: 'Coordinator',
          subtotal,
          gstTotal,
          grandTotal,
          marginPct: r.margin_pct != null ? Number(r.margin_pct) : 15,
          lines: Array.from({ length: lineCount }, (_, idx) => ({
            id: `${r.id}-line-${idx + 1}`,
            itemId: '',
            sku: '',
            itemName: idx === 0 ? `${lineCount} line item${lineCount === 1 ? '' : 's'}` : `Item ${idx + 1}`,
            category: 'PROCESSED_FG',
            qty: 1,
            uom: 'unit',
            unitPrice: lineCount > 0 ? Number((subtotal / lineCount).toFixed(2)) : subtotal,
            floorPrice: 0,
            targetPrice: 0,
            atpStock: 0,
            gstPct: 5,
            reservedQty: 0,
          })),
          timeline: [
            {
              step: String(r.order_status || 'Created'),
              timestamp: new Date(r.created_at_idx || Date.now()).toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
              }),
              user: 'System',
            },
          ],
        };
      });
      setOrders(mapped);
    } catch {
      // ignore network error; initial state stays visible
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // Cancel reason dialog
  const [cancelTarget, setCancelTarget] = useState<SalesOrderRecord | null>(null);
  const [cancelReason, setCancelReason] = useState<string>(CANCEL_REASONS[0]);

  const handleConfirmOrder = async (id: string) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === id ? { ...o, status: 'CONFIRMED' } : o)),
    );
    try {
      const res = await fetch(`/api/proxy/orders/${id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remarks: 'Confirmed from Orders Tracker' }),
      });
      if (res.ok) {
        await loadOrders();
      }
    } catch {
      // ignore network error
    }
  };

  const handleDuplicateOrder = (order: SalesOrderRecord) => {
    const cloned: SalesOrderRecord = {
      ...order,
      id: `ord-${Date.now()}`,
      orderNumber: `SO-2026-${Math.floor(1050 + Math.random() * 900)}`,
      status: 'DRAFT',
      createdAt: new Date().toISOString(),
    };
    setOrders((prev) => [cloned, ...prev]);
  };

  const handleConfirmCancel = async () => {
    if (!cancelTarget) return;
    const targetId = cancelTarget.id;
    setOrders((prev) =>
      prev.map((o) =>
        o.id === targetId ? { ...o, status: 'CANCELLED', cancelReason } : o,
      ),
    );
    setCancelTarget(null);
    try {
      const res = await fetch(`/api/proxy/orders/${targetId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason }),
      });
      if (res.ok) {
        await loadOrders();
      }
    } catch {
      // ignore network error
    }
  };

  // Saved Views (§5)
  const applySavedView = (viewKey: string) => {
    if (savedView === viewKey) {
      setSavedView(null);
      setStatusTab('ALL');
      return;
    }
    setSavedView(viewKey);
    if (viewKey === 'READY_PUNE') setStatusTab('READY');
    if (viewKey === 'WAITING_OWNER') setStatusTab('PENDING_APPROVAL');
    if (viewKey === 'MY_TODAY') setStatusTab('ALL');
  };

  const filteredOrders = orders.filter((o) => {
    if (statusTab !== 'ALL' && o.status !== statusTab) return false;
    if (savedView === 'READY_PUNE' && !o.siteName.includes('Pune')) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        o.orderNumber.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // KPIs
  const todayCount = orders.length;
  const waitingCount = orders.filter((o) => o.status === 'PENDING_APPROVAL' || o.status === 'COUNTER_OFFERED').length;
  const readyCount = orders.filter((o) => o.status === 'READY').length;
  const deliveredCount = orders.filter((o) => o.status === 'DELIVERED').length;
  const totalValue = orders.reduce((s, o) => s + o.grandTotal, 0);

  const getStatusTone = (status: SalesOrderStatus) => {
    if (status === 'DELIVERED' || status === 'PAID' || status === 'READY') return 'success';
    if (status === 'PENDING_APPROVAL' || status === 'COUNTER_OFFERED') return 'warning';
    if (status === 'CANCELLED') return 'danger';
    if (status === 'CONFIRMED' || status === 'DISPATCHED') return 'info';
    return 'neutral';
  };

  const columns: ColumnDef<SalesOrderRecord>[] = [
    {
      id: 'orderNumber',
      header: 'Order No.',
      accessorKey: 'orderNumber',
      cell: (info) => {
        const o = info.row.original;
        return (
          <Link href={`/sales/orders/${o.id}`} className="font-mono text-xs font-bold text-action hover:underline">
            {o.orderNumber}
          </Link>
        );
      },
    },
    {
      id: 'customer',
      header: 'Customer & Site',
      cell: (info) => {
        const o = info.row.original;
        return (
          <div>
            <Link href={`/sales/customers/${o.customerId}`} className="font-bold text-ink text-xs hover:text-action">
              {o.customerName}
            </Link>
            <div className="text-[11px] text-ink-3">{o.siteName}</div>
          </div>
        );
      },
    },
    {
      id: 'delivery',
      header: 'Delivery Slot',
      cell: (info) => {
        const o = info.row.original;
        return (
          <div className="text-xs">
            <div className="text-ink">{o.deliveryDate}</div>
            <div className="text-[11px] text-ink-3">Slot {o.deliveryWindow}</div>
          </div>
        );
      },
    },
    {
      id: 'total',
      header: 'Order Value',
      accessorKey: 'grandTotal',
      cell: (info) => (
        <span className="font-mono text-xs font-bold text-ink">
          {formatINR(info.getValue() as number)}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      accessorKey: 'status',
      cell: (info) => {
        const s = info.getValue() as SalesOrderStatus;
        return <StatusPill tone={getStatusTone(s)} label={s.replace('_', ' ')} />;
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: (info) => {
        const o = info.row.original;
        return (
          <div className="flex items-center gap-2 text-xs">
            <Link href={`/sales/orders/${o.id}`} className="text-action hover:underline font-medium">
              View
            </Link>
            {o.status === 'DRAFT' && (
              <button onClick={() => handleConfirmOrder(o.id)} className="text-leaf hover:underline">
                Confirm
              </button>
            )}
            <button onClick={() => handleDuplicateOrder(o)} className="text-ink-3 hover:text-ink">
              Duplicate
            </button>
            {o.status !== 'CANCELLED' && o.status !== 'DELIVERED' && (
              <button onClick={() => setCancelTarget(o)} className="text-madder hover:underline">
                Cancel
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-rule pb-5">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Orders Tracker</h1>
          <p className="text-xs text-ink-3 mt-0.5">
            Track order confirmations, Owner price/credit approvals, production readiness, and dispatches.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              exportToCsv('sales-orders.csv', filteredOrders, [
                { key: 'orderNumber', label: 'Order No' },
                { key: 'customerName', label: 'Customer' },
                { key: 'deliveryDate', label: 'Delivery Date' },
                { key: 'grandTotal', label: 'Total' },
                { key: 'status', label: 'Status' },
              ])
            }
          >
            📤 Export CSV
          </Button>
          <Link href="/sales/orders/new">
            <Button variant="primary" size="sm">
              + New Quick Order
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Strip (§5) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <KpiCard title="Today's Orders" value={String(todayCount)} subtitle="Active pipeline" tone="default" />
        <KpiCard title="Waiting for Owner" value={String(waitingCount)} subtitle="Price/credit exceptions" tone={waitingCount > 0 ? 'warning' : 'success'} />
        <KpiCard title="Ready to Dispatch" value={String(readyCount)} subtitle="Packed & staged" tone="brand" />
        <KpiCard title="Delivered Today" value={String(deliveredCount)} subtitle="POD received" tone="success" />
        <KpiCard title="Value Today" value={formatINR(totalValue)} subtitle="Gross order value" tone="default" />
      </div>

      {/* Saved Views & View Mode Toggle */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-sheet border border-rule p-3.5 rounded-[4px]">
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Search order # or customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-60 bg-paper border border-rule rounded-[3px] px-3 py-1.5 text-xs text-ink focus:outline-none focus:border-action/30"
          />
          <span className="text-[11px] text-ink-3 ml-1">Saved Views:</span>
          {[
            { key: 'MY_TODAY', label: 'My orders today' },
            { key: 'READY_PUNE', label: 'Ready for Pune route' },
            { key: 'WAITING_OWNER', label: 'Waiting for Owner' },
          ].map((sv) => (
            <button
              key={sv.key}
              onClick={() => applySavedView(sv.key)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                savedView === sv.key
                  ? 'bg-action/20 text-action border-action/30'
                  : 'bg-paper text-ink-3 border-rule hover:text-ink'
              }`}
            >
              {sv.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 bg-paper p-1 rounded-[3px] border border-rule text-xs">
          {(['table', 'kanban', 'calendar'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className={`px-3 py-1 rounded-lg font-medium capitalize ${
                viewMode === m ? 'bg-sunken text-ink font-bold' : 'text-ink-3 hover:text-ink'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 text-xs">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatusTab(t.key)}
            className={`px-3 py-1.5 rounded-[3px] font-semibold whitespace-nowrap border transition-colors ${
              statusTab === t.key
                ? 'bg-action text-white border-action/30'
                : 'bg-sheet text-ink-3 border-rule hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content by View Mode */}
      {viewMode === 'table' && <DataTable columns={columns} data={filteredOrders} pageSize={10} />}

      {viewMode === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { status: 'PENDING_APPROVAL', title: 'Waiting Approval' },
            { status: 'CONFIRMED', title: 'Confirmed' },
            { status: 'READY', title: 'Ready for Dispatch' },
            { status: 'DELIVERED', title: 'Delivered' },
          ].map((col) => {
            const colOrders = filteredOrders.filter((o) => o.status === col.status);
            return (
              <div key={col.status} className="bg-sheet border border-rule rounded-[4px] p-3 space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-ink pb-2 border-b border-rule">
                  <span>{col.title}</span>
                  <Badge tone="neutral">{colOrders.length}</Badge>
                </div>
                {colOrders.map((o) => (
                  <Link key={o.id} href={`/sales/orders/${o.id}`}>
                    <div className="p-3 bg-paper border border-rule hover:border-action/30 rounded-[3px] space-y-1.5 transition-colors">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-mono font-bold text-action">{o.orderNumber}</span>
                        <span className="font-mono font-bold text-ink">{formatINR(o.grandTotal)}</span>
                      </div>
                      <div className="text-xs font-semibold text-ink">{o.customerName}</div>
                      <div className="text-[11px] text-ink-3">{o.deliveryDate} • Slot {o.deliveryWindow}</div>
                    </div>
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {viewMode === 'calendar' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from(new Set(filteredOrders.map((o) => o.deliveryDate))).map((date) => (
            <div key={date} className="bg-sheet border border-rule rounded-[4px] p-4 space-y-3">
              <div className="text-xs font-bold text-action border-b border-rule pb-2">
                📅 Delivery Date: {date}
              </div>
              {filteredOrders
                .filter((o) => o.deliveryDate === date)
                .map((o) => (
                  <Link key={o.id} href={`/sales/orders/${o.id}`}>
                    <div className="p-2.5 bg-paper border border-rule rounded-[3px] text-xs flex justify-between items-center hover:border-action/30">
                      <div>
                        <span className="font-bold text-ink">{o.customerName}</span>
                        <span className="block text-[11px] text-ink-3">{o.orderNumber} • Slot {o.deliveryWindow}</span>
                      </div>
                      <StatusPill tone={getStatusTone(o.status)} label={o.status} />
                    </div>
                  </Link>
                ))}
            </div>
          ))}
        </div>
      )}

      {/* Cancel Reason Dialog (§11) */}
      <Dialog
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title={`Cancel Order ${cancelTarget?.orderNumber || ''}`}
        maxWidth="sm"
      >
        <div className="space-y-4 my-2 text-xs">
          <p className="text-ink-2">Please choose a reason for cancelling this order:</p>
          <select
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-ink"
          >
            {CANCEL_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setCancelTarget(null)}>
              Keep Order
            </Button>
            <Button variant="danger" size="sm" onClick={handleConfirmCancel}>
              Confirm Cancel
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

