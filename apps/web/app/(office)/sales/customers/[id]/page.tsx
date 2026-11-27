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
import { FileVault } from '../../../../../src/components/FileVault';

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
  const [newActType, setNewActType] = useState<'CALL' | 'VISIT' | 'WHATSAPP'>('CALL');
  const [newActNote, setNewActNote] = useState('');
  const [tabMsg, setTabMsg] = useState<{ text: string; isError?: boolean } | null>(null);

  // Promises / Followups (PTP) state
  const [promises, setPromises] = useState<Array<{ id: string; amount: number; dueDate: string; status: string; note: string; source?: 'PTP' | 'FOLLOWUP' }>>([]);
  const [followupDate, setFollowupDate] = useState(new Date().toISOString().split('T')[0]);
  const [followupNote, setFollowupNote] = useState('');

  // Contacts state
  const [contacts, setContacts] = useState<Array<{ id: string; name: string; role: string; phone: string; isPrimary: boolean }>>([]);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactRole, setNewContactRole] = useState<'ACCOUNT_MANAGER' | 'TAX_OFFICER' | 'PURCHASING' | 'PROCUREMENT' | 'FINANCE' | 'OTHER'>('ACCOUNT_MANAGER');

  // Price memory & AR aging
  const [agingData, setAgingData] = useState<{ b0: number; b8: number; b16: number; b30: number }>({
    b0: 0,
    b8: 0,
    b16: 0,
    b30: 0,
  });
  const [selectedPriceItemId, setSelectedPriceItemId] = useState('');
  const [priceMemoryRows, setPriceMemoryRows] = useState<any[]>([]);

  const loadCustomer360 = React.useCallback(async (isMounted: () => boolean) => {
    try {
      const [
        custData,
        ordData,
        priceData,
        ptpData,
        invData,
        payData,
        ledgerData,
        contactsData,
        commData,
        followupsData,
        agingRes,
      ] = await Promise.all([
        fetch(`/api/proxy/customers/${encodeURIComponent(id)}`).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/proxy/orders?customerId=${encodeURIComponent(id)}`).then((r) => (r.ok ? r.json() : [])),
        fetch('/api/proxy/prices/today').then((r) => (r.ok ? r.json() : [])),
        fetch('/api/proxy/ptp').then((r) => (r.ok ? r.json() : [])),
        fetch('/api/proxy/invoices').then((r) => (r.ok ? r.json() : [])),
        fetch('/api/proxy/collections').then((r) => (r.ok ? r.json() : [])),
        fetch(`/api/proxy/customers/${encodeURIComponent(id)}/ledger`).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/proxy/customers/${encodeURIComponent(id)}/contacts`).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/proxy/customers/${encodeURIComponent(id)}/communication`).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/proxy/customers/${encodeURIComponent(id)}/followups`).then((r) => (r.ok ? r.json() : null)),
        fetch('/api/proxy/analytics/ar/aging').then((r) => (r.ok ? r.json() : null)),
      ]);
      if (!isMounted()) return;

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
          site: String(custData.default_site_name || 'Not assigned'),
          window: String(custData.preferred_delivery_window || '10-12'),
          creditLimit: Number(custData.credit_limit ?? 0),
          outstanding: Number(custData.current_ar_balance ?? 0),
          overdueDays: Number(custData.overdue_days ?? 0),
          creditHold: Boolean(custData.credit_hold),
        });
      }

      const rawContacts = Array.isArray(contactsData)
        ? contactsData
        : Array.isArray(contactsData?.data)
          ? contactsData.data
          : [];
      if (rawContacts.length > 0) {
        setContacts(
          rawContacts.map((c: any) => ({
            id: String(c.id),
            name: String(c.name || 'Contact'),
            role: String(c.role || 'OTHER'),
            phone: String(c.phone || ''),
            isPrimary: Boolean(c.is_primary ?? c.isPrimary),
          })),
        );
      } else if (custData?.id) {
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

      const ordList = Array.isArray(ordData) ? ordData : Array.isArray(ordData?.data) ? ordData.data : [];
      setCustomerOrders(
        ordList.map((o: any) => ({
          id: String(o.id),
          orderNumber: String(o.order_no || o.orderNumber || o.id),
          deliveryDate: String(o.delivery_date || o.created_at_idx || '').slice(0, 10),
          status: String(o.order_status || o.status || 'DRAFT'),
          grandTotal: Number(o.grand_total ?? o.total_amount ?? o.grandTotal ?? 0),
          margin_pct: o.margin_pct,
        })),
      );

      const rawLedger = Array.isArray(ledgerData?.entries)
        ? ledgerData.entries
        : Array.isArray(ledgerData?.data)
          ? ledgerData.data
          : Array.isArray(ledgerData)
            ? ledgerData
            : [];
      if (rawLedger.length > 0) {
        setLedgerEntries(
          rawLedger.map((l: any, idx: number) => ({
            id: String(l.id || `led-${idx}`),
            date: String(l.entry_date || l.date || l.created_at || '').slice(0, 10),
            type: (String(l.entry_type || l.type || 'INVOICE').toUpperCase().includes('PAY') || Number(l.credit ?? 0) > 0
              ? 'PAYMENT'
              : 'INVOICE') as 'INVOICE' | 'PAYMENT',
            reference: String(l.reference_no || l.reference || l.entry_type || 'TXN'),
            description: String(l.description || l.narration || `${l.entry_type || 'Ledger'} ${l.reference_no || ''}`),
            debit: Number(l.debit_amount ?? l.debit ?? 0),
            credit: Number(l.credit_amount ?? l.credit ?? 0),
          })),
        );
      } else {
        setLedgerEntries(
          ordList.slice(0, 15).map((o: any) => ({
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

      const rawPrices = Array.isArray(priceData) ? priceData : [];
      setDailyPrices(rawPrices);
      if (rawPrices.length > 0) {
        setSelectedPriceItemId((prev) => prev || String(rawPrices[0].itemId || ''));
      }

      const ptpList = Array.isArray(ptpData) ? ptpData : Array.isArray(ptpData?.data) ? ptpData.data : [];
      const folList = Array.isArray(followupsData?.data) ? followupsData.data : Array.isArray(followupsData) ? followupsData : [];
      setPromises([
        ...ptpList
          .filter((p: any) => !p.customerId && !p.customer_id ? true : String(p.customerId ?? p.customer_id) === id)
          .map((p: any) => ({
            id: String(p.id),
            amount: Number(p.amount ?? p.promisedAmount ?? 0),
            dueDate: String(p.dueDate || p.promisedDate || p.promised_date || '').slice(0, 10),
            status: String(p.status || 'OPEN'),
            note: String(p.note || p.remarks || ''),
            source: 'PTP' as const,
          })),
        ...folList.map((f: any) => ({
          id: String(f.id),
          amount: 0,
          dueDate: String(f.promised_date || f.dueDate || '').slice(0, 10),
          status: String(f.status || 'OPEN'),
          note: String(f.note || f.reason_code || ''),
          source: 'FOLLOWUP' as const,
        })),
      ]);

      const rawComm = Array.isArray(commData) ? commData : Array.isArray(commData?.data) ? commData.data : [];
      setActivities(
        rawComm.map((a: any) => ({
          id: String(a.id),
          type: String(a.channel || a.type || 'CALL'),
          date: String(a.logged_at || a.created_at || '').slice(0, 16).replace('T', ' '),
          user: String(a.logged_by_name || a.user || 'Staff'),
          notes: String(a.note || a.notes || ''),
        })),
      );

      const agingRows = Array.isArray(agingRes)
        ? agingRes
        : Array.isArray(agingRes?.customers)
          ? agingRes.customers
          : Array.isArray(agingRes?.data)
            ? agingRes.data
            : [];
      const custAging = agingRows.find((r: any) => String(r.customer_id ?? r.customerId ?? r.id) === id);
      if (custAging) {
        setAgingData({
          b0: Number(custAging.bucket_0_7 ?? custAging.current_0_7 ?? 0),
          b8: Number(custAging.bucket_8_15 ?? custAging.days_8_15 ?? 0),
          b16: Number(custAging.bucket_16_30 ?? custAging.days_16_30 ?? 0),
          b30: Number(custAging.bucket_30_plus ?? custAging.days_30_plus ?? 0),
        });
      }
    } catch {
      /* ignore */
    }
  }, [id]);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (active && data?.user) setUser(data.user);
      })
      .catch(() => {});

    void loadCustomer360(() => active);
    return () => {
      active = false;
    };
  }, [loadCustomer360]);

  useEffect(() => {
    if (!selectedPriceItemId || !id) return;
    let active = true;
    fetch(
      `/api/proxy/customers/${encodeURIComponent(id)}/price-memory?item_id=${encodeURIComponent(selectedPriceItemId)}&limit=5`,
    )
      .then((r) => (r.ok ? r.json() : []))
      .then((res) => {
        if (!active) return;
        const list = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
        setPriceMemoryRows(list);
      })
      .catch(() => {
        if (active) setPriceMemoryRows([]);
      });
    return () => {
      active = false;
    };
  }, [id, selectedPriceItemId]);

  const isOwner = !user || canViewMarginAndCost(user.role);
  const ledgerWithBalance = computeRunningLedgerBalance(ledgerEntries);
  const creditUsedPct = customer.creditLimit > 0 ? Math.round((customer.outstanding / customer.creditLimit) * 100) : 0;

  // Real 12-month sales buckets computed from customerOrders
  const monthlySeries = React.useMemo(() => {
    const now = new Date();
    const buckets: Array<{ label: string; key: string; value: number }> = [];
    for (let offset = 11; offset >= 0; offset--) {
      const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-IN', { month: 'short' });
      buckets.push({ label, key, value: 0 });
    }
    const map = new Map(buckets.map((b) => [b.key, b]));
    for (const o of customerOrders) {
      const mk = String(o.deliveryDate || '').slice(0, 7);
      const bucket = map.get(mk);
      if (bucket) bucket.value += Number(o.grandTotal ?? 0);
    }
    return buckets;
  }, [customerOrders]);
  const maxMonthlySale = Math.max(1, ...monthlySeries.map((b) => b.value));

  const salesLast30Days = React.useMemo(() => {
    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    return customerOrders
      .filter((o) => !o.deliveryDate || o.deliveryDate >= cutoff)
      .reduce((sum, o) => sum + Number(o.grandTotal ?? 0), 0);
  }, [customerOrders]);

  const handleLogActivity = async () => {
    if (!newActNote.trim()) return;
    setTabMsg(null);
    try {
      const res = await fetch(`/api/proxy/customers/${encodeURIComponent(id)}/communication`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: newActType,
          note: newActNote.trim(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || data?.error?.message || `HTTP ${res.status}`);
      }
      setNewActNote('');
      setTabMsg({ text: 'Communication activity saved.' });
      await loadCustomer360(() => true);
    } catch (err) {
      setTabMsg({ text: `Failed to log activity: ${(err as Error).message}`, isError: true });
    }
  };

  const handleAddContact = async () => {
    if (!newContactName.trim() || !newContactPhone.trim()) return;
    setTabMsg(null);
    try {
      const res = await fetch(`/api/proxy/customers/${encodeURIComponent(id)}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newContactName.trim(),
          phone: newContactPhone.trim(),
          role: newContactRole,
          isPrimary: contacts.length === 0,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || data?.error?.message || `HTTP ${res.status}`);
      }
      setNewContactName('');
      setNewContactPhone('');
      setTabMsg({ text: 'Contact added.' });
      await loadCustomer360(() => true);
    } catch (err) {
      setTabMsg({ text: `Failed to add contact: ${(err as Error).message}`, isError: true });
    }
  };

  const handleScheduleFollowup = async () => {
    if (!followupNote.trim()) return;
    setTabMsg(null);
    try {
      const res = await fetch(`/api/proxy/customers/${encodeURIComponent(id)}/followups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dueDate: followupDate,
          note: followupNote.trim(),
          reasonCode: 'FOLLOWUP',
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || data?.error?.message || `HTTP ${res.status}`);
      }
      setFollowupNote('');
      setTabMsg({ text: 'Follow-up reminder scheduled.' });
      await loadCustomer360(() => true);
    } catch (err) {
      setTabMsg({ text: `Failed to schedule follow-up: ${(err as Error).message}`, isError: true });
    }
  };

  const handleMarkFollowupDone = async (followupId: string) => {
    setTabMsg(null);
    try {
      const res = await fetch(
        `/api/proxy/customers/${encodeURIComponent(id)}/followups/${encodeURIComponent(followupId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'DONE' }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || `HTTP ${res.status}`);
      }
      setTabMsg({ text: 'Follow-up marked DONE.' });
      await loadCustomer360(() => true);
    } catch (err) {
      setTabMsg({ text: `Update failed: ${(err as Error).message}`, isError: true });
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header (§8) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-rule pb-5">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold text-ink">{customer.name}</h1>
            <StatusPill tone="success" label="Active" />
            <Badge tone={customer.creditHold ? 'danger' : 'success'}>
              {customer.creditHold ? 'Credit Hold' : 'Credit OK'}
            </Badge>
          </div>
          <p className="text-xs text-ink-3 mt-1">
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
      <div className={`grid grid-cols-2 ${isOwner ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}gap-4`}>
        <KpiCard title="Outstanding" value={formatINR(customer.outstanding)} subtitle="Current AR balance" tone="default" />
        <KpiCard title="Overdue" value={customer.overdueDays > 0 ? `${customer.overdueDays} days` : '₹0'} subtitle="Past credit terms" tone={customer.overdueDays > 0 ? 'danger' : 'success'} />
        <KpiCard title="Credit Used" value={`${creditUsedPct}%`} subtitle={`of ${formatINR(customer.creditLimit)}`} tone={creditUsedPct > 85 ? 'warning' : 'default'} />
        <KpiCard
          title="Sales (30 d)"
          value={formatINR(salesLast30Days)}
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
      <div className="flex border-b border-rule text-xs font-semibold gap-5 overflow-x-auto pb-0.5">
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
              activeTab === t.key ? 'border-action/30 text-action' : 'border-transparent text-ink-3 hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Overview */}
      {tabMsg && (
        <div
          className={`rounded-[3px] border p-3 text-xs font-medium ${
            tabMsg.isError
              ? 'border-madder/30 bg-madder-soft text-madder'
              : 'border-leaf/30 bg-leaf-soft text-leaf'
          }`}
        >
          {tabMsg.text}
        </div>
      )}
      {activeTab === 'overview'&& (
 <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
 <Card className="lg:col-span-7 p-5 space-y-4">
 <h3 className="text-sm font-bold text-ink">12-Month Sales Trend</h3>
 <div className="flex items-end gap-2 h-32 pt-4">
 {monthlySeries.map((pt) => (
 <div key={pt.key} className="flex-1 flex flex-col items-center gap-1">
 <div
 className="w-full bg-action/70 hover:bg-teal-400 rounded-t-md transition-all"
 style={{ height: `${Math.max(4, Math.round((pt.value / maxMonthlySale) * 100))}%` }}
 title={`${pt.label}: ${formatINR(pt.value)}`}
 />
 <span className="text-[10px] text-ink-3">{pt.label}</span>
 </div>
 ))}
 </div>
 </Card>

 <Card className="lg:col-span-5 p-5 space-y-4">
 <h3 className="text-sm font-bold text-ink">Receivables Aging</h3>
 <AgingBuckets
 buckets={[
 { label:'Current (0–7d)', amount: formatINR(agingData.b0 || (agingData.b8 + agingData.b16 + agingData.b30 === 0 ? customer.outstanding : 0)), count: 0, tone: 'info' },
                { label: '8–15 days', amount: formatINR(agingData.b8), count: 0, tone: 'warning' },
                { label: '16–30 days', amount: formatINR(agingData.b16), count: 0, tone: 'warning' },
                { label: '30+ days', amount: formatINR(agingData.b30), count: 0, tone: 'danger' },
              ]}
            />
          </Card>
        </div>
      )}

      {/* Tab 2: Orders */}
      {activeTab === 'orders' && (
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-paper border-b border-rule text-ink-3 uppercase font-semibold">
              <tr>
                <th className="p-3">Order No</th>
                <th className="p-3">Delivery Date</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {customerOrders.map((o) => (
                <tr key={o.id}>
                  <td className="p-3">
                    <Link href={`/sales/orders/${o.id}`} className="font-mono font-bold text-action hover:underline">
                      {o.orderNumber}
                    </Link>
                  </td>
                  <td className="p-3 text-ink-2">{o.deliveryDate}</td>
                  <td className="p-3"><Badge tone="info">{o.status}</Badge></td>
                  <td className="p-3 text-right font-mono font-bold text-ink">{formatINR(o.grandTotal)}</td>
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
            <div className="p-3 bg-paper border border-rule rounded-[3px] text-ink-3">
              No invoices found for this customer in database.
            </div>
          ) : (
            customerInvoices.map((inv: any) => (
              <div key={inv.id} className="p-3 bg-paper border border-rule rounded-[3px] flex justify-between items-center">
                <div>
                  <span className="font-mono font-bold text-action">{inv.invoice_number || inv.invoiceNumber || inv.id}</span>
                  <span className="text-ink-3 ml-3">{inv.invoice_date || inv.created_at || ''}</span>
                </div>
                <span className="font-mono font-bold text-ink">{formatINR(Number(inv.total_amount ?? inv.totalAmount ?? 0))}</span>
              </div>
            ))
          )}
        </Card>
      )}

      {/* Tab 4: Statement (Running Ledger Balance, AC-7) */}
      {activeTab === 'statement' && (
        <Card className="p-0 overflow-hidden">
          <div className="p-4 border-b border-rule flex flex-wrap justify-between items-center gap-2 text-xs">
            <span className="font-bold text-ink">Customer Account Statement (Ledger)</span>
            <div className="flex items-center gap-2">
              <a
                href={`/api/proxy/customers/${encodeURIComponent(id)}/statement/pdf`}
                target="_blank"
                rel="noreferrer"
              >
                <Button variant="secondary" size="sm" type="button">
                  📄 Statement PDF ↗
                </Button>
              </a>
              <Button variant="ghost" size="sm" onClick={() => window.print()}>
                🖨️ Print
              </Button>
            </div>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-paper border-b border-rule text-ink-3 uppercase font-semibold">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Reference</th>
                <th className="p-3">Description</th>
                <th className="p-3 text-right">Debit (₹)</th>
                <th className="p-3 text-right">Credit (₹)</th>
                <th className="p-3 text-right">Running Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {ledgerWithBalance.map((row) => (
                <tr key={row.id}>
                  <td className="p-3 text-ink-2">{row.date}</td>
                  <td className="p-3 font-mono text-action">{row.reference}</td>
                  <td className="p-3 text-ink">{row.description}</td>
                  <td className="p-3 text-right font-mono text-ink">{row.debit > 0 ? formatINR(row.debit) : '—'}</td>
                  <td className="p-3 text-right font-mono text-leaf">{row.credit > 0 ? formatINR(row.credit) : '—'}</td>
                  <td className="p-3 text-right font-mono font-bold text-ink">{formatINR(row.runningBalance)}</td>
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
            <div className="p-3 bg-paper border border-rule rounded-[3px] text-ink-3">
              No payments recorded for this customer in database.
            </div>
          ) : (
            customerPayments.map((p: any) => (
              <div key={p.id} className="p-3 bg-paper border border-rule rounded-[3px] flex justify-between">
                <div>
                  <strong className="text-ink font-mono">{p.receipt_number || p.id}</strong>
                  <span className="text-ink-3 ml-2">{p.collected_at || p.created_at || ''} · {p.payment_mode || 'CASH'}</span>
                </div>
                <span className="font-mono font-bold text-leaf">{formatINR(Number(p.amount ?? 0))}</span>
              </div>
            ))
          )}
        </Card>
      )}

      {/* Tab 6: Promises (PTP) */}
      {activeTab === 'promises' && (
        <div className="space-y-4">
          <Card className="p-4 space-y-3 text-xs">
            <h4 className="font-bold text-ink">Schedule Follow-up Reminder</h4>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="date"
                value={followupDate}
                onChange={(e) => setFollowupDate(e.target.value)}
                className="bg-paper border border-rule rounded-[3px] px-3 py-2 text-ink"
              />
              <input
                type="text"
                value={followupNote}
                onChange={(e) => setFollowupNote(e.target.value)}
                placeholder="Reminder note (e.g. Call regarding overdue bill)..."
                className="flex-1 bg-paper border border-rule rounded-[3px] px-3 py-2 text-ink"
              />
              <Button variant="primary" size="sm" onClick={handleScheduleFollowup}>
                + Schedule Follow-up
              </Button>
            </div>
          </Card>

          <Card className="p-5 text-xs space-y-3">
            {promises.length === 0 ? (
              <div className="text-ink-3">No promises or follow-up reminders logged.</div>
            ) : (
              promises.map((p) => (
                <div key={p.id} className="p-3 bg-paper border border-rule rounded-[3px] flex justify-between items-center gap-3">
                  <div>
                    <strong className="text-ink">
                      {p.amount > 0 ? `Promised ${formatINR(p.amount)}` : 'Follow-up Reminder'}
                    </strong>
                    <span className="text-ink-3 ml-2">Due {p.dueDate}</span>
                    <div className="text-[11px] text-ink-3 mt-0.5">{p.note}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={p.status === 'DONE' || p.status === 'KEPT' ? 'success' : 'warning'}>
                      {p.status}
                    </Badge>
                    {p.source === 'FOLLOWUP' && p.status !== 'DONE' && (
                      <Button variant="secondary" size="sm" onClick={() => handleMarkFollowupDone(p.id)}>
                        Mark Done
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </Card>
        </div>
      )}

      {/* Tab 7: Price History */}
      {activeTab === 'prices' && (
        <div className="space-y-4">
          <Card className="p-5 text-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-bold text-ink">Customer Price Memory (Last 5 Orders)</h4>
              <select
                value={selectedPriceItemId}
                onChange={(e) => setSelectedPriceItemId(e.target.value)}
                className="bg-paper border border-rule rounded-[3px] px-3 py-1.5 text-ink"
              >
                {dailyPrices.map((p) => (
                  <option key={p.itemId} value={p.itemId}>
                    {p.itemName} (Floor ₹{p.floorPrice ?? '—'} · Target ₹{p.targetPrice ?? '—'})
                  </option>
                ))}
              </select>
            </div>
            {priceMemoryRows.length === 0 ? (
              <div className="p-3 bg-paper border border-rule rounded-[3px] text-ink-3">
                No prior invoiced/ordered price history found for the selected item.
              </div>
            ) : (
              <div className="space-y-2">
                {priceMemoryRows.map((pm: any, idx: number) => (
                  <div key={idx} className="p-3 bg-paper border border-rule rounded-[3px] flex justify-between items-center">
                    <div>
                      <span className="font-mono font-bold text-action">{pm.order_no || pm.orderNo || 'Order'}</span>
                      <span className="text-ink-3 ml-2">{String(pm.order_date || pm.created_at || '').slice(0, 10)}</span>
                    </div>
                    <span className="font-mono font-bold text-ink">
                      ₹{Number(pm.unit_price ?? pm.unitPrice ?? 0).toFixed(2)} ({pm.qty ?? 0} {pm.uom ?? ''})
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Tab 8: Contacts */}
      {activeTab === 'contacts' && (
        <div className="space-y-4">
          <Card className="p-4 space-y-3 text-xs">
            <h4 className="font-bold text-ink">Add Customer Contact</h4>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <input
                type="text"
                value={newContactName}
                onChange={(e) => setNewContactName(e.target.value)}
                placeholder="Contact name"
                className="bg-paper border border-rule rounded-[3px] px-3 py-2 text-ink"
              />
              <input
                type="tel"
                value={newContactPhone}
                onChange={(e) => setNewContactPhone(e.target.value)}
                placeholder="Phone number"
                className="bg-paper border border-rule rounded-[3px] px-3 py-2 text-ink"
              />
              <select
                value={newContactRole}
                onChange={(e) => setNewContactRole(e.target.value as any)}
                className="bg-paper border border-rule rounded-[3px] px-3 py-2 text-ink"
              >
                <option value="ACCOUNT_MANAGER">Account Manager</option>
                <option value="PURCHASING">Purchasing</option>
                <option value="PROCUREMENT">Procurement</option>
                <option value="FINANCE">Finance</option>
                <option value="TAX_OFFICER">Tax Officer</option>
                <option value="OTHER">Other</option>
              </select>
              <Button variant="primary" size="sm" onClick={handleAddContact}>
                + Add Contact
              </Button>
            </div>
          </Card>

          <Card className="p-5 text-xs space-y-2">
            {contacts.map((c) => (
              <div key={c.id} className="p-3 bg-paper border border-rule rounded-[3px] flex justify-between">
                <div>
                  <strong className="text-ink">{c.name}</strong> <span className="text-ink-3">({c.role})</span>
                  {c.isPrimary && <Badge tone="brand">Primary</Badge>}
                </div>
                <span className="font-mono text-action">📞 {c.phone}</span>
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* Tab 9: Activity Logging (F4-08) */}
      {activeTab === 'activity' && (
        <div className="space-y-4">
          <Card className="p-4 space-y-3 text-xs">
            <h4 className="font-bold text-ink">Log Customer Activity</h4>
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={newActType}
                onChange={(e) => setNewActType(e.target.value as any)}
                className="bg-paper border border-rule rounded-[3px] px-3 py-2 text-ink"
              >
                <option value="CALL">📞 Phone Call</option>
                <option value="VISIT">🏪 Field Visit</option>
                <option value="WHATSAPP">💬 WhatsApp</option>
              </select>
              <input
                type="text"
                value={newActNote}
                onChange={(e) => setNewActNote(e.target.value)}
                placeholder="Summary of call, visit, or payment follow-up..."
                className="flex-1 bg-paper border border-rule rounded-[3px] px-3 py-2 text-ink"
              />
              <Button variant="primary" size="sm" onClick={handleLogActivity}>
                Log Activity
              </Button>
            </div>
          </Card>

          <Card className="p-4 space-y-3 text-xs">
            {activities.length === 0 ? (
              <div className="text-ink-3">No logged calls, visits, or messages yet.</div>
            ) : (
              activities.map((a) => (
                <div key={a.id} className="p-3 bg-paper border border-rule rounded-[3px]">
                  <div className="flex justify-between items-center">
                    <Badge tone="neutral">{a.type}</Badge>
                    <span className="text-ink-3">{a.date} · {a.user}</span>
                  </div>
                  <p className="text-ink mt-1.5">{a.notes}</p>
                </div>
              ))
            )}
          </Card>
        </div>
      )}

      {/* Tab 10: Documents */}
      {activeTab === 'documents' && (
        <FileVault entityType="CUSTOMER" entityId={id} title="Customer KYC & Trade Agreements" />
      )}
    </div>
  );
}

