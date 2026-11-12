'use client';

import React, { useState } from 'react';
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

const INITIAL_SUPPLIERS: SupplierRecord[] = [
  {
    id: 'sup-1',
    code: 'SUP-001',
    name: 'Ganga Dairy Farmers Cooperative',
    gstin: '27AABCG1234F1Z5',
    contactPerson: 'Kailash Patil',
    phone: '9822112233',
    email: 'ganga.coop@example.com',
    address: 'Village Bori, Baramati, Dist Pune',
    paymentTermsDays: 7,
    leadTimeDays: 1,
    reliabilityScore: 4.8,
    fillRatePct: 98.2,
    onTimePct: 96.0,
    shortfallCount: 1,
    lastPoDate: '2026-11-12',
    hasMissingRates: false,
    items: [
      {
        itemId: 'itm-3',
        itemSku: 'RM-RAW-MILK',
        itemName: 'Raw Chilled Buffalo Milk (6.5% Fat)',
        supplierSku: 'GDC-MILK-BUF',
        packSize: '40L Can',
        approved: true,
        latestRate: 56.5,
      },
    ],
    rates: [
      {
        id: 'r-1',
        itemId: 'itm-3',
        itemName: 'Raw Chilled Buffalo Milk',
        ratePerUnit: 56.5,
        validFrom: '2026-11-01',
        notes: 'Winter contract rate',
      },
      {
        id: 'r-2',
        itemId: 'itm-3',
        itemName: 'Raw Chilled Buffalo Milk',
        ratePerUnit: 54.0,
        validFrom: '2026-10-01',
        validTo: '2026-10-31',
        notes: 'Pre-diwali baseline',
      },
    ],
    active: true,
  },
  {
    id: 'sup-2',
    code: 'SUP-002',
    name: 'Apex Packaging Industries',
    gstin: '27AAACA9999M1Z2',
    contactPerson: 'Sameer Joshi',
    phone: '9823001122',
    email: 'orders@apexpack.com',
    address: 'MIDC Bhosari, Pune',
    paymentTermsDays: 30,
    leadTimeDays: 5,
    reliabilityScore: 4.2,
    fillRatePct: 92.0,
    onTimePct: 89.5,
    shortfallCount: 4,
    lastPoDate: '2026-11-05',
    hasMissingRates: false,
    items: [
      {
        itemId: 'itm-p1',
        itemSku: 'PK-TUB-500G',
        itemName: 'Curd 500g IML Tubs & Lids',
        supplierSku: 'APX-TUB-500',
        packSize: 'Box of 500',
        approved: true,
        latestRate: 4.2,
      },
      {
        itemId: 'itm-p2',
        itemSku: 'PK-POUCH-200G',
        itemName: 'Paneer 200g Vacuum Pouches',
        supplierSku: 'APX-PCH-200',
        packSize: 'Pack of 1000',
        approved: true,
        latestRate: 1.85,
      },
    ],
    rates: [
      {
        id: 'r-3',
        itemId: 'itm-p1',
        itemName: 'Curd 500g IML Tubs',
        ratePerUnit: 4.2,
        validFrom: '2026-09-01',
      },
      {
        id: 'r-4',
        itemId: 'itm-p2',
        itemName: 'Paneer 200g Vacuum Pouches',
        ratePerUnit: 1.85,
        validFrom: '2026-09-01',
      },
    ],
    active: true,
  },
  {
    id: 'sup-3',
    code: 'SUP-003',
    name: 'Siddhi Spices & Ingredients',
    gstin: '27AABCS5544N1ZX',
    contactPerson: 'Mahesh Deshmukh',
    phone: '9822554411',
    address: 'Market Yard, Gultekdi, Pune',
    paymentTermsDays: 15,
    leadTimeDays: 2,
    reliabilityScore: 3.5,
    fillRatePct: 84.0,
    onTimePct: 82.0,
    shortfallCount: 7,
    lastPoDate: '2026-10-20',
    hasMissingRates: true, // Missing rate alert!
    items: [
      {
        itemId: 'itm-sp1',
        itemSku: 'RM-SALT-IOD',
        itemName: 'Refined Iodised Salt 50kg',
        supplierSku: 'SSI-SALT-50',
        packSize: '50kg Bag',
        approved: true,
        latestRate: undefined, // Missing current rate
      },
    ],
    rates: [],
    active: true,
  },
];

