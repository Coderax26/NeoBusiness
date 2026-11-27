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
  CsvImportModal,
  exportToCsv,
} from '@neo/ui';
import { validateGSTIN, checkDuplicateRecord, formatINR } from '@neo/shared';

export interface CustomerContact {
  id: string;
  name: string;
  phone: string;
  role: string;
  isPrimary: boolean;
}

export interface CustomerRecord {
  id: string;
  code: string;
  businessName: string;
  gstin: string;
  stateCode: string;
  stateName: string;
  billingAddress: string;
  gpsCoords?: string;
  primaryContact: string;
  phone: string;
  whatsappPhone: string;
  whatsappOptIn: boolean;
  defaultSite: string;
  deliveryWindow: 'MORNING' | 'AFTERNOON' | 'EVENING';
  creditLimitRupees: number;
  creditDays: number;
  maxOverdueDays: number;
  creditHold: boolean;
  creditOverrideReason?: string;
  outstandingRupees: number;
  overdueDays: number;
  creditStatus: 'OK' | 'NEAR_LIMIT' | 'HOLD';
  lastOrderDate: string;
  contacts: CustomerContact[];
  active: boolean;
}


export default function CustomerMasterPage() {
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);

  const loadCustomers = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/customers');
      if (!res.ok) return;
      const rows = await res.json();
      if (!Array.isArray(rows)) return;

      const mapped: CustomerRecord[] = rows.map((c: any) => {
        const limit = Number(c.credit_limit ?? 0);
        const outstanding = Number(c.current_ar_balance ?? 0);
        const creditHoldFlag = Boolean(c.credit_hold);
        const rawWin = String(c.preferred_delivery_window || 'MORNING').toUpperCase();
        const win: CustomerRecord['deliveryWindow'] =
          rawWin === 'AFTERNOON' || rawWin === '13-16'
            ? 'AFTERNOON'
            : rawWin === 'EVENING' || rawWin === '18-21'
              ? 'EVENING'
              : 'MORNING';

        return {
          id: String(c.id),
          code: String(c.customer_code || ''),
          businessName: String(c.business_name || ''),
          gstin: String(c.gstin || ''),
          stateCode: String(c.state_code || '27'),
          stateName: String(c.state_code || '27') === '27' ? 'Maharashtra' : `State ${c.state_code || ''}`,
          billingAddress: String(c.billing_address || ''),
          primaryContact: String(c.contact_person || c.business_name || ''),
          phone: String(c.phone || ''),
          whatsappPhone: String(c.whatsapp_no || c.phone || ''),
          whatsappOptIn: Boolean(c.whatsapp_no || c.phone),
          defaultSite: String(c.default_site_name || 'NeoCore Factory — Mumbai'),
          deliveryWindow: win,
          creditLimitRupees: limit,
          creditDays: Number(c.credit_days ?? 7),
          maxOverdueDays: Number(c.max_overdue_days ?? 15),
          creditHold: creditHoldFlag,
          outstandingRupees: outstanding,
          overdueDays: 0,
          creditStatus: creditHoldFlag
            ? 'HOLD'
            : limit > 0 && outstanding >= limit * 0.9
              ? 'NEAR_LIMIT'
              : 'OK',
          lastOrderDate: c.updated_at
            ? String(c.updated_at).split('T')[0]
            : new Date().toISOString().split('T')[0],
          contacts: [
            {
              id: `c-${c.id}`,
              name: String(c.contact_person || c.business_name || 'Primary Contact'),
              phone: String(c.phone || ''),
              role: 'Primary',
              isPrimary: true,
            },
          ],
          active: c.is_active !== false,
        };
      });
      setCustomers(mapped);
    } catch {
      // ignore network error; fallback remains visible
    }
  }, []);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);
  const [search, setSearch] = useState('');
  const [creditStatusFilter, setCreditStatusFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  // Form modal state
  const [formOpen, setFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerRecord | null>(null);
  const [activeTab, setActiveTab] = useState<'business' | 'contact' | 'credit' | 'contacts'>('business');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Credit limit override tracking
  const [creditOverrideReason, setCreditOverrideReason] = useState('');
  const [originalCreditLimit, setOriginalCreditLimit] = useState(0);

  // Import modal
  const [importOpen, setImportOpen] = useState(false);

  // Form fields
  const [code, setCode] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [gstin, setGstin] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [stateName, setStateName] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [primaryContact, setPrimaryContact] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [whatsappOptIn, setWhatsappOptIn] = useState(true);
  const [defaultSite, setDefaultSite] = useState('Pune Central Depot');
  const [deliveryWindow, setDeliveryWindow] = useState<CustomerRecord['deliveryWindow']>('MORNING');
  const [creditLimitRupees, setCreditLimitRupees] = useState('50000');
  const [creditDays, setCreditDays] = useState('7');
  const [maxOverdueDays, setMaxOverdueDays] = useState('15');
  const [creditHold, setCreditHold] = useState(false);
  const [contacts, setContacts] = useState<CustomerContact[]>([]);

  // New subcontact inputs
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactRole, setNewContactRole] = useState('Manager');

  const openNewForm = () => {
    setEditingCustomer(null);
    setCode(`CUST-${String(customers.length + 1).padStart(3, '0')}`);
    setBusinessName('');
    setGstin('');
    setStateCode('');
    setStateName('');
    setBillingAddress('');
    setPrimaryContact('');
    setPhone('');
    setWhatsappPhone('');
    setWhatsappOptIn(true);
    setDefaultSite('Pune Central Depot');
    setDeliveryWindow('MORNING');
    setCreditLimitRupees('50000');
    setOriginalCreditLimit(50000);
    setCreditOverrideReason('');
    setCreditDays('7');
    setMaxOverdueDays('15');
    setCreditHold(false);
    setContacts([]);
    setFormErrors({});
    setActiveTab('business');
    setFormOpen(true);
  };

  const openEditForm = (cust: CustomerRecord) => {
    setEditingCustomer(cust);
    setCode(cust.code);
    setBusinessName(cust.businessName);
    setGstin(cust.gstin);
    setStateCode(cust.stateCode);
    setStateName(cust.stateName);
    setBillingAddress(cust.billingAddress);
    setPrimaryContact(cust.primaryContact);
    setPhone(cust.phone);
    setWhatsappPhone(cust.whatsappPhone);
    setWhatsappOptIn(cust.whatsappOptIn);
    setDefaultSite(cust.defaultSite);
    setDeliveryWindow(cust.deliveryWindow);
    setCreditLimitRupees(String(cust.creditLimitRupees));
    setOriginalCreditLimit(cust.creditLimitRupees);
    setCreditOverrideReason(cust.creditOverrideReason || '');
    setCreditDays(String(cust.creditDays));
    setMaxOverdueDays(String(cust.maxOverdueDays));
    setCreditHold(cust.creditHold);
    setContacts(cust.contacts || []);
    setFormErrors({});
    setActiveTab('business');
    setFormOpen(true);
  };

  const handleGstinChange = (val: string) => {
    const clean = val.trim().toUpperCase();
    setGstin(clean);
    if (clean.length === 15) {
      const gstinVal = validateGSTIN(clean);
      if (gstinVal.valid) {
        setStateCode(gstinVal.stateCode || '');
        setStateName(gstinVal.stateName || '');
        setFormErrors((prev) => {
          const next = { ...prev };
          delete next.gstin;
          return next;
        });
      } else {
        setFormErrors((prev) => ({ ...prev, gstin: gstinVal.error || 'Invalid GSTIN format' }));
      }
    } else {
      setStateCode('');
      setStateName('');
    }
  };

  const handleAddContact = () => {
    if (!newContactName.trim() || !newContactPhone.trim()) return;
    setContacts((prev) => [
      ...prev,
      {
        id: `c-${Date.now()}`,
        name: newContactName.trim(),
        phone: newContactPhone.trim(),
        role: newContactRole,
        isPrimary: prev.length === 0,
      },
    ]);
    setNewContactName('');
    setNewContactPhone('');
  };

  const handleRemoveContact = (id: string) => {
    setContacts((prev) => prev.filter((c) => c.id !== id));
  };

  const handleSaveCustomer = async () => {
    const errors: Record<string, string> = {};
    if (!code.trim()) errors.code = 'Customer Code is required.';
    if (!businessName.trim()) errors.businessName = 'Business Name is required.';
    if (!phone.trim()) errors.phone = 'Primary phone number is required.';

    // GSTIN check if provided
    if (gstin.trim()) {
      const gstinVal = validateGSTIN(gstin);
      if (!gstinVal.valid) {
        errors.gstin = gstinVal.error || 'Invalid GSTIN.';
      }
    }

    // Phone duplicate check
    const phoneDup = checkDuplicateRecord(customers, 'phone', phone, editingCustomer?.id);
    if (phoneDup.isDuplicate) {
      errors.phone = `Phone "${phone}" already registered with customer "${phoneDup.matchedRecord?.businessName}".`;
    }

    // Credit limit change reason requirement (OD-024)
    const newLimit = parseFloat(creditLimitRupees) || 0;
    if (editingCustomer && newLimit !== originalCreditLimit && !creditOverrideReason.trim()) {
      errors.creditReason = 'A reason is required to modify credit limit (permission: customer.credit_override).';
      setActiveTab('credit');
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      if (errors.code || errors.businessName || errors.gstin) {
        setActiveTab('business');
      } else if (errors.phone) {
        setActiveTab('contact');
      }
      return;
    }

    const preferredDeliveryWindow =
      deliveryWindow === 'AFTERNOON'
        ? '13-16'
        : deliveryWindow === 'EVENING'
          ? '18-21'
          : '10-12';
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    try {
      const isEditingReal = Boolean(editingCustomer && uuidRe.test(editingCustomer.id));
      const endpoint = isEditingReal
        ? `/api/proxy/customers/${editingCustomer!.id}`
        : '/api/proxy/customers';
      const method = isEditingReal ? 'PATCH' : 'POST';
      const bodyPayload = isEditingReal
        ? {
            businessName: businessName.trim(),
            contactPerson: primaryContact.trim() || businessName.trim(),
            phone: phone.trim(),
            whatsappNo: whatsappPhone.trim() || phone.trim(),
            billingAddress: billingAddress.trim() || 'Mumbai',
            gstin: gstin.trim().toUpperCase() || undefined,
            stateCode: (stateCode || '27').slice(0, 2),
            preferredDeliveryWindow,
            isActive: editingCustomer!.active,
          }
        : {
            customerCode: code.trim().toUpperCase(),
            businessName: businessName.trim(),
            contactPerson: primaryContact.trim() || businessName.trim(),
            phone: phone.trim(),
            whatsappNo: whatsappPhone.trim() || phone.trim(),
            billingAddress: billingAddress.trim() || 'Mumbai',
            gstin: gstin.trim().toUpperCase() || undefined,
            stateCode: (stateCode || '27').slice(0, 2),
            creditLimit: Math.round(newLimit),
            creditDays: parseInt(creditDays, 10) || 7,
            maxOverdueDays: parseInt(maxOverdueDays, 10) || 15,
            preferredDeliveryWindow,
            isActive: true,
          };

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });
      const resData = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          resData?.error?.message ||
          (Array.isArray(resData?.message) ? resData.message.join(', ') : resData?.message) ||
          `Failed to save customer (${res.status})`;
        setFormErrors({ businessName: String(msg) });
        setActiveTab('business');
        return;
      }

      await loadCustomers();
      setFormOpen(false);
    } catch {
      setFormErrors({ businessName: 'Unable to reach backend API to save customer.' });
      setActiveTab('business');
    }
  };

  const toggleCustomerActive = (id: string) => {
    setCustomers((prev) =>
      prev.map((c) => (c.id === id ? { ...c, active: !c.active } : c)),
    );
  };

  // KPIs
  const activeCount = customers.filter((c) => c.active).length;
  const holdCount = customers.filter((c) => c.active && (c.creditHold || c.creditStatus === 'HOLD')).length;
  const overLimitCount = customers.filter((c) => c.active && c.outstandingRupees > c.creditLimitRupees).length;
  const overdue30Count = customers.filter((c) => c.active && c.overdueDays > 30).length;

  const filteredCustomers = customers.filter((cust) => {
    if (creditStatusFilter !== 'ALL' && cust.creditStatus !== creditStatusFilter) return false;
    if (statusFilter === 'ACTIVE' && !cust.active) return false;
    if (statusFilter === 'INACTIVE' && cust.active) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        cust.businessName.toLowerCase().includes(q) ||
        cust.code.toLowerCase().includes(q) ||
        cust.phone.includes(q)
      );
    }
    return true;
  });

  const columns: ColumnDef<CustomerRecord>[] = [
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
      id: 'businessName',
      header: 'Business & Contact',
      accessorKey: 'businessName',
      cell: (info) => {
        const cust = info.row.original;
        return (
          <div>
            <Link href={`/sales/customers/${cust.id}`} className="font-bold text-ink text-xs hover:text-action hover:underline">
              {cust.businessName}
            </Link>
            <div className="text-[11px] text-ink-3 flex items-center gap-2 mt-0.5">
              <span>{cust.primaryContact}</span>
              <span>•</span>
              <a
                href={`tel:${cust.phone}`}
                className="text-action hover:underline flex items-center gap-1"
              >
                📞 {cust.phone}
              </a>
              {cust.whatsappOptIn && (
                <a
                  href={`https://wa.me/91${cust.whatsappPhone}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-leaf hover:underline"
                >
                  💬 WA
                </a>
              )}
            </div>
          </div>
        );
      },
    },
    {
      id: 'area',
      header: 'Site / Area',
      accessorKey: 'defaultSite',
      cell: (info) => <span className="text-xs text-ink-2">{info.getValue() as string}</span>,
    },
    {
      id: 'creditLimit',
      header: 'Credit Limit',
      accessorKey: 'creditLimitRupees',
      cell: (info) => (
        <span className="text-xs font-mono font-semibold text-ink">
          {formatINR(info.getValue() as number)}
        </span>
      ),
    },
    {
      id: 'outstanding',
      header: 'Outstanding / Overdue',
      cell: (info) => {
        const cust = info.row.original;
        const isOver = cust.outstandingRupees > cust.creditLimitRupees;
        return (
          <div className="text-xs">
            <span className={`font-mono font-bold ${isOver ? 'text-rose-400' : 'text-ink'}`}>
              {formatINR(cust.outstandingRupees)}
            </span>
            {cust.overdueDays > 0 && (
              <span className="block text-[11px] text-haldi font-medium">
                {cust.overdueDays}d overdue
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: 'creditStatus',
      header: 'Credit Status',
      accessorKey: 'creditStatus',
      cell: (info) => {
        const status = info.getValue() as CustomerRecord['creditStatus'];
        const tone = status === 'OK' ? 'success' : status === 'NEAR_LIMIT' ? 'warning' : 'danger';
        return <Badge tone={tone}>{status === 'NEAR_LIMIT' ? 'Near Limit' : status}</Badge>;
      },
    },
    {
      id: 'actions',
      header: 'Actions',
 cell: (info) => {
 const cust = info.row.original;
 return (
 <div className="flex items-center gap-2">
 <button
 onClick={() => openEditForm(cust)}
 className="text-xs text-action hover:text-action font-medium"
 >
 Edit
 </button>
 <span className="text-zinc-700">|</span>
 <button
 onClick={() => toggleCustomerActive(cust.id)}
 className={`text-xs font-medium ${
 cust.active ?'text-zinc-400 hover:text-rose-400' : 'text-emerald-400 hover:text-emerald-300'
              }`}
            >
              {cust.active ? 'Deactivate' : 'Activate'}
            </button>
          </div>
        );
      },
    },
  ];

  const handleExportCsv = () => {
    exportToCsv(
      'customers-list.csv',
      filteredCustomers,
      [
        { key: 'code', label: 'Customer Code' },
        { key: 'businessName', label: 'Business Name' },
        { key: 'gstin', label: 'GSTIN' },
        { key: 'primaryContact', label: 'Primary Contact' },
        { key: 'phone', label: 'Phone' },
        { key: 'defaultSite', label: 'Site' },
        { key: (c) => `₹${c.creditLimitRupees}`, label: 'Credit Limit' },
        { key: (c) => `₹${c.outstandingRupees}`, label: 'Outstanding' },
        { key: (c) => `${c.overdueDays} days`, label: 'Overdue Days' },
        { key: 'creditStatus', label: 'Credit Status' },
        { key: (c) => (c.active ? 'Active' : 'Inactive'), label: 'Status' },
      ],
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-rule pb-5">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-action/10 text-action border border-action/30 mb-1.5">
            <span>👥 Buyer Accounts</span>
          </div>
          <h1 className="text-2xl font-semibold text-ink">Customer Master Directory</h1>
          <p className="text-xs text-ink-3 mt-0.5">
            Maintain customer business profiles, verified GSTINs, credit limits, contacts, and delivery terms.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
            📥 Import Customers (CSV)
          </Button>
          <Button variant="secondary" size="sm" onClick={handleExportCsv}>
            📤 Export CSV
          </Button>
          <Button variant="primary" size="sm" onClick={openNewForm}>
            + Add New Customer
          </Button>
        </div>
      </div>

      {/* 2. KPI Strip (§4.1) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Active Customers"
          value={String(activeCount)}
          subtitle="Ready to place orders"
          tone="default"
        />
        <KpiCard
          title="On Credit Hold"
          value={String(holdCount)}
          subtitle="Orders require credit release"
          tone={holdCount > 0 ? 'danger' : 'success'}
        />
        <KpiCard
          title="Over Credit Limit"
          value={String(overLimitCount)}
          subtitle="Outstanding > approved limit"
          tone={overLimitCount > 0 ? 'warning' : 'success'}
        />
        <KpiCard
          title="Overdue > 30 Days"
          value={String(overdue30Count)}
          subtitle="High collection priority"
          tone={overdue30Count > 0 ? 'danger' : 'success'}
        />
      </div>

      {/* 3. Filters & View Toggle */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-sheet border border-rule p-4 rounded-[4px]">
        <div className="flex items-center gap-3 flex-1 flex-wrap">
          <input
            type="text"
            placeholder="Search by name, code, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full md:w-80 bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink placeholder-ink-3 focus:outline-none focus:border-action/30"
          />
          <select
            value={creditStatusFilter}
            onChange={(e) => setCreditStatusFilter(e.target.value)}
            className="bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink-2 focus:outline-none focus:border-action/30"
          >
            <option value="ALL">All Credit Status</option>
            <option value="OK">OK (Within Limit)</option>
            <option value="NEAR_LIMIT">Near Limit</option>
            <option value="HOLD">Credit Hold</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink-2 focus:outline-none focus:border-action/30"
          >
            <option value="ALL">All Status</option>
            <option value="ACTIVE">Active Only</option>
            <option value="INACTIVE">Inactive Only</option>
          </select>
        </div>

        {/* Tablet / Owner View Toggle (§4.1) */}
        <div className="flex items-center gap-1 bg-paper p-1 rounded-[3px] border border-rule">
          <button
            onClick={() => setViewMode('table')}
            className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
              viewMode === 'table' ? 'bg-sunken text-ink font-bold' : 'text-ink-3 hover:text-ink'
            }`}
          >
            📋 Table
          </button>
          <button
            onClick={() => setViewMode('cards')}
            className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
              viewMode === 'cards' ? 'bg-sunken text-ink font-bold' : 'text-ink-3 hover:text-ink'
            }`}
          >
            🗂️ Cards
          </button>
        </div>
      </div>

      {/* 4. Display: Table or Card View */}
      {viewMode === 'table' ? (
        <DataTable columns={columns} data={filteredCustomers} pageSize={10} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCustomers.map((cust) => (
            <div
              key={cust.id}
              className="bg-sheet border border-rule rounded-[4px] p-5 space-y-4 hover:border-rule-strong transition-all shadow-md"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="font-mono text-xs font-bold text-action">{cust.code}</span>
                  <h3 className="text-sm font-bold text-ink mt-0.5">{cust.businessName}</h3>
                  <p className="text-xs text-ink-3">{cust.primaryContact}</p>
                </div>
                <Badge
                  tone={cust.creditStatus === 'OK' ? 'success' : cust.creditStatus === 'NEAR_LIMIT' ? 'warning' : 'danger'}
                >
                  {cust.creditStatus === 'NEAR_LIMIT' ? 'Near Limit' : cust.creditStatus}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-rule">
                <div>
                  <span className="text-ink-3 block text-[11px]">Credit Limit</span>
                  <span className="font-mono font-bold text-ink">
                    ₹{cust.creditLimitRupees.toLocaleString('en-IN')}
                  </span>
                </div>
                <div>
                  <span className="text-ink-3 block text-[11px]">Outstanding</span>
                  <span className={`font-mono font-bold ${cust.outstandingRupees > cust.creditLimitRupees ? 'text-rose-400' : 'text-ink'}`}>
                    ₹{cust.outstandingRupees.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-rule text-xs">
                <a
                  href={`tel:${cust.phone}`}
                  className="text-action hover:underline flex items-center gap-1 font-medium"
                >
                  📞 {cust.phone}
                </a>
                <button
                  onClick={() => openEditForm(cust)}
                  className="px-2.5 py-1 bg-sunken hover:bg-sunken text-ink rounded-lg text-xs font-semibold"
                >
                  Edit Profile →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 5. Customer Form Modal (§4.2) */}
      <Dialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingCustomer ? `Edit Customer: ${editingCustomer.code}` : 'Add New Customer Profile'}
        maxWidth="lg"
      >
        <div className="space-y-5 my-2">
          {/* Tab Navigation */}
          <div className="flex border-b border-rule text-xs font-semibold gap-4 overflow-x-auto">
            <button
              onClick={() => setActiveTab('business')}
              className={`pb-2 border-b-2 transition-colors ${
                activeTab === 'business' ? 'border-action/30 text-action' : 'border-transparent text-ink-3 hover:text-ink'
              }`}
            >
              Business & GSTIN
            </button>
            <button
              onClick={() => setActiveTab('contact')}
              className={`pb-2 border-b-2 transition-colors ${
                activeTab === 'contact' ? 'border-action/30 text-action' : 'border-transparent text-ink-3 hover:text-ink'
              }`}
            >
              Contact & Delivery
            </button>
            <button
              onClick={() => setActiveTab('credit')}
              className={`pb-2 border-b-2 transition-colors ${
                activeTab === 'credit' ? 'border-action/30 text-action' : 'border-transparent text-ink-3 hover:text-ink'
              }`}
            >
              Credit & Payment Terms
            </button>
            <button
              onClick={() => setActiveTab('contacts')}
              className={`pb-2 border-b-2 transition-colors ${
                activeTab === 'contacts' ? 'border-action/30 text-action' : 'border-transparent text-ink-3 hover:text-ink'
              }`}
            >
              Key Contacts ({contacts.length})
            </button>
          </div>

          {/* Tab 1: Business & GSTIN */}
          {activeTab === 'business' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-ink-2 mb-1">Customer Code *</label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="e.g. CUST-005"
                    className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink font-mono uppercase focus:outline-none focus:border-action/30"
                  />
                  {formErrors.code && <p className="text-xs text-madder mt-1">{formErrors.code}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-2 mb-1">Business Name *</label>
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="e.g. Krishna Dairy Parlour"
                    className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink focus:outline-none focus:border-action/30"
                  />
                  {formErrors.businessName && <p className="text-xs text-madder mt-1">{formErrors.businessName}</p>}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-2 mb-1">GSTIN (15 Characters)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={gstin}
                    onChange={(e) => handleGstinChange(e.target.value)}
                    placeholder="e.g. 27AABCS1429B1ZB"
                    className="flex-1 bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink font-mono uppercase focus:outline-none focus:border-action/30"
                  />
                  {stateName && (
                    <div className="px-3 py-2 bg-action/10 border border-action/30 rounded-[3px] text-xs text-action font-semibold flex items-center">
                      State: {stateName} ({stateCode})
                    </div>
                  )}
                </div>
                {formErrors.gstin && <p className="text-xs text-madder mt-1">{formErrors.gstin}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-2 mb-1">Billing Address</label>
                <textarea
                  value={billingAddress}
                  onChange={(e) => setBillingAddress(e.target.value)}
                  rows={2}
                  placeholder="Street address, landmark, PIN code"
                  className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink focus:outline-none focus:border-action/30"
                />
              </div>
            </div>
          )}

          {/* Tab 2: Contact & Delivery */}
          {activeTab === 'contact'&& (
 <div className="space-y-4">
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <div>
 <label className="block text-xs font-semibold text-ink-2 mb-1">Primary Contact Person</label>
 <input
 type="text"
 value={primaryContact}
 onChange={(e) => setPrimaryContact(e.target.value)}
 placeholder="e.g. Ramesh Sharma"
 className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink focus:outline-none focus:border-action/30"
 />
 </div>
 <div>
 <label className="block text-xs font-semibold text-ink-2 mb-1">Phone Number (10 digits) *</label>
 <input
 type="text"
 value={phone}
 onChange={(e) => setPhone(e.target.value)}
 placeholder="e.g. 9822012345"
 className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink font-mono focus:outline-none focus:border-action/30"
 />
 {formErrors.phone && <p className="text-xs text-madder mt-1">{formErrors.phone}</p>}
 </div>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <div>
 <label className="block text-xs font-semibold text-ink-2 mb-1">WhatsApp Number</label>
 <input
 type="text"
 value={whatsappPhone}
 onChange={(e) => setWhatsappPhone(e.target.value)}
 placeholder="Same as phone if empty"
 className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink font-mono focus:outline-none focus:border-action/30"
 />
 </div>
 <div className="flex items-center pt-6">
 <label className="flex items-center gap-2 cursor-pointer text-xs text-ink-2">
 <input
 type="checkbox"
 checked={whatsappOptIn}
 onChange={(e) => setWhatsappOptIn(e.target.checked)}
 className="rounded border-rule-strong bg-sheet text-teal-600 focus:ring-action"
 />
 <span>Opt-in for automated WhatsApp invoices &amp; dispatch updates</span>
 </label>
 </div>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <div>
 <label className="block text-xs font-semibold text-ink-2 mb-1">Default Fulfilment Site</label>
 <select
 value={defaultSite}
 onChange={(e) => setDefaultSite(e.target.value)}
 className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink focus:outline-none focus:border-action/30"
 >
 <option value="Pune Central Depot">Pune Central Depot</option>
 <option value="Baner Transit Depot">Baner Transit Depot</option>
 <option value="Hadapsar Warehouse">Hadapsar Warehouse</option>
 </select>
 </div>
 <div>
 <label className="block text-xs font-semibold text-ink-2 mb-1">Preferred Delivery Window</label>
 <select
 value={deliveryWindow}
 onChange={(e) => setDeliveryWindow(e.target.value as CustomerRecord['deliveryWindow'])}
                    className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink focus:outline-none focus:border-action/30"
                  >
                    <option value="MORNING">Morning Slot (4:00 AM - 8:00 AM)</option>
                    <option value="AFTERNOON">Afternoon Slot (1:00 PM - 4:00 PM)</option>
                    <option value="EVENING">Evening Slot (6:00 PM - 9:00 PM)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Credit & Payment Terms */}
          {activeTab === 'credit' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-ink-2 mb-1">Credit Limit (₹)</label>
                  <input
                    type="number"
                    value={creditLimitRupees}
                    onChange={(e) => setCreditLimitRupees(e.target.value)}
                    className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink font-mono focus:outline-none focus:border-action/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-2 mb-1">Credit Days</label>
                  <input
                    type="number"
                    value={creditDays}
                    onChange={(e) => setCreditDays(e.target.value)}
                    className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink font-mono focus:outline-none focus:border-action/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-2 mb-1">Max Overdue Days</label>
                  <input
                    type="number"
                    value={maxOverdueDays}
                    onChange={(e) => setMaxOverdueDays(e.target.value)}
                    className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink font-mono focus:outline-none focus:border-action/30"
                  />
                </div>
              </div>

              {/* Credit Limit Override Reason (OD-024) */}
              {editingCustomer && parseFloat(creditLimitRupees) !== originalCreditLimit && (
                <div className="p-4 bg-haldi-soft border border-haldi/30 rounded-[4px] space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-haldi font-bold text-xs">⚠️ Credit Limit Modification Detected</span>
                  </div>
                  <p className="text-xs text-haldi">
                    Modifying credit limit from ₹{originalCreditLimit.toLocaleString('en-IN')} to ₹{parseFloat(creditLimitRupees).toLocaleString('en-IN')} requires permission <code>customer.credit_override</code> and a mandatory audit reason.
                  </p>
                  <textarea
                    value={creditOverrideReason}
                    onChange={(e) => {
                      setCreditOverrideReason(e.target.value);
                      setFormErrors((prev) => {
                        const next = { ...prev };
                        delete next.creditReason;
                        return next;
                      });
                    }}
                    rows={2}
                    placeholder="Enter business reason for credit limit modification..."
                    className="w-full bg-paper border border-haldi/30 rounded-[3px] px-3 py-2 text-xs text-ink focus:outline-none focus:border-amber-400"
                  />
                  {formErrors.creditReason && (
                    <p className="text-xs text-madder font-semibold">{formErrors.creditReason}</p>
                  )}
                </div>
              )}

              <div className="p-3 bg-paper rounded-[3px] border border-rule flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-ink">Manual Credit Hold</div>
                  <p className="text-[11px] text-ink-3">
                    When active, new orders are blocked from dispatch until released by Owner.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={creditHold}
                    onChange={(e) => setCreditHold(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-sunken peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-madder"></div>
                </label>
              </div>

              {/* Price tier placeholder per OD-024 */}
              <div className="p-3 bg-paper rounded-[3px] border border-rule text-xs text-ink-3">
                🔒 Custom Price Tier Assignment (OD-024 deferred — default base category pricing applies).
              </div>
            </div>
          )}

          {/* Tab 4: Key Contacts */}
          {activeTab === 'contacts' && (
            <div className="space-y-4">
              <div className="p-4 bg-paper rounded-[4px] border border-rule space-y-3">
                <div className="text-xs font-bold text-ink">Add Secondary Contact / Store Manager</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="text"
                    placeholder="Contact Name"
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    className="bg-sheet border border-rule rounded-[3px] px-3 py-1.5 text-xs text-ink focus:outline-none focus:border-action/30"
                  />
                  <input
                    type="text"
                    placeholder="Phone"
                    value={newContactPhone}
                    onChange={(e) => setNewContactPhone(e.target.value)}
                    className="bg-sheet border border-rule rounded-[3px] px-3 py-1.5 text-xs text-ink font-mono focus:outline-none focus:border-action/30"
                  />
                  <div className="flex gap-2">
                    <select
                      value={newContactRole}
                      onChange={(e) => setNewContactRole(e.target.value)}
                      className="bg-sheet border border-rule rounded-[3px] px-3 py-1.5 text-xs text-ink-2 focus:outline-none focus:border-action/30"
                    >
                      <option value="Manager">Manager</option>
                      <option value="Accountant">Accountant</option>
                      <option value="Partner">Partner</option>
                      <option value="Delivery Gate">Delivery Gate</option>
                    </select>
                    <Button variant="secondary" size="sm" onClick={handleAddContact}>
                      + Add
                    </Button>
                  </div>
                </div>
              </div>

              {contacts.length === 0 ? (
                <p className="text-xs text-ink-3 text-center py-4">No additional contacts configured.</p>
              ) : (
                <div className="space-y-2">
                  {contacts.map((c) => (
                    <div
                      key={c.id}
                      className="p-3 bg-sheet border border-rule rounded-[3px] flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-bold text-ink">{c.name}</span>
                        <span className="text-ink-3 ml-2">({c.role})</span>
                        {c.isPrimary && (
                          <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-action/20 text-action font-semibold">
                            Primary
                          </span>
                        )}
                        <span className="block text-ink-3 font-mono mt-0.5">📞 {c.phone}</span>
                      </div>
                      <button
                        onClick={() => handleRemoveContact(c.id)}
                        className="text-xs text-madder hover:text-madder"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Modal Footer */}
          <div className="pt-4 border-t border-rule flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSaveCustomer}>
              {editingCustomer ? 'Save Customer Profile' : 'Create Customer'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* 6. CSV Import Modal (§8, F3-06) */}
      <CsvImportModal<Partial<CustomerRecord>>
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Customer Accounts via CSV"
        entityName="Customer"
        expectedHeaders={[
          { key: 'code', label: 'Code', required: true, example: 'CUST-009' },
          { key: 'businessName', label: 'Business Name', required: true, example: 'Royal Sweet Centre' },
          { key: 'phone', label: 'Phone', required: true, example: '9822155443' },
          { key: 'gstin', label: 'GSTIN', required: false, example: '27AABCS1429B1ZB' },
          { key: 'creditLimitRupees', label: 'Credit Limit', required: false, example: '50000' },
          { key: 'creditDays', label: 'Credit Days', required: false, example: '7' },
        ]}
        validator={(row) => {
          const errors: string[] = [];
          if (!row.code) errors.push('Missing Code');
          if (!row.businessName) errors.push('Missing Business Name');
          if (!row.phone) errors.push('Missing Phone Number');
          if (row.gstin) {
            const gstinVal = validateGSTIN(row.gstin);
            if (!gstinVal.valid) {
              errors.push(gstinVal.error || 'Invalid GSTIN');
            }
          }
          const isValid = errors.length === 0;
          return {
            isValid,
            errors,
            parsed: {
              id: `cust-csv-${Date.now()}-${Math.random()}`,
              code: row.code?.toUpperCase(),
              businessName: row.businessName,
              phone: row.phone,
              whatsappPhone: row.phone,
              whatsappOptIn: true,
              gstin: row.gstin?.toUpperCase() || '',
              stateCode: row.gstin ? row.gstin.slice(0, 2) : '27',
              stateName: 'Maharashtra',
              billingAddress: '',
              primaryContact: row.businessName,
              defaultSite: 'Pune Central Depot',
              deliveryWindow: 'MORNING',
              creditLimitRupees: parseFloat(row.creditLimitRupees || '0') || 0,
              creditDays: parseInt(row.creditDays || '7', 10) || 7,
              maxOverdueDays: 15,
              creditHold: false,
              outstandingRupees: 0,
              overdueDays: 0,
              creditStatus: 'OK',
              lastOrderDate: new Date().toISOString().split('T')[0],
              contacts: [],
              active: true,
            },
          };
        }}
        onImport={async (validRows) => {
          setCustomers((prev) => [...(validRows as CustomerRecord[]), ...prev]);
          return { importedCount: validRows.length, skippedCount: 0 };
        }}
      />
    </div>
  );
}
