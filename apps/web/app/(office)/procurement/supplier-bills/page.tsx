'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { Button, Badge, StatusPill, Dialog, Card } from '@neo/ui';
import { formatINR, evaluateThreeWayMatch } from '@neo/shared';
import {
  type SupplierBillRecord,
  type SupplierBillStatus,
  type SupplierPaymentRecord,
  type PurchaseOrderRecord,
} from '../../../../src/lib/procurement-data';

const BILL_TABS: Array<{ key: SupplierBillStatus | 'ALL'; label: string }> = [
  { key: 'ALL', label: 'All Bills' },
  { key: 'RECEIVED', label: 'Received' },
  { key: 'VERIFIED', label: 'Verified' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'PAID', label: 'Paid' },
  { key: 'DISPUTED', label: 'Disputed' },
];

const THREE_WAY_CHIP_MAP: Record<
  string,
  { label: string; variant: 'success' | 'warning' | 'danger' }
> = {
  MATCHES: { label: 'Matches', variant: 'success' },
  MATCHED: { label: 'Matches', variant: 'success' },
  TIMING_DIFFERS: { label: 'Timing differs', variant: 'warning' },
  AMOUNT_DIFFERS: { label: 'Amount differs', variant: 'warning' },
  DOES_NOT_MATCH: { label: 'Does not match', variant: 'danger' },
};

function normalizeBillStatus(raw: unknown): SupplierBillStatus {
  const s = String(raw || 'RECEIVED').toUpperCase();
  if (s === 'DRAFT') return 'RECEIVED';
  if (s === 'PENDING_APPROVAL') return 'VERIFIED';
  if (s === 'REJECTED') return 'DISPUTED';
  return s as SupplierBillStatus;
}

