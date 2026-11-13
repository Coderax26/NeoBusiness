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
import {
  INITIAL_CUSTOMERS_SUMMARY,
  INITIAL_SALES_ORDERS,
  INITIAL_DAILY_PRICES,
} from '../../../../../src/lib/sales-data';

const SAMPLE_LEDGER: LedgerEntryInput[] = [
  { id: 'leg-1', date: '2026-11-01', type: 'OPENING', reference: 'OB-NOV', description: 'Opening Balance', debit: 50000, credit: 0 },
  { id: 'leg-2', date: '2026-11-05', type: 'INVOICE', reference: 'INV-2026-0490', description: 'Fresh Malai Paneer & Curd', debit: 42000, credit: 0 },
  { id: 'leg-3', date: '2026-11-08', type: 'PAYMENT', reference: 'RCPT-881', description: 'NEFT Receipt', debit: 0, credit: 32000 },
  { id: 'leg-4', date: '2026-11-12', type: 'INVOICE', reference: 'INV-2026-0512', description: 'Desi Ghee 1L Tin', debit: 20000, credit: 0 },
];

export default function Customer360Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const customer =
    INITIAL_CUSTOMERS_SUMMARY.find((c) => c.id === id) || INITIAL_CUSTOMERS_SUMMARY[0];

  const [user, setUser] = useState<SessionUser | null>(null);
  const [activeTab, setActiveTab] = useState<
    'overview' | 'orders' | 'invoices' | 'statement' | 'payments' | 'promises' | 'prices' | 'contacts' | 'activity' | 'documents'
  >('overview');

  // Activity log state (§8, F4-08)
  const [activities, setActivities] = useState([
    { id: 'act-1', type: 'CALL', date: '2026-11-12 10:30 AM', user: 'Anita Desai', notes: 'Confirmed Diwali week paneer requirement (500 kg).' },
    { id: 'act-2', type: 'WHATSAPP', date: '2026-11-10 04:15 PM', user: 'System', notes: 'Sent Invoice INV-2026-0490 PDF on WhatsApp.' },
    { id: 'act-3', type: 'VISIT', date: '2026-11-05 11:00 AM', user: 'Ravi Kumar', notes: 'Site visit — discussed credit limit increase to ₹1L.' },
  ]);
  const [newActType, setNewActType] = useState<'CALL' | 'VISIT' | 'WHATSAPP' | 'NOTE'>('CALL');
  const [newActNote, setNewActNote] = useState('');

  // Promises (PTP) state
  const [promises, setPromises] = useState([
    { id: 'ptp-1', amount: 30000, dueDate: '2026-11-15', status: 'OPEN', note: 'Promised RTGS after weekend sales' },
  ]);

  // Contacts state
  const [contacts, setContacts] = useState([
    { id: 'c-1', name: 'Ramesh Sharma', role: 'Owner', phone: customer.phone, isPrimary: true },
    { id: 'c-2', name: 'Vijay Sharma', role: 'Store Manager', phone: '9822098765', isPrimary: false },
  ]);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => {});
  }, []);

  const isOwner = !user || canViewMarginAndCost(user.role);
  const ledgerWithBalance = computeRunningLedgerBalance(SAMPLE_LEDGER);
  const customerOrders = INITIAL_SALES_ORDERS.filter((o) => o.customerId === customer.id);
  const creditUsedPct = Math.round((customer.outstanding / customer.creditLimit) * 100);

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
        <KpiCard title="Sales (30 d)" value="₹4.2 L" subtitle="↑ 12% vs prev 30d" tone="success" />
        {isOwner && (
          <KpiCard title="Avg Margin (Owner)" value="9.4%" subtitle="Net customer profitability" tone="brand" />
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
                { label: 'Current (0–7d)', amount: '₹52,000', tone: 'success' },
                { label: '8–15 days', amount: '₹28,000', tone: 'warning' },
                { label: '16–30 days', amount: '₹0', tone: 'neutral' },
                { label: '30+ days', amount: '₹0', tone: 'danger' },
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
          <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl flex justify-between items-center">
            <div>
              <span className="font-mono font-bold text-teal-400">INV-2026-0512</span>
              <span className="text-zinc-400 ml-3">12 Nov 2026</span>
            </div>
            <span className="font-mono font-bold text-white">₹20,000.00</span>
          </div>
          <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl flex justify-between items-center">
            <div>
              <span className="font-mono font-bold text-teal-400">INV-2026-0490</span>
              <span className="text-zinc-400 ml-3">05 Nov 2026</span>
            </div>
            <span className="font-mono font-bold text-white">₹42,000.00</span>
          </div>
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
          <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl flex justify-between">
            <div>
              <strong className="text-white font-mono">RCPT-881</strong>
              <span className="text-zinc-400 ml-2">08 Nov 2026 · NEFT</span>
            </div>
            <span className="font-mono font-bold text-emerald-400">₹32,000.00</span>
          </div>
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
          {INITIAL_DAILY_PRICES.slice(0, 2).map((item) => (
            <div key={item.itemId} className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2">
              <div className="font-bold text-teal-400">{item.itemName}</div>
              <div className="flex gap-3 flex-wrap">
                {(item.lastPricesForCustomer || []).map((lp, idx) => (
                  <span key={idx} className="px-2 py-1 bg-zinc-900 rounded-lg border border-zinc-800 font-mono">
                    {lp.date}: <strong>₹{lp.price}</strong>
                  </span>
                ))}
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
