'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { Button, KpiCard, Badge, StatusPill, Card, AgingBuckets } from '@neo/ui';
import {
  computeRunningLedgerBalance,
  canViewMarginAndCost,
  formatINR,
  type LedgerEntryInput,
  type SessionUser,
} from '@neo/shared';

export default function Customer360Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [customer, setCustomer] = useState({
    id,
    name: 'Loading...',
    phone: '',
    gstin: '',
    site: '',
    window: '10-12',
    creditLimit: 0,
    outstanding: 0,
    overdueDays: 0,
    creditHold: false,
  });
  const [customerOrders, setCustomerOrders] = useState<any[]>([]);
  const [customerInvoices, setCustomerInvoices] = useState<any[]>([]);
  const [customerPayments, setCustomerPayments] = useState<any[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntryInput[]>([]);
  const [dailyPrices, setDailyPrices] = useState<any[]>([]);

  const [user, setUser] = useState<SessionUser | null>(null);
  const [activeTab, setActiveTab] = useState<
    'overview' | 'orders' | 'invoices' | 'statement' | 'payments' | 'promises' | 'prices' | 'contacts' | 'activity' | 'documents'
  >('overview');

  // Activity log state (§8, F4-08)
  const [activities, setActivities] = useState<Array<{ id: string; type: string; date: string; user: string; notes: string }>>([]);
  const [newActType, setNewActType] = useState<'CALL' | 'VISIT' | 'WHATSAPP' | 'NOTE'>('CALL');
  const [newActNote, setNewActNote] = useState('');

  // Promises (PTP) state
  const [promises, setPromises] = useState<Array<{ id: string; amount: number; dueDate: string; status: string; note: string }>>([]);

  // Contacts state
  const [contacts, setContacts] = useState<Array<{ id: string; name: string; role: string; phone: string; isPrimary: boolean }>>([]);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (active && data?.user) setUser(data.user);
      })
      .catch(() => {});

    Promise.all([
      fetch(`/api/proxy/customers/${encodeURIComponent(id)}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/proxy/orders?customerId=${encodeURIComponent(id)}`).then((r) => (r.ok ? r.json() : [])),
      fetch('/api/proxy/prices/today').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/proxy/ptp').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/proxy/invoices').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/proxy/collections').then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([custData, ordData, priceData, ptpData, invData, payData]) => {
        if (!active) return;
        const invList = Array.isArray(invData) ? invData : Array.isArray(invData?.data) ? invData.data : [];
        const payList = Array.isArray(payData) ? payData : Array.isArray(payData?.data) ? payData.data : [];
        setCustomerInvoices(invList.filter((inv: any) => String(inv.customer_id ?? inv.customerId ?? '') === id));
        setCustomerPayments(payList.filter((p: any) => String(p.customer_id ?? p.customerId ?? '') === id));
        if (custData && custData.id) {
          setCustomer({
            id: String(custData.id),
            name: String(custData.business_name || custData.name || 'Customer'),
            phone: String(custData.phone || ''),
            gstin: String(custData.gstin || ''),
            site: String(custData.default_site_name || 'Main Site'),
            window: String(custData.preferred_delivery_window || '10-12'),
            creditLimit: Number(custData.credit_limit ?? 0),
            outstanding: Number(custData.current_ar_balance ?? 0),
            overdueDays: Number(custData.overdue_days ?? 0),
            creditHold: Boolean(custData.credit_hold),
          });
          setContacts([
            {
              id: 'primary',
              name: String(custData.contact_person || custData.business_name || 'Primary Contact'),
              role: 'Primary Contact',
              phone: String(custData.phone || ''),
              isPrimary: true,
            },
          ]);
        }
        if (Array.isArray(ordData)) {
          setCustomerOrders(
            ordData.map((o: any) => ({
              id: String(o.id),
              orderNumber: String(o.order_no || o.orderNumber || o.id),
              deliveryDate: String(o.delivery_date || o.created_at_idx || '').slice(0, 10),
              status: String(o.order_status || o.status || 'DRAFT'),
              grandTotal: Number(o.total_amount ?? o.grandTotal ?? 0),
            })),
          );
          setLedgerEntries(
            ordData.slice(0, 10).map((o: any) => ({
              id: String(o.id),
              date: String(o.delivery_date || o.created_at_idx || new Date().toISOString()).slice(0, 10),
              type: 'INVOICE' as const,
              reference: String(o.order_no || o.id),
              description: `Sales Order ${o.order_no || o.id}`,
              debit: Number(o.total_amount ?? 0),
              credit: 0,
            })),
          );
        }
        if (Array.isArray(priceData)) setDailyPrices(priceData);
        if (Array.isArray(ptpData)) {
          setPromises(
            ptpData
              .filter((p: any) => !p.customerId || String(p.customerId) === id)
              .map((p: any) => ({
                id: String(p.id),
                amount: Number(p.amount ?? p.promisedAmount ?? 0),
                dueDate: String(p.dueDate || p.promisedDate || '').slice(0, 10),
                status: String(p.status || 'OPEN'),
                note: String(p.note || p.remarks || ''),
              })),
          );
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [id]);

  const isOwner = !user || canViewMarginAndCost(user.role);
  const ledgerWithBalance = computeRunningLedgerBalance(ledgerEntries);
  const creditUsedPct = customer.creditLimit > 0 ? Math.round((customer.outstanding / customer.creditLimit) * 100) : 0;

  const handleLogActivity = () => {
    if (!newActNote.trim()) return;
    setActivities((prev) => [
      {
        id: `act-${Date.now()}`,
        type: newActType,
        date: 'Just now',
        user: user?.name || 'Coordinator',
        notes: newActNote.trim(),
      },
      ...prev,
    ]);
    setNewActNote('');
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header (§8) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-black text-white">{customer.name}</h1>
            <StatusPill tone="success" label="Active" />
            <Badge tone={customer.creditHold ? 'danger' : 'success'}>
              {customer.creditHold ? 'Credit Hold' : 'Credit OK'}
            </Badge>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            📞 {customer.phone} · 💬 WhatsApp · GSTIN <span className="font-mono">{customer.gstin}</span> · {customer.site} · Window {customer.window}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link href="/sales/orders/new">
            <Button variant="primary" size="sm">+ New order</Button>
          </Link>
          <Button variant="secondary" size="sm" onClick={() => setActiveTab('payments')}>
            Record payment
          </Button>
        </div>
      </div>

      {/* 5 KPIs (§8) */}
      <div className={`grid grid-cols-2 ${isOwner ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-4`}>
        <KpiCard title="Outstanding" value={formatINR(customer.outstanding)} subtitle="Current AR balance" tone="default" />
        <KpiCard title="Overdue" value={customer.overdueDays > 0 ? `${customer.overdueDays} days` : '₹0'} subtitle="Past credit terms" tone={customer.overdueDays > 0 ? 'danger' : 'success'} />
        <KpiCard title="Credit Used" value={`${creditUsedPct}%`} subtitle={`of ${formatINR(customer.creditLimit)}`} tone={creditUsedPct > 85 ? 'warning' : 'default'} />
        <KpiCard
          title="Sales (30 d)"
          value={formatINR(customerOrders.reduce((s, o) => s + Number(o.total_amount ?? o.totalAmount ?? 0), 0))}
          subtitle={`${customerOrders.length} orders in system`}
          tone="success"
        />
        {isOwner && (
          <KpiCard
            title="Avg Margin (Owner)"
            value={
              customerOrders.length > 0 && customerOrders.some((o) => o.margin_pct != null)
                ? `${(
                    customerOrders.reduce((s, o) => s + Number(o.margin_pct ?? 0), 0) /
                    customerOrders.length
                  ).toFixed(1)}%`
                : '0.0%'
            }
            subtitle="Net customer profitability"
            tone="brand"
          />
        )}
      </div>

      {/* 10 Tabs (§8) */}
      <div className="flex border-b border-zinc-800 text-xs font-semibold gap-5 overflow-x-auto pb-0.5">
        {[
          { key: 'overview', label: 'Overview' },
          { key: 'orders', label: `Orders (${customerOrders.length})` },
          { key: 'invoices', label: 'Invoices' },
          { key: 'statement', label: 'Statement' },
          { key: 'payments', label: 'Payments' },
          { key: 'promises', label: `Promises (${promises.length})` },
          { key: 'prices', label: 'Price History' },
          { key: 'contacts', label: `Contacts (${contacts.length})` },
          { key: 'activity', label: `Activity (${activities.length})` },
          { key: 'documents', label: 'Documents' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key as any)}
            className={`pb-2.5 border-b-2 whitespace-nowrap transition-colors ${
              activeTab === t.key ? 'border-teal-500 text-teal-400' : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <Card className="lg:col-span-7 p-5 space-y-4">
            <h3 className="text-sm font-bold text-white">12-Month Sales Trend</h3>
            <div className="flex items-end gap-2 h-32 pt-4">
              {[28, 32, 35, 30, 38, 42, 40, 44, 46, 41, 48, 52].map((val, idx) => (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full bg-teal-500/70 hover:bg-teal-400 rounded-t-md transition-all"
                    style={{ height: `${(val / 55) * 100}%` }}
                    title={`Month ${idx + 1}: ₹${val}k`}
                  />
                  <span className="text-[10px] text-zinc-500">{idx + 1}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="lg:col-span-5 p-5 space-y-4">
            <h3 className="text-sm font-bold text-white">Receivables Aging</h3>
            <AgingBuckets
              buckets={[
                { label: 'Current (0–7d)', amount: `₹${Number(customer?.outstanding ?? 0).toLocaleString('en-IN')}`, count: 0, tone: 'info' },
                { label: '8–15 days', amount: '₹0', count: 0, tone: 'warning' },
                { label: '16–30 days', amount: '₹0', count: 0, tone: 'warning' },
                { label: '30+ days', amount: `₹${Number((customer as any)?.overdue ?? 0).toLocaleString('en-IN')}`, count: 0, tone: 'danger' },
              ]}
            />
          </Card>
        </div>
      )}

      {/* Tab 2: Orders */}
      {activeTab === 'orders' && (
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-950 border-b border-zinc-800 text-zinc-400 uppercase font-semibold">
              <tr>
                <th className="p-3">Order No</th>
                <th className="p-3">Delivery Date</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {customerOrders.map((o) => (
                <tr key={o.id}>
                  <td className="p-3">
                    <Link href={`/sales/orders/${o.id}`} className="font-mono font-bold text-teal-400 hover:underline">
                      {o.orderNumber}
                    </Link>
                  </td>
                  <td className="p-3 text-zinc-300">{o.deliveryDate}</td>
                  <td className="p-3"><Badge tone="info">{o.status}</Badge></td>
                  <td className="p-3 text-right font-mono font-bold text-white">{formatINR(o.grandTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Tab 3: Invoices */}
      {activeTab === 'invoices' && (
        <Card className="p-5 text-xs space-y-2">
          {customerInvoices.length === 0 ? (
            <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-500">
              No invoices found for this customer in database.
            </div>
          ) : (
            customerInvoices.map((inv: any) => (
              <div key={inv.id} className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl flex justify-between items-center">
                <div>
                  <span className="font-mono font-bold text-teal-400">{inv.invoice_number || inv.invoiceNumber || inv.id}</span>
                  <span className="text-zinc-400 ml-3">{inv.invoice_date || inv.created_at || ''}</span>
                </div>
                <span className="font-mono font-bold text-white">{formatINR(Number(inv.total_amount ?? inv.totalAmount ?? 0))}</span>
              </div>
            ))
          )}
        </Card>
      )}

      {/* Tab 4: Statement (Running Ledger Balance, AC-7) */}
      {activeTab === 'statement' && (
        <Card className="p-0 overflow-hidden">
          <div className="p-4 border-b border-zinc-800 flex justify-between items-center text-xs">
            <span className="font-bold text-white">Customer Account Statement (Ledger)</span>
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              🖨️ Print / Share PDF Statement
            </Button>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-950 border-b border-zinc-800 text-zinc-400 uppercase font-semibold">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Reference</th>
                <th className="p-3">Description</th>
                <th className="p-3 text-right">Debit (₹)</th>
                <th className="p-3 text-right">Credit (₹)</th>
                <th className="p-3 text-right">Running Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {ledgerWithBalance.map((row) => (
                <tr key={row.id}>
                  <td className="p-3 text-zinc-300">{row.date}</td>
                  <td className="p-3 font-mono text-teal-400">{row.reference}</td>
                  <td className="p-3 text-zinc-200">{row.description}</td>
                  <td className="p-3 text-right font-mono text-zinc-200">{row.debit > 0 ? formatINR(row.debit) : '—'}</td>
                  <td className="p-3 text-right font-mono text-emerald-400">{row.credit > 0 ? formatINR(row.credit) : '—'}</td>
                  <td className="p-3 text-right font-mono font-bold text-white">{formatINR(row.runningBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Tab 5: Payments */}
      {activeTab === 'payments' && (
        <Card className="p-5 text-xs space-y-3">
          {customerPayments.length === 0 ? (
            <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-500">
              No payments recorded for this customer in database.
            </div>
          ) : (
            customerPayments.map((p: any) => (
              <div key={p.id} className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl flex justify-between">
                <div>
                  <strong className="text-white font-mono">{p.receipt_number || p.id}</strong>
                  <span className="text-zinc-400 ml-2">{p.collected_at || p.created_at || ''} · {p.payment_mode || 'CASH'}</span>
                </div>
                <span className="font-mono font-bold text-emerald-400">{formatINR(Number(p.amount ?? 0))}</span>
              </div>
            ))
          )}
        </Card>
      )}

      {/* Tab 6: Promises (PTP) */}
      {activeTab === 'promises' && (
        <Card className="p-5 text-xs space-y-3">
          {promises.map((p) => (
            <div key={p.id} className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl flex justify-between items-center">
              <div>
                <strong className="text-white">Promised {formatINR(p.amount)}</strong>
                <span className="text-zinc-400 ml-2">Due {p.dueDate}</span>
                <div className="text-[11px] text-zinc-500 mt-0.5">{p.note}</div>
              </div>
              <Badge tone="warning">{p.status}</Badge>
            </div>
          ))}
        </Card>
      )}

      {/* Tab 7: Price History */}
      {activeTab === 'prices' && (
        <Card className="p-5 text-xs space-y-3">
          <h4 className="font-bold text-white">Recent Item-wise Price Memory</h4>
          {dailyPrices.slice(0, 5).map((item) => (
            <div key={item.itemId} className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2">
              <div className="font-bold text-teal-400">{item.itemName}</div>
              <div className="flex gap-3 flex-wrap">
                <span className="px-2 py-1 bg-zinc-900 rounded-lg border border-zinc-800 font-mono">
                  Floor: <strong>₹{item.floorPrice ?? '—'}</strong> · Target: <strong>₹{item.targetPrice ?? '—'}</strong>
                </span>
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Tab 8: Contacts */}
      {activeTab === 'contacts' && (
        <Card className="p-5 text-xs space-y-2">
          {contacts.map((c) => (
            <div key={c.id} className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl flex justify-between">
              <div>
                <strong className="text-white">{c.name}</strong> <span className="text-zinc-500">({c.role})</span>
                {c.isPrimary && <Badge tone="brand">Primary</Badge>}
              </div>
              <span className="font-mono text-teal-400">📞 {c.phone}</span>
            </div>
          ))}
        </Card>
      )}

      {/* Tab 9: Activity Logging (F4-08) */}
      {activeTab === 'activity' && (
        <div className="space-y-4">
          <Card className="p-4 space-y-3 text-xs">
            <h4 className="font-bold text-white">Log Customer Activity</h4>
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={newActType}
                onChange={(e) => setNewActType(e.target.value as any)}
                className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white"
              >
                <option value="CALL">📞 Phone Call</option>
                <option value="VISIT">🏪 Field Visit</option>
                <option value="WHATSAPP">💬 WhatsApp</option>
                <option value="NOTE">📝 Internal Note</option>
              </select>
              <input
                type="text"
                value={newActNote}
                onChange={(e) => setNewActNote(e.target.value)}
                placeholder="Summary of call, visit, or payment follow-up..."
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white"
              />
              <Button variant="primary" size="sm" onClick={handleLogActivity}>
                Log Activity
              </Button>
            </div>
          </Card>

          <Card className="p-4 space-y-3 text-xs">
            {activities.map((a) => (
              <div key={a.id} className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl">
                <div className="flex justify-between items-center">
                  <Badge tone="neutral">{a.type}</Badge>
                  <span className="text-zinc-500">{a.date} · {a.user}</span>
                </div>
                <p className="text-zinc-200 mt-1.5">{a.notes}</p>
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* Tab 10: Documents */}
      {activeTab === 'documents' && (
        <Card className="p-6 text-center text-xs text-zinc-400">
          📄 KYC &amp; Trade Agreements (FSSAI Certificate, Signed Credit Agreement) — document vault connected via G-FILE-1.
        </Card>
      )}
    </div>
  );
}

