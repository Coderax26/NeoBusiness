'use client';

import React, { useEffect, useState } from 'react';
import {
  DataTable,
  type ColumnDef,
  Button,
  KpiCard,
  Badge,
  StatusPill,
  Dialog,
  CsvImportModal,
  exportToCsv,
} from '@neo/ui';
import { validateGSTIN, checkDuplicateRecord } from '@neo/shared';

export interface SupplierItem {
  itemId: string;
  itemSku: string;
  itemName: string;
  supplierSku: string;
  packSize: string;
  approved: boolean;
  latestRate?: number;
}

export interface SupplierRate {
  id: string;
  itemId: string;
  itemName: string;
  ratePerUnit: number;
  validFrom: string;
  validTo?: string;
  notes?: string;
}

export interface SupplierRecord {
  id: string;
  code: string;
  name: string;
  gstin: string;
  contactPerson: string;
  phone: string;
  email?: string;
  address: string;
  paymentTermsDays: number;
  leadTimeDays: number;
  reliabilityScore: number; // 0 to 5.0
  fillRatePct: number; // e.g. 96.5%
  onTimePct: number; // e.g. 94%
  shortfallCount: number;
  lastPoDate?: string;
  hasMissingRates: boolean;
  items: SupplierItem[];
  rates: SupplierRate[];
  active: boolean;
}