export default function SupplierMasterPage() {
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>(INITIAL_SUPPLIERS);
  const [search, setSearch] = useState('');
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
        <span className="font-mono text-xs font-bold text-teal-400">
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
            <div className="font-bold text-white text-xs">{s.name}</div>
            <div className="text-[11px] text-zinc-400 flex items-center gap-2 mt-0.5">
              <span>{s.contactPerson}</span>
              <span>•</span>
              <a href={`tel:${s.phone}`} className="text-teal-400 hover:underline">
                📞 {s.phone}
              </a>
              {s.hasMissingRates && (
                <span className="text-rose-400 font-semibold">• Missing rate alert</span>
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
        return <span className="text-xs text-zinc-300">{count} active items</span>;
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
            <span className="text-amber-400 font-bold">★ {score.toFixed(1)}</span>
            <span className="text-zinc-500">/ 5.0</span>
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
          <span className={`text-xs font-mono font-bold ${rate >= 90 ? 'text-emerald-400' : 'text-amber-400'}`}>
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
        <span className="text-xs text-zinc-400">{((info.getValue() as string) || 'No orders yet')}</span>
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
              className="text-xs text-teal-400 hover:text-teal-300 font-medium"
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-500/10 text-teal-400 border border-teal-500/30 mb-1.5">
            <span>🏭 Procurement &amp; Vendors</span>
          </div>
          <h1 className="text-2xl font-black text-white">Supplier Master Directory</h1>
          <p className="text-xs text-zinc-400 mt-0.5">
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
          title="Avg Fulfilment Time"
          value="2.1 days"
          subtitle="Across active suppliers"
          tone="default"
        />
      </div>

      {/* 3. Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-zinc-900/60 border border-zinc-800 p-4 rounded-2xl">
        <div className="flex items-center gap-3 flex-1">
          <input
            type="text"
            placeholder="Search by name or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full md:w-80 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-teal-500"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-teal-500"
          >
            <option value="ALL">All Status</option>
            <option value="ACTIVE">Active Only</option>
            <option value="INACTIVE">Inactive Only</option>
          </select>
        </div>

        <button
          onClick={() => setMissingRateOnly(!missingRateOnly)}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
            missingRateOnly
              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
              : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
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
          <div className="flex border-b border-zinc-800 text-xs font-semibold gap-4 overflow-x-auto">
            <button
              onClick={() => setActiveTab('general')}
              className={`pb-2 border-b-2 transition-colors ${
                activeTab === 'general' ? 'border-teal-500 text-teal-400' : 'border-transparent text-zinc-400 hover:text-white'
              }`}
            >
              General Info
            </button>
            {editingSupplier && (
              <>
                <button
                  onClick={() => setActiveTab('items')}
                  className={`pb-2 border-b-2 transition-colors ${
                    activeTab === 'items' ? 'border-teal-500 text-teal-400' : 'border-transparent text-zinc-400 hover:text-white'
                  }`}
                >
                  Supplied Items ({editingSupplier.items.length})
                </button>
                <button
                  onClick={() => setActiveTab('rates')}
                  className={`pb-2 border-b-2 transition-colors ${
                    activeTab === 'rates' ? 'border-teal-500 text-teal-400' : 'border-transparent text-zinc-400 hover:text-white'
                  }`}
                >
                  Rate Cards &amp; History
                </button>
                <button
                  onClick={() => setActiveTab('performance')}
                  className={`pb-2 border-b-2 transition-colors ${
                    activeTab === 'performance' ? 'border-teal-500 text-teal-400' : 'border-transparent text-zinc-400 hover:text-white'
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
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">Supplier Code *</label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-mono uppercase focus:outline-none focus:border-teal-500"
                  />
                  {formErrors.code && <p className="text-xs text-rose-400 mt-1">{formErrors.code}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">Business / Firm Name *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500"
                  />
                  {formErrors.name && <p className="text-xs text-rose-400 mt-1">{formErrors.name}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">GSTIN</label>
                  <input
                    type="text"
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value.toUpperCase())}
                    placeholder="e.g. 27AABCG1234F1Z5"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-mono uppercase focus:outline-none focus:border-teal-500"
                  />
                  {formErrors.gstin && <p className="text-xs text-rose-400 mt-1">{formErrors.gstin}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">Contact Person</label>
                  <input
                    type="text"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">Phone Number *</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-teal-500"
                  />
                  {formErrors.phone && <p className="text-xs text-rose-400 mt-1">{formErrors.phone}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">Payment Terms (Days)</label>
                  <input
                    type="number"
                    value={paymentTermsDays}
                    onChange={(e) => setPaymentTermsDays(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">Expected Lead Time (Days)</label>
                  <input
                    type="number"
                    value={leadTimeDays}
                    onChange={(e) => setLeadTimeDays(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">Factory / Dispatch Address</label>
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  rows={2}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>
          )}

          {/* Tab 2: Supplied Items */}
          {activeTab === 'items' && editingSupplier && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400">
                  Catalog items linked to this supplier for purchase orders:
                </span>
              </div>

              <div className="space-y-2">
                {editingSupplier.items.map((it) => (
                  <div
                    key={it.itemId}
                    className="p-3 bg-zinc-950/60 border border-zinc-800 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-bold text-white">{it.itemName}</div>
                      <div className="text-[11px] text-zinc-400 mt-0.5">
                        <span>SKU: {it.itemSku}</span>
                        <span className="mx-1.5">•</span>
                        <span>Vendor SKU: {it.supplierSku}</span>
                        <span className="mx-1.5">•</span>
                        <span>Pack: {it.packSize}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      {it.latestRate !== undefined ? (
                        <span className="font-mono font-bold text-teal-400">
                          ₹{it.latestRate.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-rose-400 font-semibold">⚠️ No rate set</span>
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
                  <h4 className="text-xs font-bold text-white">Active Rate Agreements</h4>
                  <p className="text-[11px] text-zinc-400">Contract rates with start and expiry dates</p>
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
                <div className="p-8 text-center bg-zinc-950/40 rounded-2xl border border-zinc-800 text-xs text-zinc-500">
                  No rate agreements recorded yet. Add an agreed contract rate to prevent PO price discrepancies.
                </div>
              ) : (
                <div className="space-y-2">
                  {editingSupplier.rates.map((r) => (
                    <div
                      key={r.id}
                      className="p-3 bg-zinc-950/60 border border-zinc-800 rounded-xl flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-white">{r.itemName}</div>
                        <div className="text-[11px] text-zinc-400 mt-0.5">
                          <span>Valid from: {r.validFrom}</span>
                          {r.validTo && <span> to {r.validTo}</span>}
                          {r.notes && <span className="ml-2 text-zinc-500">({r.notes})</span>}
                        </div>
                      </div>
                      <div className="text-base font-mono font-black text-teal-400">
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
                <div className="p-4 bg-zinc-950/80 border border-zinc-800 rounded-xl text-center">
                  <span className="text-[11px] text-zinc-500 font-semibold uppercase">Reliability Score</span>
                  <div className="text-2xl font-black text-amber-400 mt-1">
                    ★ {editingSupplier.reliabilityScore.toFixed(1)}
                  </div>
                  <span className="text-[11px] text-zinc-400">Calculated composite</span>
                </div>
                <div className="p-4 bg-zinc-950/80 border border-zinc-800 rounded-xl text-center">
                  <span className="text-[11px] text-zinc-500 font-semibold uppercase">PO Fill Rate</span>
                  <div className="text-2xl font-black text-emerald-400 mt-1">
                    {editingSupplier.fillRatePct.toFixed(1)}%
                  </div>
                  <span className="text-[11px] text-zinc-400">Delivered vs Ordered</span>
                </div>
                <div className="p-4 bg-zinc-950/80 border border-zinc-800 rounded-xl text-center">
                  <span className="text-[11px] text-zinc-500 font-semibold uppercase">On-Time Delivery</span>
                  <div className="text-2xl font-black text-teal-400 mt-1">
                    {editingSupplier.onTimePct.toFixed(1)}%
                  </div>
                  <span className="text-[11px] text-zinc-400">Within agreed lead time</span>
                </div>
              </div>

              <div className="p-4 bg-zinc-950/40 border border-zinc-800 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white">Historical Shortfall Events</div>
                  <p className="text-[11px] text-zinc-400">
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
          <div className="pt-4 border-t border-zinc-800 flex items-center justify-between">
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
            <label className="block text-xs font-semibold text-zinc-300 mb-1">Item</label>
            <select
              value={newRateItemId}
              onChange={(e) => setNewRateItemId(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500"
            >
              {editingSupplier?.items.map((i) => (
                <option key={i.itemId} value={i.itemId}>
                  {i.itemName} ({i.itemSku})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1">Rate Per Unit (₹)</label>
            <input
              type="number"
              step="any"
              value={newRateValue}
              onChange={(e) => setNewRateValue(e.target.value)}
              placeholder="e.g. 56.50"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1">Valid From</label>
            <input
              type="date"
              value={newRateValidFrom}
              onChange={(e) => setNewRateValidFrom(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500"
            />
          </div>

          <div className="pt-3 border-t border-zinc-800 flex justify-end gap-2">
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
