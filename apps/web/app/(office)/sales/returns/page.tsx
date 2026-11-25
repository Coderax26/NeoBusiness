'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { DataTable, type ColumnDef, Button, KpiCard, Badge, StatusPill, Dialog } from '@neo/ui';
import { formatINR } from '@neo/shared';
import { type SalesReturnRecord, type SalesOrderRecord } from '../../../../src/lib/sales-data';

const RETURN_REASONS = [
  'Damaged in transit',
  'Quality issue / Spoilage',
  'Near expiry / Expired',
  'Wrong item delivered',
  'Customer rejected',
];

export default function SalesReturnsPage() {
  const [returns, setReturns] = useState<SalesReturnRecord[]>([]);
  const [orders, setOrders] = useState<SalesOrderRecord[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  const deliveredOrders = orders.filter((o) => o.status === 'DELIVERED');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [qty, setQty] = useState('1');
  const [reason, setReason] = useState(RETURN_REASONS[0]);
  const [condition, setCondition] = useState<'RESALEABLE' | 'DAMAGED'>('RESALEABLE');

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch('/api/proxy/credit-notes').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/proxy/orders').then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([cnData, ordData]) => {
        if (!active) return;
        if (Array.isArray(cnData)) {
          setReturns(
            cnData.map((r: any) => ({
              id: String(r.id),
              returnNumber: String(r.creditNoteNumber || r.credit_note_number || r.returnNumber || r.id),
              orderId: String(r.orderId || r.order_id || ''),
              orderNumber: String(r.orderNumber || r.order_number || r.invoiceNumber || '—'),
              customerId: String(r.customerId || r.customer_id || ''),
              customerName: String(r.customerName || r.customer_name || 'Customer'),
              itemName: String(r.itemName || r.item_name || r.reason || 'Returned Goods'),
              qty: Number(r.qty ?? r.returnedQty ?? 1),
              uom: String(r.uom || 'kg'),
              reason: String(r.reason || 'Customer return'),
              condition: (r.condition === 'DAMAGED' ? 'DAMAGED' : 'RESALEABLE') as SalesReturnRecord['condition'],
              creditAmount: Number(r.amount ?? r.creditAmount ?? r.totalAmount ?? 0),
              status: (r.status === 'STOCK_RECEIVED' ? 'STOCK_RECEIVED' : 'PENDING_RECEIPT') as SalesReturnRecord['status'],
              createdAt: String(r.createdAt || r.created_at || new Date().toISOString()).slice(0, 10),
            })),
          );
        }
        if (Array.isArray(ordData)) {
          const mappedOrders: SalesOrderRecord[] = ordData.map((o: any) => ({
            id: String(o.id),
            orderNumber: String(o.orderNumber || o.order_no || o.order_number || o.id),
            customerId: String(o.customerId || o.customer_id || ''),
            customerName: String(o.customerName || o.customer_name || 'Customer'),
            siteName: String(o.site_name || o.siteName || 'Main Site'),
            deliveryDate: String(o.delivery_date || o.deliveryDate || '').slice(0, 10),
            deliveryWindow: '10-12',
            status: (o.order_status || o.status || 'DELIVERED') as SalesOrderRecord['status'],
            createdAt: String(o.created_at_idx || o.createdAt || '').slice(0, 10),
            createdBy: 'Sales',
            subtotal: Number(o.total_amount ?? o.totalAmount ?? 0),
            gstTotal: 0,
            grandTotal: Number(o.total_amount ?? o.totalAmount ?? 0),
            marginPct: 15,
            timeline: [],
            lines: [
              {
                id: '1',
                itemId: '',
                sku: '',
                itemName: 'Order Item',
                category: 'PROCESSED_FG',
                qty: 1,
                uom: 'kg',
                unitPrice: Number(o.total_amount ?? o.totalAmount ?? 0),
                gstPct: 5,
                floorPrice: 0,
                targetPrice: 0,
                landedCost: 0,
                lineTotal: Number(o.total_amount ?? o.totalAmount ?? 0),
                atpStock: 0,
                reservedQty: 0,
              },
            ],
          }));
          setOrders(mappedOrders);
          const firstDel = mappedOrders.find((x) => x.status === 'DELIVERED') || mappedOrders[0];
          if (firstDel) setSelectedOrderId(firstDel.id);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const selectedOrder = orders.find((o) => o.id === selectedOrderId) || deliveredOrders[0] || orders[0];
  const firstLine = selectedOrder?.lines?.[0] || { itemName: 'Item', uom: 'kg', unitPrice: 0, gstPct: 5 };

  const handleCreateReturn = async () => {
    const returnQty = parseFloat(qty) || 1;
    const creditAmount = Number((returnQty * firstLine.unitPrice * (1 + firstLine.gstPct / 100)).toFixed(2));

    const newRec: SalesReturnRecord = {
      id: `ret-${Date.now()}`,
      returnNumber: `SR-2026-${Math.floor(100 + Math.random() * 899)}`,
      orderId: selectedOrder.id,
      orderNumber: selectedOrder.orderNumber,
      customerId: selectedOrder.customerId,
      customerName: selectedOrder.customerName,
      itemName: firstLine.itemName,
      qty: returnQty,
      uom: firstLine.uom,
      reason,
      condition,
      creditAmount,
      status: condition === 'RESALEABLE' ? 'STOCK_RECEIVED' : 'CREDIT_NOTE_REQUESTED',
      createdAt: new Date().toISOString().split('T')[0],
    };

    try {
      await fetch('/api/proxy/credit-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRec),
      }).catch(() => {});
    } finally {
      setReturns((prev) => [newRec, ...prev]);
      setModalOpen(false);
    }
  };

  const columns: ColumnDef<SalesReturnRecord>[] = [
    {
      id: 'returnNumber',
      header: 'Return No.',
      accessorKey: 'returnNumber',
      cell: (info) => <span className="font-mono text-xs font-bold text-action">{info.getValue() as string}</span>,
    },
    {
      id: 'order',
      header: 'Order & Customer',
      cell: (info) => {
        const r = info.row.original;
        return (
          <div className="text-xs">
            <div className="font-bold text-ink">{r.customerName}</div>
            <Link href={`/sales/orders/${r.orderId}`} className="text-[11px] font-mono text-action hover:underline">
              {r.orderNumber}
            </Link>
          </div>
        );
      },
    },
    {
      id: 'item',
      header: 'Returned Item & Qty',
      cell: (info) => {
        const r = info.row.original;
        return (
          <div className="text-xs">
            <div className="text-ink">{r.itemName}</div>
            <div className="text-[11px] text-ink-3">{r.qty} {r.uom} · {r.reason}</div>
          </div>
        );
      },
    },
    {
      id: 'condition',
      header: 'Condition',
      accessorKey: 'condition',
      cell: (info) => {
        const c = info.getValue() as SalesReturnRecord['condition'];
        return <Badge tone={c === 'RESALEABLE' ? 'success' : 'danger'}>{c}</Badge>;
      },
    },
    {
      id: 'credit',
      header: 'Credit Amount',
      accessorKey: 'creditAmount',
      cell: (info) => <span className="font-mono text-xs font-bold text-ink">{formatINR(info.getValue() as number)}</span>,
    },
    {
      id: 'status',
      header: 'Status',
      accessorKey: 'status',
      cell: (info) => {
        const s = info.getValue() as SalesReturnRecord['status'];
        return <StatusPill tone={s === 'STOCK_RECEIVED' ? 'success' : 'warning'} label={s.replace(/_/g, ' ')} />;
      },
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-rule pb-5">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Sales Returns &amp; Credit Notes</h1>
          <p className="text-xs text-ink-3 mt-0.5">
            Record returned goods against delivered orders, inspect condition, and trigger credit notes.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setModalOpen(true)}>
          + Record Sales Return
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard title="Total Returns" value={String(returns.length)} subtitle="Logged this week" tone="default" />
        <KpiCard title="Resaleable Stock" value={String(returns.filter((r) => r.condition === 'RESALEABLE').length)} subtitle="Restocked to inventory" tone="success" />
        <KpiCard title="Total Credit Value" value={formatINR(returns.reduce((s, r) => s + r.creditAmount, 0))} subtitle="Pending / issued credit notes" tone="warning" />
      </div>

      <DataTable columns={columns} data={returns} pageSize={10} />

      <Dialog open={modalOpen} onClose={() => setModalOpen(false)} title="Record Sales Return" maxWidth="md">
        <div className="space-y-4 my-2 text-xs">
          <div>
            <label className="block text-ink-2 font-semibold mb-1">Delivered Order</label>
            <select
              value={selectedOrderId}
              onChange={(e) => setSelectedOrderId(e.target.value)}
              className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-ink"
            >
              {(deliveredOrders.length > 0 ? deliveredOrders : orders).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.orderNumber} — {o.customerName} ({o.lines[0]?.itemName || 'Item'})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-ink-2 font-semibold mb-1">Return Qty ({firstLine.uom})</label>
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-ink font-mono"
              />
            </div>
            <div>
              <label className="block text-ink-2 font-semibold mb-1">Stock Condition</label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as any)}
                className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-ink"
              >
                <option value="RESALEABLE">Resaleable (Return to Stock)</option>
                <option value="DAMAGED">Damaged (Scrap / Write-off)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-ink-2 font-semibold mb-1">Return Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-ink"
            >
              {RETURN_REASONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div className="p-3 bg-paper border border-rule rounded-[3px] text-ink-2">
            Credit Note Request Amount: <strong className="text-action font-mono">{formatINR((parseFloat(qty) || 1) * firstLine.unitPrice * (1 + firstLine.gstPct / 100))}</strong>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleCreateReturn}>Submit Return &amp; Credit Request</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