export default function SupplierMasterPage() {
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/proxy/procurement/suppliers')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        if (!active || !Array.isArray(rows)) return;
        setSuppliers(
          rows.map((s: any) => ({
            id: String(s.id),
            code: String(s.supplier_code || s.code || ''),
            name: String(s.company_name || s.name || 'Supplier'),
            gstin: String(s.gstin || ''),
            contactPerson: String(s.contact_person || s.contactPerson || ''),
            phone: String(s.phone || ''),
            email: String(s.email || ''),
            address: String(s.address || ''),
            paymentTermsDays: Number(s.payment_terms_days ?? s.paymentTermsDays ?? 15),
            leadTimeDays: Number(s.lead_time_days ?? s.leadTimeDays ?? 2),
            reliabilityScore: Number(s.reliability_score ?? s.reliabilityScore ?? 4.5),
            fillRatePct: Number(s.fill_rate_pct ?? s.fillRatePct ?? 95),
            onTimePct: Number(s.on_time_pct ?? s.onTimePct ?? 92),
            shortfallCount: Number(s.shortfall_count ?? s.shortfallCount ?? 0),
            lastPoDate: s.last_po_date || undefined,
            hasMissingRates: Boolean(s.has_missing_rates),
            items: Array.isArray(s.items) ? s.items : [],
            rates: Array.isArray(s.rates) ? s.rates : [],
            active: s.is_active !== false,
          })),
        );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const [missingRateOnly, setMissingRateOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Form modal state
  const [formOpen, setFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierRecord | null>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'items' | 'rates' | 'performance'>('general');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Rate card modal state
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [newRateItemId, setNewRateItemId] = useState('');
  const [newRateValue, setNewRateValue] = useState('');
  const [newRateValidFrom, setNewRateValidFrom] = useState(new Date().toISOString().split('T')[0]);

  // Import modal
  const [importOpen, setImportOpen] = useState(false);

  // Form fields
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [gstin, setGstin] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [paymentTermsDays, setPaymentTermsDays] = useState('15');
  const [leadTimeDays, setLeadTimeDays] = useState('2');

  const openNewForm = () => {
    setEditingSupplier(null);
    setCode(`SUP-${String(suppliers.length + 1).padStart(3, '0')}`);
    setName('');
    setGstin('');
    setContactPerson('');
    setPhone('');
    setEmail('');
    setAddress('');
    setPaymentTermsDays('15');
    setLeadTimeDays('2');
    setFormErrors({});
    setActiveTab('general');
    setFormOpen(true);
  };

  const openEditForm = (sup: SupplierRecord) => {
    setEditingSupplier(sup);
    setCode(sup.code);
    setName(sup.name);
    setGstin(sup.gstin);
    setContactPerson(sup.contactPerson);
    setPhone(sup.phone);
    setEmail(sup.email || '');
    setAddress(sup.address);
    setPaymentTermsDays(String(sup.paymentTermsDays));
    setLeadTimeDays(String(sup.leadTimeDays));
    setFormErrors({});
    setActiveTab('general');
    setFormOpen(true);
  };

  const handleSaveSupplier = () => {
    const errors: Record<string, string> = {};
    if (!code.trim()) errors.code = 'Supplier code is required.';
    if (!name.trim()) errors.name = 'Supplier name is required.';
    if (!phone.trim()) errors.phone = 'Phone number is required.';

    if (gstin.trim()) {
      const gstinVal = validateGSTIN(gstin);
      if (!gstinVal.valid) errors.gstin = gstinVal.error || 'Invalid GSTIN.';
    }

    const dupCheck = checkDuplicateRecord(suppliers, 'name', name, editingSupplier?.id);
    if (dupCheck.isDuplicate) {
      errors.name = `Supplier name "${name}" is already registered.`;
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      setActiveTab('general');
      return;
    }

    const newRecord: SupplierRecord = {
      id: editingSupplier ? editingSupplier.id : `sup-${Date.now()}`,
      code: code.trim().toUpperCase(),
      name: name.trim(),
      gstin: gstin.trim().toUpperCase(),
      contactPerson: contactPerson.trim(),
      phone: phone.trim(),
      email: email.trim(),
      address: address.trim(),
      paymentTermsDays: parseInt(paymentTermsDays, 10) || 15,
      leadTimeDays: parseInt(leadTimeDays, 10) || 2,
      reliabilityScore: editingSupplier ? editingSupplier.reliabilityScore : 5.0,
      fillRatePct: editingSupplier ? editingSupplier.fillRatePct : 100,
      onTimePct: editingSupplier ? editingSupplier.onTimePct : 100,
      shortfallCount: editingSupplier ? editingSupplier.shortfallCount : 0,
      lastPoDate: editingSupplier?.lastPoDate,
      hasMissingRates: editingSupplier ? editingSupplier.hasMissingRates : false,
      items: editingSupplier ? editingSupplier.items : [],
      rates: editingSupplier ? editingSupplier.rates : [],
      active: editingSupplier ? editingSupplier.active : true,
    };

    if (editingSupplier) {
      setSuppliers((prev) => prev.map((s) => (s.id === editingSupplier.id ? newRecord : s)));
    } else {
      setSuppliers((prev) => [newRecord, ...prev]);
    }
    setFormOpen(false);
  };

  const handleAddRate = () => {
    if (!editingSupplier || !newRateValue || !newRateItemId) return;
    const rateVal = parseFloat(newRateValue);
    if (isNaN(rateVal) || rateVal <= 0) return;

    const matchedItem = editingSupplier.items.find((i) => i.itemId === newRateItemId);
    const newRate: SupplierRate = {
      id: `r-${Date.now()}`,
      itemId: newRateItemId,
      itemName: matchedItem?.itemName || 'Item',
      ratePerUnit: rateVal,
      validFrom: newRateValidFrom,
      notes: 'Added via Supplier Rate Card tab',
    };

    const updatedRates = [newRate, ...editingSupplier.rates];
    const updatedItems = editingSupplier.items.map((i) =>
      i.itemId === newRateItemId ? { ...i, latestRate: rateVal } : i,
    );

    const hasMissing = updatedItems.some((i) => i.latestRate === undefined);

    const updatedSupplier: SupplierRecord = {
      ...editingSupplier,
      rates: updatedRates,
      items: updatedItems,
      hasMissingRates: hasMissing,
    };

    setEditingSupplier(updatedSupplier);
    setSuppliers((prev) => prev.map((s) => (s.id === updatedSupplier.id ? updatedSupplier : s)));
    setRateModalOpen(false);
    setNewRateValue('');
  };

  const handleRecalculateReliability = () => {
    if (!editingSupplier) return;
    // Calculate composite reliability score: (fillRate * 0.6 + onTime * 0.4) / 20
    const weighted = (editingSupplier.fillRatePct * 0.6 + editingSupplier.onTimePct * 0.4) / 20;
    const newScore = parseFloat(Math.min(5.0, Math.max(1.0, weighted)).toFixed(1));

    const updatedSupplier: SupplierRecord = {
      ...editingSupplier,
      reliabilityScore: newScore,
    };
    setEditingSupplier(updatedSupplier);
    setSuppliers((prev) => prev.map((s) => (s.id === updatedSupplier.id ? updatedSupplier : s)));
  };

  // KPIs
  const activeCount = suppliers.filter((s) => s.active).length;
  const missingRateCount = suppliers.filter((s) => s.active && s.hasMissingRates).length;
  const highReliabilityCount = suppliers.filter((s) => s.active && s.reliabilityScore >= 4.5).length;

  const filteredSuppliers = suppliers.filter((sup) => {
    if (missingRateOnly && !sup.hasMissingRates) return false;
    if (statusFilter === 'ACTIVE' && !sup.active) return false;
    if (statusFilter === 'INACTIVE' && sup.active) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return sup.name.toLowerCase().includes(q) || sup.code.toLowerCase().includes(q);
    }
    return true;
  });

  const columns: ColumnDef<SupplierRecord>[] = [
    {
      id: 'code',
      header: 'Code',
      accessorKey: 'code',
      cell: (info) => (
        <span className="font-mono text-xs font-bold text-action">
          {info.getValue() as string}
        </span>
      ),
    },
    {
      id: 'name',
      header: 'Supplier Name & Contact',
      accessorKey: 'name',
      cell: (info) => {
        const s = info.row.original;
        return (
          <div>
            <div className="font-bold text-ink text-xs">{s.name}</div>
            <div className="text-[11px] text-ink-3 flex items-center gap-2 mt-0.5">
              <span>{s.contactPerson}</span>
              <span>•</span>
              <a href={`tel:${s.phone}`} className="text-action hover:underline">
                📞 {s.phone}
              </a>
              {s.hasMissingRates && (
                <span className="text-madder font-semibold">• Missing rate alert</span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      id: 'itemsSupplied',
      header: 'Items Supplied',
      cell: (info) => {
        const count = info.row.original.items.length;
        return <span className="text-xs text-ink-2">{count} active items</span>;
      },
    },
    {
      id: 'reliability',
      header: 'Reliability Score',
      accessorKey: 'reliabilityScore',
      cell: (info) => {
        const score = info.getValue() as number;
        return (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-haldi font-bold">★ {score.toFixed(1)}</span>
            <span className="text-ink-3">/ 5.0</span>
          </div>
        );
      },
    },
    {
      id: 'fillRate',
      header: 'Fill Rate %',
      accessorKey: 'fillRatePct',
      cell: (info) => {
        const rate = info.getValue() as number;
        return (
          <span className={`text-xs font-mono font-bold${rate >= 90 ? 'text-emerald-400' : 'text-amber-400'}`}>
            {rate.toFixed(1)}%
          </span>
        );
      },
    },
    {
      id: 'lastPo',
      header: 'Last PO',
      accessorKey: 'lastPoDate',
      cell: (info) => (
        <span className="text-xs text-ink-3">{((info.getValue() as string) || 'No orders yet')}</span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: (info) => {
        const s = info.row.original;
        return (
          <div className="flex items-center gap-2">
            <button
              onClick={() => openEditForm(s)}
              className="text-xs text-action hover:text-action font-medium"
            >
              Manage
            </button>
          </div>
        );
      },
    },
  ];

  const handleExportCsv = () => {
    exportToCsv(
      'suppliers-list.csv',
      filteredSuppliers,
      [
        { key: 'code', label: 'Supplier Code' },
        { key: 'name', label: 'Supplier Name' },
        { key: 'gstin', label: 'GSTIN' },
        { key: 'contactPerson', label: 'Contact Person' },
        { key: 'phone', label: 'Phone' },
        { key: (s) => `${s.items.length} items`, label: 'Items Supplied' },
        { key: 'reliabilityScore', label: 'Reliability Score' },
        { key: (s) => `${s.fillRatePct}%`, label: 'Fill Rate' },
        { key: 'lastPoDate', label: 'Last PO Date' },
      ],
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-rule pb-5">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-action/10 text-action border border-action/30 mb-1.5">
            <span>🏭 Procurement &amp; Vendors</span>
          </div>
          <h1 className="text-2xl font-semibold text-ink">Supplier Master Directory</h1>
          <p className="text-xs text-ink-3 mt-0.5">
            Manage approved vendors, contract rate cards, supplied materials, and vendor reliability metrics.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
            📥 Import Suppliers (CSV)
          </Button>
          <Button variant="secondary" size="sm" onClick={handleExportCsv}>
            📤 Export CSV
          </Button>
          <Button variant="primary" size="sm" onClick={openNewForm}>
            + Add New Supplier
          </Button>
        </div>
      </div>

      {/* 2. KPI Strip (§5) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Active Suppliers"
          value={String(activeCount)}
          subtitle="Suppliers available for POs"
          tone="default"
        />
        <KpiCard
          title="Missing Rate Alerts"
          value={String(missingRateCount)}
          subtitle="Items without agreed rate card"
          tone={missingRateCount > 0 ? 'danger' : 'success'}
        />
        <KpiCard
          title="High Reliability (>= 4.5★)"
          value={String(highReliabilityCount)}
          subtitle="Consistent delivery & quality"
          tone="success"
        />
        <KpiCard
          title="Avg Payment Terms"
          value={`${suppliers.length > 0 ? Math.round(suppliers.reduce((sum, s) => sum + (s.paymentTermsDays || 0), 0) / suppliers.length) : 0} days`}
          subtitle="Across active suppliers"
          tone="default"
        />
      </div>

      {/* 3. Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-sheet border border-rule p-4 rounded-[4px]">
        <div className="flex items-center gap-3 flex-1">
          <input
            type="text"
            placeholder="Search by name or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full md:w-80 bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink placeholder-ink-3 focus:outline-none focus:border-action/30"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink-2 focus:outline-none focus:border-action/30"
          >
            <option value="ALL">All Status</option>
            <option value="ACTIVE">Active Only</option>
            <option value="INACTIVE">Inactive Only</option>
          </select>
        </div>

        <button
          onClick={() => setMissingRateOnly(!missingRateOnly)}
          className={`px-3 py-1.5 rounded-[3px] text-xs font-semibold border transition-all${
            missingRateOnly
              ? 'bg-madder-soft text-madder border-madder/30'
              : 'bg-paper text-ink-3 border-rule hover:text-ink'
          }`}
        >
          🚨 Missing Rate Alerts ({missingRateCount})
        </button>
      </div>

      {/* 4. DataTable */}
      <DataTable columns={columns} data={filteredSuppliers} pageSize={10} />

      {/* 5. Supplier Detail & Form Dialog (§5) */}
      <Dialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingSupplier ? `Supplier: ${editingSupplier.name}` : 'Register New Supplier'}
        maxWidth="xl"
      >
        <div className="space-y-5 my-2">
          {/* Tabs */}
          <div className="flex border-b border-rule text-xs font-semibold gap-4 overflow-x-auto">
            <button
              onClick={() => setActiveTab('general')}
              className={`pb-2 border-b-2 transition-colors${
                activeTab === 'general' ? 'border-action/30 text-action' : 'border-transparent text-ink-3 hover:text-ink'
              }`}
            >
              General Info
            </button>
            {editingSupplier && (
              <>
                <button
                  onClick={() => setActiveTab('items')}
                  className={`pb-2 border-b-2 transition-colors${
                    activeTab === 'items' ? 'border-action/30 text-action' : 'border-transparent text-ink-3 hover:text-ink'
                  }`}
                >
                  Supplied Items ({editingSupplier.items.length})
                </button>
                <button
                  onClick={() => setActiveTab('rates')}
                  className={`pb-2 border-b-2 transition-colors${
                    activeTab === 'rates' ? 'border-action/30 text-action' : 'border-transparent text-ink-3 hover:text-ink'
                  }`}
                >
                  Rate Cards &amp; History
                </button>
                <button
                  onClick={() => setActiveTab('performance')}
                  className={`pb-2 border-b-2 transition-colors${
                    activeTab === 'performance' ? 'border-action/30 text-action' : 'border-transparent text-ink-3 hover:text-ink'
                  }`}
                >
                  Performance &amp; Reliability
                </button>
              </>
            )}
          </div>

          {/* Tab 1: General Info */}
          {activeTab === 'general' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-ink-2 mb-1">Supplier Code *</label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink font-mono uppercase focus:outline-none focus:border-action/30"
                  />
                  {formErrors.code && <p className="text-xs text-madder mt-1">{formErrors.code}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-2 mb-1">Business / Firm Name *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink focus:outline-none focus:border-action/30"
                  />
                  {formErrors.name && <p className="text-xs text-madder mt-1">{formErrors.name}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-ink-2 mb-1">GSTIN</label>
                  <input
                    type="text"
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value.toUpperCase())}
                    placeholder="e.g. 27AABCG1234F1Z5"
                    className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink font-mono uppercase focus:outline-none focus:border-action/30"
                  />
                  {formErrors.gstin && <p className="text-xs text-madder mt-1">{formErrors.gstin}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-2 mb-1">Contact Person</label>
                  <input
                    type="text"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink focus:outline-none focus:border-action/30"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-ink-2 mb-1">Phone Number *</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink font-mono focus:outline-none focus:border-action/30"
                  />
                  {formErrors.phone && <p className="text-xs text-madder mt-1">{formErrors.phone}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-2 mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink focus:outline-none focus:border-action/30"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-ink-2 mb-1">Payment Terms (Days)</label>
                  <input
                    type="number"
                    value={paymentTermsDays}
                    onChange={(e) => setPaymentTermsDays(e.target.value)}
                    className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink font-mono focus:outline-none focus:border-action/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-2 mb-1">Expected Lead Time (Days)</label>
                  <input
                    type="number"
                    value={leadTimeDays}
                    onChange={(e) => setLeadTimeDays(e.target.value)}
                    className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink font-mono focus:outline-none focus:border-action/30"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-2 mb-1">Factory / Dispatch Address</label>
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  rows={2}
                  className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink focus:outline-none focus:border-action/30"
                />
              </div>
            </div>
          )}

          {/* Tab 2: Supplied Items */}
          {activeTab === 'items' && editingSupplier && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-ink-3">
                  Catalog items linked to this supplier for purchase orders:
                </span>
              </div>

              <div className="space-y-2">
                {editingSupplier.items.map((it) => (
                  <div
                    key={it.itemId}
                    className="p-3 bg-paper border border-rule rounded-[3px] flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-bold text-ink">{it.itemName}</div>
                      <div className="text-[11px] text-ink-3 mt-0.5">
                        <span>SKU: {it.itemSku}</span>
                        <span className="mx-1.5">•</span>
                        <span>Vendor SKU: {it.supplierSku}</span>
                        <span className="mx-1.5">•</span>
                        <span>Pack: {it.packSize}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      {it.latestRate !== undefined ? (
                        <span className="font-mono font-bold text-action">
                          ₹{it.latestRate.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-madder font-semibold">⚠️ No rate set</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab 3: Rate Cards & History */}
          {activeTab === 'rates' && editingSupplier && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-ink">Active Rate Agreements</h4>
                  <p className="text-[11px] text-ink-3">Contract rates with start and expiry dates</p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setNewRateItemId(editingSupplier.items[0]?.itemId || 'itm-3');
                    setRateModalOpen(true);
                  }}
                >
                  + Add New Rate
                </Button>
              </div>

              {editingSupplier.rates.length === 0 ? (
                <div className="p-8 text-center bg-paper rounded-[4px] border border-rule text-xs text-ink-3">
                  No rate agreements recorded yet. Add an agreed contract rate to prevent PO price discrepancies.
                </div>
              ) : (
                <div className="space-y-2">
                  {editingSupplier.rates.map((r) => (
                    <div
                      key={r.id}
                      className="p-3 bg-paper border border-rule rounded-[3px] flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-ink">{r.itemName}</div>
                        <div className="text-[11px] text-ink-3 mt-0.5">
                          <span>Valid from: {r.validFrom}</span>
                          {r.validTo && <span> to {r.validTo}</span>}
                          {r.notes && <span className="ml-2 text-ink-3">({r.notes})</span>}
                        </div>
                      </div>
                      <div className="text-base font-mono font-semibold text-action">
                        ₹{r.ratePerUnit.toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab 4: Performance & Reliability */}
          {activeTab === 'performance' && editingSupplier && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 bg-paper border border-rule rounded-[3px] text-center">
                  <span className="text-[11px] text-ink-3 font-semibold uppercase">Reliability Score</span>
                  <div className="text-2xl font-semibold text-haldi mt-1">
                    ★ {editingSupplier.reliabilityScore.toFixed(1)}
                  </div>
                  <span className="text-[11px] text-ink-3">Calculated composite</span>
                </div>
                <div className="p-4 bg-paper border border-rule rounded-[3px] text-center">
                  <span className="text-[11px] text-ink-3 font-semibold uppercase">PO Fill Rate</span>
                  <div className="text-2xl font-semibold text-leaf mt-1">
                    {editingSupplier.fillRatePct.toFixed(1)}%
                  </div>
                  <span className="text-[11px] text-ink-3">Delivered vs Ordered</span>
                </div>
                <div className="p-4 bg-paper border border-rule rounded-[3px] text-center">
                  <span className="text-[11px] text-ink-3 font-semibold uppercase">On-Time Delivery</span>
                  <div className="text-2xl font-semibold text-action mt-1">
                    {editingSupplier.onTimePct.toFixed(1)}%
                  </div>
                  <span className="text-[11px] text-ink-3">Within agreed lead time</span>
                </div>
              </div>

              <div className="p-4 bg-paper border border-rule rounded-[3px] flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-ink">Historical Shortfall Events</div>
                  <p className="text-[11px] text-ink-3">
                    Total recorded delivery shortages: {editingSupplier.shortfallCount} instances.
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={handleRecalculateReliability}>
                  ⚡ Recalculate Reliability
                </Button>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="pt-4 border-t border-rule flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setFormOpen(false)}>
              Close
            </Button>
            <Button variant="primary" size="sm" onClick={handleSaveSupplier}>
              {editingSupplier ? 'Save Supplier Details' : 'Register Supplier'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* 6. Add Rate Dialog */}
      <Dialog
        open={rateModalOpen}
        onClose={() => setRateModalOpen(false)}
        title="Add New Agreed Rate Card"
        maxWidth="sm"
      >
        <div className="space-y-4 my-2">
          <div>
            <label className="block text-xs font-semibold text-ink-2 mb-1">Item</label>
            <select
              value={newRateItemId}
              onChange={(e) => setNewRateItemId(e.target.value)}
              className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink focus:outline-none focus:border-action/30"
            >
              {editingSupplier?.items.map((i) => (
                <option key={i.itemId} value={i.itemId}>
                  {i.itemName} ({i.itemSku})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-2 mb-1">Rate Per Unit (₹)</label>
            <input
              type="number"
              step="any"
              value={newRateValue}
              onChange={(e) => setNewRateValue(e.target.value)}
              placeholder="e.g. 56.50"
              className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink font-mono focus:outline-none focus:border-action/30"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-2 mb-1">Valid From</label>
            <input
              type="date"
              value={newRateValidFrom}
              onChange={(e) => setNewRateValidFrom(e.target.value)}
              className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink focus:outline-none focus:border-action/30"
            />
          </div>

          <div className="pt-3 border-t border-rule flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setRateModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleAddRate}>
              Save Rate Card
            </Button>
          </div>
        </div>
      </Dialog>

      {/* 7. CSV Import Modal */}
      <CsvImportModal<Partial<SupplierRecord>>
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Suppliers via CSV"
        entityName="Supplier"
        expectedHeaders={[
          { key: 'code', label: 'Code', required: true, example: 'SUP-004' },
          { key: 'name', label: 'Supplier Name', required: true, example: 'Apex Farms' },
          { key: 'phone', label: 'Phone', required: true, example: '9822334455' },
          { key: 'gstin', label: 'GSTIN', required: false, example: '27AABCG1234F1Z5' },
          { key: 'paymentTermsDays', label: 'Payment Terms', required: false, example: '15' },
        ]}
        validator={(row) => {
          const errors: string[] = [];
          if (!row.code) errors.push('Missing Code');
          if (!row.name) errors.push('Missing Name');
          if (!row.phone) errors.push('Missing Phone');
          const isValid = errors.length === 0;
          return {
            isValid,
            errors,
            parsed: {
              id: `sup-csv-${Date.now()}-${Math.random()}`,
              code: row.code?.toUpperCase(),
              name: row.name,
              phone: row.phone,
              gstin: row.gstin || '',
              contactPerson: row.name,
              address: '',
              paymentTermsDays: parseInt(row.paymentTermsDays || '15', 10) || 15,
              leadTimeDays: 2,
              reliabilityScore: 5.0,
              fillRatePct: 100,
              onTimePct: 100,
              shortfallCount: 0,
              hasMissingRates: false,
              items: [],
              rates: [],
              active: true,
            },
          };
        }}
        onImport={async (validRows) => {
          setSuppliers((prev) => [...(validRows as SupplierRecord[]), ...prev]);
          return { importedCount: validRows.length, skippedCount: 0 };
        }}
      />
    </div>
  );
}