export default function SupplierBillsPage() {
  const [bills, setBills] = useState<SupplierBillRecord[]>([]);
  const [payments, setPayments] = useState<SupplierPaymentRecord[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderRecord[]>([]);
  const [statusTab, setStatusTab] = useState<SupplierBillStatus | 'ALL'>('ALL');
  const [selectedBill, setSelectedBill] = useState<SupplierBillRecord | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [serverApAging, setServerApAging] = useState<{
    current: number;
    d31_60: number;
    d61_90: number;
    d90_plus: number;
  } | null>(null);

  // Enter Bill dialog
  const [enterOpen, setEnterOpen] = useState(false);
  const [newPoId, setNewPoId] = useState('');
  const [newBillNo, setNewBillNo] = useState('');
  const [newBillDate, setNewBillDate] = useState(new Date().toISOString().slice(0, 10));
  const [newBillQty, setNewBillQty] = useState(0);
  const [newBillRate, setNewBillRate] = useState(0);
  const [newScanName, setNewScanName] = useState('');

  const loadBillsData = async () => {
    try {
      const [billsRes, posRes, agingRes] = await Promise.all([
        fetch('/api/proxy/procurement/supplier-bills').then((r) => (r.ok ? r.json() : [])),
        fetch('/api/proxy/procurement/purchase-orders').then((r) => (r.ok ? r.json() : [])),
        fetch('/api/proxy/procurement/supplier-bills/ap/aging').then((r) =>
          r.ok ? r.json() : null,
        ),
      ]);
      const agingPayload = agingRes?.data ?? agingRes;
      if (agingPayload && (agingPayload.buckets || agingPayload.current != null || agingPayload.bucket_0_30 != null)) {
        const b = agingPayload.buckets ?? agingPayload;
        setServerApAging({
          current: Number(b.current ?? b.bucket_0_30 ?? b['0-30'] ?? 0),
          d31_60: Number(b.d31_60 ?? b.bucket_31_60 ?? b['31-60'] ?? 0),
          d61_90: Number(b.d61_90 ?? b.bucket_61_90 ?? b['61-90'] ?? 0),
          d90_plus: Number(b.d90_plus ?? b.bucket_90_plus ?? b['90+'] ?? 0),
        });
      }
      const bRows = Array.isArray(billsRes) ? billsRes : Array.isArray(billsRes?.data) ? billsRes.data : [];
      const pRows = Array.isArray(posRes) ? posRes : Array.isArray(posRes?.data) ? posRes.data : [];
      const poLookup = new Map(pRows.map((p: any) => [String(p.id), p]));

      const mappedBills: SupplierBillRecord[] = bRows.map((b: any) => {
        const linkedPo: any = poLookup.get(String(b.po_id || b.poId));
        const raw3Way = String(b.three_way_status || 'MATCHES').toUpperCase();
        const mappedStatus = normalizeBillStatus(b.status);
        const total = Number(b.totalAmount ?? b.total_amount ?? b.amount ?? 0);
        return {
          id: String(b.id),
          billNumber: String(b.billNumber || b.bill_number || b.bill_no || b.id),
          supplierId: String(b.supplierId || b.supplier_id || ''),
          supplierName: String(b.supplierName || b.supplier_name || linkedPo?.supplierName || linkedPo?.supplier_name || 'Supplier'),
          poId: String(b.poId || b.po_id || ''),
          poNumber: String(b.poNumber || b.po_no || linkedPo?.poNo || linkedPo?.po_no || ''),
          grnNumber: String(b.grnNumber || b.grn_id || 'GRN'),
          billDate: String(b.billDate || b.bill_date || '').slice(0, 10),
          dueDate: String(b.dueDate || b.due_date || '').slice(0, 10),
          status: mappedStatus,
          three_way_status: (raw3Way === 'MATCHED' ? 'MATCHES' : raw3Way) as any,
          totalAmount: total,
          paidAmount: mappedStatus === 'PAID' ? total : Number(b.paidAmount ?? b.paid_amount ?? 0),
          lines: Array.isArray(b.lines)
            ? b.lines
            : Array.isArray(b.items)
              ? b.items.map((it: any) => ({
                  itemId: String(it.item_id || it.itemId || ''),
                  itemName: String(it.item_name || it.itemName || 'Item'),
                  uom: 'kg',
                  poQty: Number(it.quantity ?? 0),
                  grnQty: Number(it.quantity ?? 0),
                  billQty: Number(it.quantity ?? 0),
                  poRate: Number(it.rate_per_unit ?? 0),
                  billRate: Number(it.rate_per_unit ?? 0),
                }))
              : [],
        };
      });
      setBills(mappedBills);
      if (mappedBills.length > 0 && !selectedBill) setSelectedBill(mappedBills[0]);

      const mappedPos = pRows.map((p: any) => ({
        id: String(p.id),
        poNumber: String(p.poNo || p.po_no || p.poNumber || p.id),
        supplierId: String(p.supplierId || p.supplier_id || ''),
        supplierName: String(p.supplierName || p.supplier_name || 'Supplier'),
        supplierPhone: '',
        receivingSiteId: String(p.receivingSiteId || p.receiving_site_id || ''),
        receivingSiteName: 'Main Site',
        status: p.poStatus || p.status || 'ISSUED',
        expectedDelivery: '',
        paymentTermsDays: 15,
        priceSpikeException: false,
        quantitiesConfirmed: true,
        createdAt: '',
        lines: Array.isArray(p.lines) ? p.lines : [],
      }));
      setPurchaseOrders(mappedPos as any);
      if (mappedPos.length > 0 && !newPoId) setNewPoId(String(mappedPos[0].id));
    } catch { /* ignore */ }
  };

  useEffect(() => {
    loadBillsData();
  }, []);

  // Reject dialog
  const [rejectTarget, setRejectTarget] = useState<SupplierBillRecord | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Record Payment dialog (G-AP-1)
  const [payTarget, setPayTarget] = useState<SupplierBillRecord | null>(null);
  const [payMode, setPayMode] = useState<'BANK' | 'CASH' | 'UPI'>('BANK');
  const [payRef, setPayRef] = useState('');
  const [payAmount, setPayAmount] = useState(0);

  // Ledger / Aging view toggle
  const [showLedger, setShowLedger] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const filteredBills = useMemo(() => {
    if (statusTab === 'ALL') return bills;
    return bills.filter((b) => b.status === statusTab);
  }, [bills, statusTab]);

  const threeWayEval = useMemo(
    () => (selectedBill ? evaluateThreeWayMatch(selectedBill.lines) : { lines: [], allMatched: false }),
    [selectedBill],
  );

  // AP Aging buckets (G-AP-2)
  const apAging = useMemo(() => {
    if (serverApAging) return serverApAging;
    const openBills = bills.filter((b) => b.status !== 'PAID');
    const now = Date.now();
    const buckets = { current: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
    for (const b of openBills) {
      const bal = b.totalAmount - b.paidAmount;
      const ageDays = Math.max(0, Math.floor((now - new Date(b.billDate).getTime()) / 86400000));
      if (ageDays <= 30) buckets.current += bal;
      else if (ageDays <= 60) buckets.d31_60 += bal;
      else if (ageDays <= 90) buckets.d61_90 += bal;
      else buckets.d90_plus += bal;
    }
    return buckets;
  }, [bills, serverApAging]);

  const handleEnterBill = async () => {
    const po = purchaseOrders.find((p) => p.id === newPoId) || purchaseOrders[0];
    if (!po) return;
    try {
      let firstLine: any = po.lines?.[0];
      if (!firstLine) {
        const lr = await fetch(`/api/proxy/procurement/purchase-orders/${encodeURIComponent(po.id)}/lines`);
        if (lr.ok) {
          const lrows = await lr.json();
          if (Array.isArray(lrows) && lrows[0]) firstLine = lrows[0];
        }
      }
      if (!firstLine) {
        throw new Error('Selected PO has no item lines.');
      }
      const res = await fetch('/api/proxy/procurement/supplier-bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: po.supplierId,
          poId: po.id,
          ...(po.receivingSiteId ? { siteId: po.receivingSiteId } : {}),
          billDate: newBillDate,
          items: [
            {
              itemId: String(firstLine.itemId || firstLine.item_id),
              itemName: String(firstLine.itemName || firstLine.item_name || 'Item'),
              quantity: String(newBillQty || firstLine.orderedQty || 1),
              ratePerUnit: String(newBillRate || firstLine.unitPrice || firstLine.unitRate || 0),
            },
          ],
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.message || payload?.error?.message || `HTTP ${res.status}`);
      }
      await loadBillsData();
      setEnterOpen(false);
      setNewBillNo('');
      showToast(`Recorded supplier bill ${(payload?.data || payload)?.bill_number ?? ''}.`);
    } catch (err) {
      showToast(`Failed to record bill: ${(err as Error).message}`);
    }
  };

  const handleStatusAction = async (bill: SupplierBillRecord, action: 'submit' | 'approve') => {
    try {
      const res = await fetch(`/api/proxy/procurement/supplier-bills/${encodeURIComponent(bill.id)}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'approve' ? { reason: 'APPROVED_BY_OWNER' } : {}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error?.message || `HTTP ${res.status}`);
      }
      await loadBillsData();
      showToast(`Bill ${bill.billNumber} ${action === 'submit' ? 'submitted' : 'approved'}.`);
    } catch (err) {
      showToast(`Failed to ${action} bill: ${(err as Error).message}`);
    }
  };

  const handleRejectBill = async () => {
    if (!rejectTarget || !rejectReason.trim()) return;
    try {
      const res = await fetch(`/api/proxy/procurement/supplier-bills/${encodeURIComponent(rejectTarget.id)}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error?.message || `HTTP ${res.status}`);
      }
      await loadBillsData();
      showToast(`Rejected / disputed ${rejectTarget.billNumber}.`);
      setRejectTarget(null);
      setRejectReason('');
    } catch (err) {
      showToast(`Failed to reject bill: ${(err as Error).message}`);
    }
  };

  const handleRecordPayment = async () => {
    if (!payTarget || payAmount <= 0 || !payRef.trim()) return;
    try {
      const res = await fetch(`/api/proxy/procurement/supplier-bills/${encodeURIComponent(payTarget.id)}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: payMode, paymentRef: payRef, paidAmount: payAmount }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error?.message || `HTTP ${res.status}`);
      }
      await loadBillsData();
      setPayments((prev) => [
        {
          id: `spay-${Date.now()}`,
          billId: payTarget.id,
          billNumber: payTarget.billNumber,
          supplierId: payTarget.supplierId,
          supplierName: payTarget.supplierName,
          date: new Date().toISOString().slice(0, 10),
          mode: payMode,
          reference: payRef,
          amount: payAmount,
        },
        ...prev,
      ]);
      showToast(`Recorded ${formatINR(payAmount)} via ${payMode} (${payRef}).`);
      setPayTarget(null);
      setPayRef('');
    } catch (err) {
      showToast(`Failed to record payment: ${(err as Error).message}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-ink-3 mb-1">
            <Link href="/procurement" className="hover:text-ink">Procurement</Link>
            <span>/</span>
            <span className="text-action">Supplier Bills &amp; AP</span>
          </div>
          <h1 className="text-2xl font-bold text-ink">Supplier Bills &amp; 3-Way Match</h1>
          <p className="text-sm text-ink-3">
            Verify PO vs GRN vs Bill with ✓/✗ line indicators, approve bills, record payments (G-AP-1), and track AP aging (G-AP-2).
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant={showLedger ? 'primary' : 'secondary'}
            onClick={() => setShowLedger(!showLedger)}
          >
            {showLedger ? 'Hide Ledger & Aging' : 'Supplier Ledger & AP Aging'}
          </Button>
          <Button variant="primary" onClick={() => setEnterOpen(true)}>
            + Enter Supplier Bill
          </Button>
        </div>
      </div>

      {toast && (
        <div className="p-3 rounded-lg bg-leaf-soft border border-leaf/30 text-leaf text-sm">
          {toast}
        </div>
      )}

      {/* AP Aging Summary Bar (G-AP-2) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4 bg-sheet border-rule">
          <div className="text-xs text-ink-3">0–30 Days (Current)</div>
          <div className="text-xl font-bold text-ink font-mono mt-1">
            {formatINR(apAging.current)}
          </div>
        </Card>
        <Card className="p-4 bg-sheet border-rule">
          <div className="text-xs text-ink-3">31–60 Days</div>
          <div className="text-xl font-bold text-haldi font-mono mt-1">
            {formatINR(apAging.d31_60)}
          </div>
        </Card>
        <Card className="p-4 bg-sheet border-rule">
          <div className="text-xs text-ink-3">61–90 Days</div>
          <div className="text-xl font-bold text-madder font-mono mt-1">
            {formatINR(apAging.d61_90)}
          </div>
        </Card>
        <Card className="p-4 bg-sheet border-rule">
          <div className="text-xs text-ink-3">90+ Days Overdue</div>
          <div className="text-xl font-bold text-rose-500 font-mono mt-1">
            {formatINR(apAging.d90_plus)}
          </div>
        </Card>
      </div>

      {/* Optional Supplier Ledger Drawer/Card */}
      {showLedger && (
        <Card className="p-5 bg-sheet border-rule">
          <h3 className="text-sm font-semibold text-ink mb-3">
            Supplier Payment Ledger (G-AP-1)
          </h3>
          <div className="space-y-2">
            {payments.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between p-2.5 rounded bg-paper border border-rule text-xs"
              >
                <div>
                  <span className="font-mono text-action font-semibold mr-2">
                    {p.billNumber}
                  </span>
                  <span className="text-ink">{p.supplierName}</span>
                </div>
                <div className="flex items-center gap-4 font-mono">
                  <span className="text-ink-3">{p.date}</span>
                  <Badge variant="info">{p.mode}</Badge>
                  <span className="text-ink-2">{p.reference}</span>
                  <span className="text-leaf font-bold">{formatINR(p.amount)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Status Tabs */}
      <div className="flex flex-wrap gap-1.5 bg-sheet border border-rule rounded-[3px] p-2">
        {BILL_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatusTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
              statusTab === t.key
                ? 'bg-indigo-600 text-white'
                : 'bg-sunken text-ink-3 hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Bills Table */}
      <div className="bg-sheet border border-rule rounded-[3px] overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper border-b border-rule text-xs uppercase text-ink-3">
            <tr>
              <th className="p-3">Bill #</th>
              <th className="p-3">Supplier &amp; PO</th>
              <th className="p-3">3-Way Match</th>
              <th className="p-3 text-right">Amount</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {filteredBills.map((b) => {
              const chip = THREE_WAY_CHIP_MAP[b.three_way_status] || {
                label: String(b.three_way_status || 'Pending'),
                variant: 'warning' as const,
              };
              return (
                <tr
                  key={b.id}
                  onClick={() => setSelectedBill(b)}
                  className={`hover:bg-sunken cursor-pointer ${
                    selectedBill?.id === b.id ? 'bg-indigo-500/10' : ''
                  }`}
                >
                  <td className="p-3 font-mono text-xs text-action font-semibold">
                    {b.billNumber}
                    <div className="text-[11px] text-ink-3">{b.billDate}</div>
                  </td>
                  <td className="p-3">
                    <div className="text-ink font-medium">{b.supplierName}</div>
                    <div className="text-[11px] text-ink-3 font-mono">
                      {b.poNumber} · {b.grnNumber}
                    </div>
                  </td>
                  <td className="p-3">
                    <Badge variant={chip.variant}>{chip.label}</Badge>
                  </td>
                  <td className="p-3 text-right font-mono font-semibold text-ink">
                    {formatINR(b.totalAmount)}
                    {b.paidAmount > 0 && (
                      <div className="text-[11px] text-leaf">
                        Paid {formatINR(b.paidAmount)}
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    <StatusPill
                      status={b.status}
                      tone={
                        b.status === 'PAID' || b.status === 'APPROVED'
                          ? 'emerald'
                          : b.status === 'DISPUTED'
                            ? 'rose'
                            : 'amber'
                      }
                    />
                  </td>
                  <td className="p-3 text-right space-x-2" onClick={(e) => e.stopPropagation()}>
                    {b.status === 'RECEIVED' && (
                      <button
                        onClick={() => handleStatusAction(b, 'submit')}
                        className="text-xs text-action hover:text-action font-medium"
                      >
                        Submit
                      </button>
                    )}
                    {(b.status === 'RECEIVED' || b.status === 'VERIFIED') && (
                      <>
                        <button
                          onClick={() => handleStatusAction(b, 'approve')}
                          className="text-xs text-leaf hover:text-leaf font-medium"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => setRejectTarget(b)}
                          className="text-xs text-madder hover:text-madder font-medium"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {b.status === 'APPROVED' && (
                      <button
                        onClick={() => {
                          setPayTarget(b);
                          setPayAmount(b.totalAmount - b.paidAmount);
                        }}
                        className="text-xs text-leaf hover:text-leaf font-medium"
                      >
                        Record Payment
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Side-by-side PO vs GRN vs Bill Comparison (§3.5 & §4) */}
      <Card className="p-5 bg-sheet border-rule">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-rule">
          <div>
            <h2 className="text-base font-semibold text-ink">
              3-Way Comparison: {selectedBill?.billNumber ?? '—'} ({selectedBill?.supplierName ?? 'Select a bill'})
            </h2>
            <p className="text-xs text-ink-3">
              PO ({selectedBill?.poNumber ?? '—'}) vs GRN ({selectedBill?.grnNumber ?? '—'}) vs Supplier Bill
            </p>
          </div>
          {selectedBill && (
            <Badge variant={(THREE_WAY_CHIP_MAP[selectedBill.three_way_status] || { variant: 'warning' }).variant}>
              {(THREE_WAY_CHIP_MAP[selectedBill.three_way_status] || { label: String(selectedBill.three_way_status || 'Pending') }).label}
            </Badge>
          )}
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-ink-3 border-b border-rule">
              <tr>
                <th className="py-2">Match</th>
                <th className="py-2">Item</th>
                <th className="py-2 text-right">PO Qty / Rate</th>
                <th className="py-2 text-right">GRN Qty</th>
                <th className="py-2 text-right">Bill Qty / Rate</th>
                <th className="py-2 text-right">Variance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {threeWayEval.lines.map((line) => (
                <tr key={line.itemId}>
                  <td className="py-3 text-lg font-bold">
                    <span
                      className={
                        line.icon === '✓' ? 'text-emerald-400' : 'text-rose-400'
                      }
                    >
                      {line.icon}
                    </span>
                  </td>
                  <td className="py-3 text-ink font-medium">{line.itemName}</td>
                  <td className="py-3 text-right font-mono text-xs text-ink-2">
                    {line.poQty} @ ₹{line.poRate}
                  </td>
                  <td className="py-3 text-right font-mono text-xs text-action">
                    {line.grnQty}
                  </td>
                  <td className="py-3 text-right font-mono text-xs text-ink">
                    {line.billQty} @ ₹{line.billRate}
                  </td>
                  <td className="py-3 text-right font-mono text-xs">
                    <span
                      className={
                        line.varianceAmount === 0
                          ? 'text-emerald-400'
                          : 'text-amber-400 font-bold'
                      }
                    >
                      {formatINR(line.varianceAmount)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Enter Bill Dialog */}
      <Dialog
        open={enterOpen}
        onClose={() => setEnterOpen(false)}
        title="Enter Supplier Bill"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-ink-3 mb-1">Link Purchase Order</label>
            <select
              value={newPoId}
              onChange={(e) => {
                setNewPoId(e.target.value);
                const po = purchaseOrders.find((p) => p.id === e.target.value);
                if (po?.lines[0]) {
                  setNewBillQty(po.lines[0].receivedQty || po.lines[0].orderedQty);
                  setNewBillRate(po.lines[0].unitRate);
                }
              }}
              className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
            >
              {purchaseOrders.map((po) => (
                <option key={po.id} value={po.id}>
                  {po.poNumber} — {po.supplierName}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-3 mb-1">Supplier Bill No.</label>
              <input
                type="text"
                placeholder="e.g., INV-SAT-902"
                value={newBillNo}
                onChange={(e) => setNewBillNo(e.target.value)}
                className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-3 mb-1">Bill Date</label>
              <input
                type="date"
                value={newBillDate}
                onChange={(e) => setNewBillDate(e.target.value)}
                className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-3 mb-1">Billed Qty</label>
              <input
                type="number"
                value={newBillQty}
                onChange={(e) => setNewBillQty(Number(e.target.value))}
                className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-3 mb-1">Billed Rate (₹)</label>
              <input
                type="number"
                value={newBillRate}
                onChange={(e) => setNewBillRate(Number(e.target.value))}
                className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-ink-3 mb-1">Attach Bill Scan (G-FILE-1)</label>
            <input
              type="file"
              onChange={(e) => setNewScanName(e.target.files?.[0]?.name || '')}
              className="w-full text-xs text-ink-3"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEnterOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleEnterBill}>
              Save &amp; Run 3-Way Match
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Reject Bill Dialog */}
      <Dialog
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title={`Reject / Dispute ${rejectTarget?.billNumber ?? ''}`}
      >
        <div className="space-y-4">
          <textarea
            rows={3}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason required..."
            className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRejectTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!rejectReason.trim()}
              onClick={handleRejectBill}
            >
              Confirm Reject
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Record Payment Dialog (G-AP-1) */}
      <Dialog
        open={!!payTarget}
        onClose={() => setPayTarget(null)}
        title={`Record Payment — ${payTarget?.billNumber ?? ''}`}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-3 mb-1">Payment Mode</label>
              <select
                value={payMode}
                onChange={(e) => setPayMode(e.target.value as any)}
                className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
              >
                <option value="BANK">Bank Transfer (NEFT/RTGS)</option>
                <option value="UPI">UPI</option>
                <option value="CASH">Cash</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-ink-3 mb-1">Amount (₹)</label>
              <input
                type="number"
                value={payAmount}
                onChange={(e) => setPayAmount(Number(e.target.value))}
                className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-ink-3 mb-1">UTR / Reference No.</label>
            <input
              type="text"
              placeholder="e.g., UTR-991024"
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
              className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPayTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!payRef.trim() || payAmount <= 0}
              onClick={handleRecordPayment}
            >
              Record Payment
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

