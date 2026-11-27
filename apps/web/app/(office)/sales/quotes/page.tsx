'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { DataTable, type ColumnDef, Button, KpiCard, Badge, StatusPill } from '@neo/ui';
import { formatINR } from '@neo/shared';
import { type QuoteRecord } from '../../../../src/lib/sales-data';

export default function QuotesListPage() {
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  useEffect(() => {
    fetch('/api/proxy/quotes')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        setQuotes(
          list.map((q: any) => ({
            id: q.id,
            quoteNumber: q.quote_no ?? q.quoteNumber ?? q.id.slice(0, 8),
            customerId: q.customer_id ?? '',
            customerName: q.customer_name ?? q.customerName ?? 'Customer',
            validUntil: q.valid_until ? String(q.valid_until).split('T')[0] : '',
            totalAmount: Number(q.total_amount ?? 0),
            marginPct: Number(q.margin_pct ?? 0),
            status: (q.status ?? 'DRAFT') as QuoteRecord['status'],
            lines: [],
            createdAt: q.created_at ?? '',
          })),
        );
      })
      .catch(() => setQuotes([]));
  }, []);

  const getDaysRemaining = (validUntil: string) => {
    const diff = Math.ceil(
      (new Date(validUntil).getTime() - Date.now()) / (1000 * 3600 * 24),
    );
    return diff;
  };

  const filtered = quotes.filter((q) => statusFilter === 'ALL' || q.status === statusFilter);

  const columns: ColumnDef<QuoteRecord>[] = [
    {
      id: 'quoteNumber',
      header: 'Quote No.',
      accessorKey: 'quoteNumber',
      cell: (info) => {
        const q = info.row.original;
        return (
          <Link href={`/sales/quotes/${q.id}`} className="font-mono text-xs font-bold text-action hover:underline">
            {q.quoteNumber}
          </Link>
        );
      },
    },
    {
      id: 'customer',
      header: 'Customer',
      accessorKey: 'customerName',
      cell: (info) => <span className="text-xs font-bold text-ink">{info.getValue() as string}</span>,
    },
    {
      id: 'expiry',
      header: 'Expiry Countdown',
      cell: (info) => {
        const q = info.row.original;
        const days = getDaysRemaining(q.validUntil);
        return (
          <Badge tone={days <= 2 ? 'warning' : 'neutral'}>
            {days > 0 ? `Expires in ${days}d` : 'Expired'} ({q.validUntil})
          </Badge>
        );
      },
    },
    {
      id: 'total',
      header: 'Quoted Value',
      accessorKey: 'totalAmount',
      cell: (info) => (
        <span className="font-mono text-xs font-bold text-ink">{formatINR(info.getValue() as number)}</span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      accessorKey: 'status',
      cell: (info) => {
        const s = info.getValue() as QuoteRecord['status'];
        const tone = s === 'CONVERTED' ? 'success' : s === 'SENT' ? 'info' : s === 'LOST' || s === 'EXPIRED' ? 'danger' : 'neutral';
        return <StatusPill tone={tone} label={s} />;
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: (info) => (
        <Link href={`/sales/quotes/${info.row.original.id}`} className="text-xs text-action hover:underline font-medium">
          Open &amp; Convert →
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-rule pb-5">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Customer Quotes</h1>
          <p className="text-xs text-ink-3 mt-0.5">
            Create validity-tracked price quotes and convert them to sales orders in 1 click.
          </p>
        </div>
        <Link href="/sales/quotes/new">
          <Button variant="primary" size="sm">
            + New Quote
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard title="Open Quotes" value={String(quotes.filter((q) => q.status === 'SENT' || q.status === 'DRAFT').length)} subtitle="Active negotiations" tone="default" />
        <KpiCard title="Expiring Within 3 Days" value={String(quotes.filter((q) => getDaysRemaining(q.validUntil) <= 3).length)} subtitle="Follow up needed" tone="warning" />
        <KpiCard title="Total Pipeline Value" value={formatINR(quotes.reduce((s, q) => s + q.totalAmount, 0))} subtitle="Across open quotes" tone="brand" />
      </div>

      <div className="flex gap-2 text-xs">
        {['ALL', 'DRAFT', 'SENT', 'CONVERTED', 'EXPIRED', 'LOST'].map((st) => (
          <button
            key={st}
            onClick={() => setStatusFilter(st)}
            className={`px-3 py-1.5 rounded-[3px] font-semibold border ${
              statusFilter === st ? 'bg-action text-white border-action/30' : 'bg-sheet text-ink-3 border-rule'
            }`}
          >
            {st}
          </button>
        ))}
      </div>

      <DataTable columns={columns} data={filtered} pageSize={10} />
    </div>
  );
}

