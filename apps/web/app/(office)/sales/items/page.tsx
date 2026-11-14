'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
import { checkDuplicateRecord } from '@neo/shared';

export interface ItemRecord {
  id: string;
  sku: string;
  name: string;
  category: 'RAW_MATERIAL' | 'PROCESSED_FG' | 'TRADED_GOOD';
  primaryUom: string;
  secondaryUom?: string;
  conversionFactor?: number; // e.g. 1 crate = 20.3 kg
  isCatchWeight: boolean;
  hsnCode: string;
  gstRate: number; // e.g. 5, 12, 18
  taxTreatment: 'TAXABLE' | 'EXEMPT' | 'NIL_RATED' | 'NON_GST';
  minMarginPct: number; // e.g. 15
  shelfLifeDays: number;
  minStockQty: number;
  currentStock: number;
  todayPrice?: number;
  active: boolean;
}

const INITIAL_ITEMS: ItemRecord[] = [
  {
    id: 'itm-1',
    sku: 'FG-PANEER-200G',
    name: 'Fresh Malai Paneer 200g Pack',
    category: 'PROCESSED_FG',
    primaryUom: 'pcs',
    secondaryUom: 'crates',
    conversionFactor: 24, // 1 crate = 24 pcs
    isCatchWeight: false,
    hsnCode: '04061000',
    gstRate: 5,
    taxTreatment: 'TAXABLE',
    minMarginPct: 18,
    shelfLifeDays: 14,
    minStockQty: 200,
    currentStock: 450,
    todayPrice: 85,
    active: true,
  },
  {
    id: 'itm-2',
    sku: 'FG-CURD-500G',
    name: 'Farm Fresh Set Curd 500g Tub',
    category: 'PROCESSED_FG',
    primaryUom: 'pcs',
    secondaryUom: 'crates',
    conversionFactor: 20, // 1 crate = 20 pcs
    isCatchWeight: false,
    hsnCode: '04031000',
    gstRate: 5,
    taxTreatment: 'TAXABLE',
    minMarginPct: 15,
    shelfLifeDays: 10,
    minStockQty: 300,
    currentStock: 120, // Low stock
    todayPrice: 42,
    active: true,
  },
  {
    id: 'itm-3',
    sku: 'RM-RAW-MILK',
    name: 'Raw Chilled Buffalo Milk (6.5% Fat)',
    category: 'RAW_MATERIAL',
    primaryUom: 'litres',
    secondaryUom: 'cans',
    conversionFactor: 40, // 1 can = 40 litres
    isCatchWeight: true,
    hsnCode: '04012000',
    gstRate: 0,
    taxTreatment: 'EXEMPT',
    minMarginPct: 0,
    shelfLifeDays: 2,
    minStockQty: 1000,
    currentStock: 2400,
    todayPrice: 58,
    active: true,
  },
  {
    id: 'itm-4',
    sku: 'TR-BUTTER-500G',
    name: 'Salted Dairy Butter 500g Brick',
    category: 'TRADED_GOOD',
    primaryUom: 'pcs',
    secondaryUom: 'boxes',
    conversionFactor: 30,
    isCatchWeight: false,
    hsnCode: '04051000',
    gstRate: 12,
    taxTreatment: 'TAXABLE',
    minMarginPct: 12,
    shelfLifeDays: 90,
    minStockQty: 50,
    currentStock: 80,
    todayPrice: undefined, // Missing today's price
    active: true,
  },
  {
    id: 'itm-5',
    sku: 'FG-GHEE-1L',
    name: 'Pure Desi Danedar Ghee 1L Tin',
    category: 'PROCESSED_FG',
    primaryUom: 'tins',
    secondaryUom: 'cartons',
    conversionFactor: 12,
    isCatchWeight: false,
    hsnCode: '04059010',
    gstRate: 12,
    taxTreatment: 'TAXABLE',
    minMarginPct: 20,
    shelfLifeDays: 180,
    minStockQty: 100,
    currentStock: 340,
    todayPrice: 620,
    active: true,
  },
];

export default function ItemMasterPage() {
  const [items, setItems] = useState<ItemRecord[]>(INITIAL_ITEMS);

  const loadItems = useCallback(async () => {
    try {
      const [itemsRes, pricesRes] = await Promise.all([
        fetch('/api/proxy/items'),
        fetch('/api/proxy/prices/today').catch(() => null),
      ]);
      if (!itemsRes.ok) return;
      const rows = await itemsRes.json();
      if (!Array.isArray(rows) || rows.length === 0) return;

      const priceMap = new Map<string, number>();
      if (pricesRes && pricesRes.ok) {
        const prices = await pricesRes.json().catch(() => []);
        if (Array.isArray(prices)) {
          for (const p of prices) {
            if (p.itemId && p.targetPrice != null) {
              priceMap.set(String(p.itemId), Number(p.targetPrice));
            }
          }
        }
      }

      const mapped: ItemRecord[] = rows.map((i: any) => ({
        id: String(i.id),
        sku: String(i.sku_code || ''),
        name: String(i.name || ''),
        category:
          i.item_category === 'RAW_MATERIAL' ||
          i.item_category === 'PROCESSED_FG' ||
          i.item_category === 'TRADED_GOOD'
            ? i.item_category
            : 'TRADED_GOOD',
        primaryUom: String(i.primary_uom || 'KG').toLowerCase(),
        secondaryUom: i.secondary_uom ? String(i.secondary_uom).toLowerCase() : undefined,
        conversionFactor: i.standard_weight_per_secondary_kg
          ? Number(i.standard_weight_per_secondary_kg)
          : 1,
        isCatchWeight: Boolean(i.is_catch_weight),
        hsnCode: String(i.hsn_code || ''),
        gstRate: i.tax_rate_pct != null ? Number(i.tax_rate_pct) * 100 : 5,
        taxTreatment:
          i.tax_treatment === 'EXEMPT' ||
          i.tax_treatment === 'NIL_RATED' ||
          i.tax_treatment === 'NON_GST'
            ? i.tax_treatment
            : 'TAXABLE',
        minMarginPct: i.min_margin_pct != null ? Number(i.min_margin_pct) * 100 : 15,
        shelfLifeDays: Number(i.shelf_life_days ?? 14),
        minStockQty: Number(i.min_stock_qty ?? 0),
        currentStock: 0,
        todayPrice: priceMap.get(String(i.id)),
        active: i.is_active !== false,
      }));
      setItems(mapped);
    } catch {
      // ignore network error; fallback remains visible
    }
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [lowStockFilter, setLowStockFilter] = useState(false);

  // Form modal state
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemRecord | null>(null);
  const [activeTab, setActiveTab] = useState<'basics' | 'units' | 'tax' | 'pricing' | 'stock' | 'recipe'>('basics');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Import modal state
  const [importOpen, setImportOpen] = useState(false);

  // Form field state
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ItemRecord['category']>('PROCESSED_FG');
  const [primaryUom, setPrimaryUom] = useState('pcs');
  const [secondaryUom, setSecondaryUom] = useState('crates');
  const [conversionFactor, setConversionFactor] = useState('20');
  const [isCatchWeight, setIsCatchWeight] = useState(false);
  const [hsnCode, setHsnCode] = useState('04061000');
  const [gstRate, setGstRate] = useState('5');
  const [taxTreatment, setTaxTreatment] = useState<ItemRecord['taxTreatment']>('TAXABLE');
  const [minMarginPct, setMinMarginPct] = useState('15');
  const [shelfLifeDays, setShelfLifeDays] = useState('14');
  const [minStockQty, setMinStockQty] = useState('100');

  const openNewForm = () => {
    setEditingItem(null);
    setSku(`FG-${Math.floor(1000 + Math.random() * 9000)}`);
    setName('');
    setCategory('PROCESSED_FG');
    setPrimaryUom('pcs');
    setSecondaryUom('crates');
    setConversionFactor('20');
    setIsCatchWeight(false);
    setHsnCode('04061000');
    setGstRate('5');
    setTaxTreatment('TAXABLE');
    setMinMarginPct('15');
    setShelfLifeDays('14');
    setMinStockQty('100');
    setFormErrors({});
    setActiveTab('basics');
    setFormOpen(true);
  };

  const openEditForm = (item: ItemRecord) => {
    setEditingItem(item);
    setSku(item.sku);
    setName(item.name);
    setCategory(item.category);
    setPrimaryUom(item.primaryUom);
    setSecondaryUom(item.secondaryUom || 'crates');
    setConversionFactor(item.conversionFactor ? String(item.conversionFactor) : '1');
    setIsCatchWeight(item.isCatchWeight);
    setHsnCode(item.hsnCode);
    setGstRate(String(item.gstRate));
    setTaxTreatment(item.taxTreatment);
    setMinMarginPct(String(item.minMarginPct));
    setShelfLifeDays(String(item.shelfLifeDays));
    setMinStockQty(String(item.minStockQty));
    setFormErrors({});
    setActiveTab('basics');
    setFormOpen(true);
  };

  const normalizeApiUom = (val: string): 'KG' | 'CRATE' | 'CARTON' | 'LITER' | 'BAG' | 'OTHER' => {
    const u = val.trim().toUpperCase();
    if (u === 'KG' || u === 'CRATE' || u === 'CARTON' || u === 'LITER' || u === 'BAG') return u;
    if (u === 'CRATES') return 'CRATE';
    if (u === 'CARTONS') return 'CARTON';
    if (u === 'LITERS' || u === 'LTR' || u === 'L') return 'LITER';
    return 'OTHER';
  };

  const handleSaveItem = async (addAnother = false) => {
    const errors: Record<string, string> = {};
    if (!sku.trim()) errors.sku = 'SKU Code is required.';
    if (!name.trim()) errors.name = 'Item Name is required.';
    if (!primaryUom.trim()) errors.primaryUom = 'Primary UoM is required.';

    // Check duplicate SKU
    const dupCheck = checkDuplicateRecord(items, 'sku', sku, editingItem?.id);
    if (dupCheck.isDuplicate) {
      errors.sku = `SKU "${sku}" is already assigned to "${dupCheck.matchedRecord?.name}".`;
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      setActiveTab('basics');
      return;
    }

    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isEditingReal = Boolean(editingItem && uuidRe.test(editingItem.id));
    const parsedMargin = Math.min(1, Math.max(0, Number(((parseFloat(minMarginPct) || 0) / 100).toFixed(2))));
    const parsedTax = Math.max(0, Number(((parseFloat(gstRate) || 0) / 100).toFixed(4)));
    const parsedShelfLife = Math.max(1, parseInt(shelfLifeDays, 10) || 14);

    try {
      const endpoint = isEditingReal
        ? `/api/proxy/items/${editingItem!.id}`
        : '/api/proxy/items';
      const method = isEditingReal ? 'PATCH' : 'POST';
      const bodyPayload = isEditingReal
        ? {
            name: name.trim(),
            itemCategory: category,
            primaryUom: normalizeApiUom(primaryUom),
            secondaryUom: secondaryUom.trim() ? normalizeApiUom(secondaryUom) : undefined,
            shelfLifeDays: parsedShelfLife,
            taxRatePct: parsedTax,
            hsnCode: hsnCode.trim() || undefined,
            isCatchWeight,
            minMarginPct: parsedMargin,
            taxTreatment,
          }
        : {
            skuCode: sku.trim().toUpperCase(),
            name: name.trim(),
            itemCategory: category,
            primaryUom: normalizeApiUom(primaryUom),
            secondaryUom: secondaryUom.trim() ? normalizeApiUom(secondaryUom) : undefined,
            shelfLifeDays: parsedShelfLife,
            taxRatePct: parsedTax,
            hsnCode: hsnCode.trim() || undefined,
            isCatchWeight,
            minMarginPct: parsedMargin,
            taxTreatment,
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
          `Failed to save item (${res.status})`;
        setFormErrors({ name: String(msg) });
        setActiveTab('basics');
        return;
      }

      await loadItems();
      if (addAnother) {
        openNewForm();
      } else {
        setFormOpen(false);
      }
    } catch {
      setFormErrors({ name: 'Unable to reach backend API to save item.' });
      setActiveTab('basics');
    }
  };

  const toggleItemActive = (id: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, active: !i.active } : i)),
    );
  };

  // KPIs
  const activeCount = items.filter((i) => i.active).length;
  const missingPriceCount = items.filter((i) => i.active && i.todayPrice === undefined).length;
  const lowStockCount = items.filter((i) => i.currentStock <= i.minStockQty).length;
  const expiringSoonCount = items.filter((i) => i.shelfLifeDays <= 3).length;

  // Filtered items
  const filteredItems = items.filter((item) => {
    if (categoryFilter !== 'ALL' && item.category !== categoryFilter) return false;
    if (statusFilter === 'ACTIVE' && !item.active) return false;
    if (statusFilter === 'INACTIVE' && item.active) return false;
    if (lowStockFilter && item.currentStock > item.minStockQty) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return item.name.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q);
    }
    return true;
  });

  const columns: ColumnDef<ItemRecord>[] = [
    {
      id: 'sku',
      header: 'SKU / Code',
      accessorKey: 'sku',
      cell: (info) => (
        <span className="font-mono text-xs font-bold text-teal-400">
          {info.getValue() as string}
        </span>
      ),
    },
    {
      id: 'name',
      header: 'Item Name & Description',
      accessorKey: 'name',
      cell: (info) => {
        const item = info.row.original;
        return (
          <div>
            <div className="font-bold text-white text-xs">{item.name}</div>
            <div className="text-[11px] text-zinc-400 flex items-center gap-2 mt-0.5">
              <span>HSN: {item.hsnCode}</span>
              <span>•</span>
              <span>GST {item.gstRate}%</span>
              {item.isCatchWeight && (
                <span className="text-amber-400 font-semibold">• Catch Weight</span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      id: 'category',
      header: 'Category',
      accessorKey: 'category',
      cell: (info) => {
        const cat = info.getValue() as string;
        const tone = cat === 'PROCESSED_FG' ? 'brand' : cat === 'RAW_MATERIAL' ? 'warning' : 'neutral';
        return <Badge tone={tone}>{cat.replace('_', ' ')}</Badge>;
      },
    },
    {
      id: 'uom',
      header: 'Units (UoM)',
      cell: (info) => {
        const item = info.row.original;
        return (
          <div className="text-xs">
            <span className="font-semibold text-zinc-200">{item.primaryUom}</span>
            {item.secondaryUom && (
              <span className="text-zinc-500 block text-[11px]">
                1 {item.secondaryUom} = {item.conversionFactor} {item.primaryUom}
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: 'stock',
      header: 'Current Stock',
      accessorKey: 'currentStock',
      cell: (info) => {
        const item = info.row.original;
        const isLow = item.currentStock <= item.minStockQty;
        return (
          <div className="text-xs">
            <span className={`font-mono font-bold ${isLow ? 'text-rose-400' : 'text-emerald-400'}`}>
              {item.currentStock} {item.primaryUom}
            </span>
            {isLow && (
              <span className="block text-[10px] text-rose-400 font-medium">Low stock</span>
            )}
          </div>
        );
      },
    },
    {
      id: 'price',
      header: "Today's Price",
      accessorKey: 'todayPrice',
      cell: (info) => {
        const price = info.getValue() as number | undefined;
        if (price === undefined) {
          return <span className="text-xs text-amber-400 font-semibold">⚠️ Unpriced</span>;
        }
        return <span className="text-xs font-mono font-bold text-white">₹{price.toFixed(2)}</span>;
      },
    },
    {
      id: 'status',
      header: 'Status',
      accessorKey: 'active',
      cell: (info) => {
        const active = info.getValue() as boolean;
        return <StatusPill tone={active ? 'success' : 'neutral'} label={active ? 'Active' : 'Inactive'} />;
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: (info) => {
        const item = info.row.original;
        return (
          <div className="flex items-center gap-2">
            <button
              onClick={() => openEditForm(item)}
              className="text-xs text-teal-400 hover:text-teal-300 font-medium"
            >
              Edit
            </button>
            <span className="text-zinc-700">|</span>
            <button
              onClick={() => toggleItemActive(item.id)}
              className={`text-xs font-medium ${item.active ? 'text-zinc-400 hover:text-rose-400' : 'text-emerald-400 hover:text-emerald-300'}`}
            >
              {item.active ? 'Deactivate' : 'Activate'}
            </button>
          </div>
        );
      },
    },
  ];

  const handleExportCsv = () => {
    exportToCsv(
      'items-catalog.csv',
      filteredItems,
      [
        { key: 'sku', label: 'SKU' },
        { key: 'name', label: 'Item Name' },
        { key: 'category', label: 'Category' },
        { key: 'primaryUom', label: 'Primary UoM' },
        { key: 'secondaryUom', label: 'Secondary UoM' },
        { key: 'conversionFactor', label: 'Conversion Factor' },
        { key: 'hsnCode', label: 'HSN' },
        { key: 'gstRate', label: 'GST %' },
        { key: 'currentStock', label: 'Current Stock' },
        { key: (r) => (r.todayPrice ? `₹${r.todayPrice}` : 'Unpriced'), label: "Today's Price" },
        { key: (r) => (r.active ? 'Active' : 'Inactive'), label: 'Status' },
      ],
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* 1. Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-500/10 text-teal-400 border border-teal-500/30 mb-1.5">
            <span>📦 Catalog Management</span>
          </div>
          <h1 className="text-2xl font-black text-white">Item Master Catalog</h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Manage your finished goods, raw materials, units of measure, tax rates, and stock rules.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
            📥 Import Items (CSV)
          </Button>
          <Button variant="secondary" size="sm" onClick={handleExportCsv}>
            📤 Export CSV
          </Button>
          <Button variant="primary" size="sm" onClick={openNewForm}>
            + Add New Item
          </Button>
        </div>
      </div>

      {/* 2. KPI Strip (§3.1) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Active Catalog Items"
          value={String(activeCount)}
          subtitle="Ready for sales & production"
          tone="default"
        />
        <KpiCard
          title="Missing Today's Price"
          value={String(missingPriceCount)}
          subtitle="Requires morning rate update"
          tone={missingPriceCount > 0 ? 'warning' : 'success'}
        />
        <KpiCard
          title="Low Stock Items"
          value={String(lowStockCount)}
          subtitle="At or below MTS min stock trigger"
          tone={lowStockCount > 0 ? 'danger' : 'success'}
        />
        <KpiCard
          title="Expiring Soon"
          value={String(expiringSoonCount)}
          subtitle="Shelf life under 3 days"
          tone="warning"
        />
      </div>

      {/* 3. Filters & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-zinc-900/60 border border-zinc-800 p-4 rounded-2xl">
        <div className="flex items-center gap-3 flex-1">
          <input
            type="text"
            placeholder="Search by SKU or item name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full md:w-80 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-teal-500"
          />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-teal-500"
          >
            <option value="ALL">All Categories</option>
            <option value="PROCESSED_FG">Processed Goods (FG)</option>
            <option value="RAW_MATERIAL">Raw Materials (RM)</option>
            <option value="TRADED_GOOD">Traded Goods</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-teal-500"
          >
            <option value="ALL">All Status</option>
            <option value="ACTIVE">Active Only</option>
            <option value="INACTIVE">Inactive Only</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setLowStockFilter(!lowStockFilter)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              lowStockFilter
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
            }`}
          >
            ⚠️ Low Stock ({lowStockCount})
          </button>
        </div>
      </div>

      {/* 4. Data Table */}
      <DataTable
        columns={columns}
        data={filteredItems}
        pageSize={10}
      />

      {/* 5. Item Form Modal with Tabs (§3.2) */}
      <Dialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingItem ? `Edit Item: ${editingItem.sku}` : 'Add New Catalog Item'}
        maxWidth="lg"
      >
        <div className="space-y-5 my-2">
          {/* Tab Navigation */}
          <div className="flex border-b border-zinc-800 text-xs font-semibold gap-4 overflow-x-auto">
            <button
              onClick={() => setActiveTab('basics')}
              className={`pb-2 border-b-2 transition-colors ${
                activeTab === 'basics' ? 'border-teal-500 text-teal-400' : 'border-transparent text-zinc-400 hover:text-white'
              }`}
            >
              Basics
            </button>
            <button
              onClick={() => setActiveTab('units')}
              className={`pb-2 border-b-2 transition-colors ${
                activeTab === 'units' ? 'border-teal-500 text-teal-400' : 'border-transparent text-zinc-400 hover:text-white'
              }`}
            >
              Units & UoM Conversion
            </button>
            <button
              onClick={() => setActiveTab('tax')}
              className={`pb-2 border-b-2 transition-colors ${
                activeTab === 'tax' ? 'border-teal-500 text-teal-400' : 'border-transparent text-zinc-400 hover:text-white'
              }`}
            >
              Tax & HSN
            </button>
            <button
              onClick={() => setActiveTab('pricing')}
              className={`pb-2 border-b-2 transition-colors ${
                activeTab === 'pricing' ? 'border-teal-500 text-teal-400' : 'border-transparent text-zinc-400 hover:text-white'
              }`}
            >
              Pricing Rules
            </button>
            <button
              onClick={() => setActiveTab('stock')}
              className={`pb-2 border-b-2 transition-colors ${
                activeTab === 'stock' ? 'border-teal-500 text-teal-400' : 'border-transparent text-zinc-400 hover:text-white'
              }`}
            >
              Stock & Shelf Life
            </button>
            {category === 'PROCESSED_FG' && (
              <button
                onClick={() => setActiveTab('recipe')}
                className={`pb-2 border-b-2 transition-colors ${
                  activeTab === 'recipe' ? 'border-teal-500 text-teal-400' : 'border-transparent text-zinc-400 hover:text-white'
                }`}
              >
                Recipe (BOM)
              </button>
            )}
          </div>

          {/* Tab 1: Basics */}
          {activeTab === 'basics' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">SKU Code *</label>
                  <input
                    type="text"
                    value={sku}
                    onChange={(e) => setSku(e.target.value.toUpperCase())}
                    placeholder="e.g. FG-PANEER-200G"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-mono uppercase focus:outline-none focus:border-teal-500"
                  />
                  {formErrors.sku && <p className="text-xs text-rose-400 mt-1">{formErrors.sku}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">Item Category *</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ItemRecord['category'])}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500"
                  >
                    <option value="PROCESSED_FG">Processed Finished Goods (FG)</option>
                    <option value="RAW_MATERIAL">Raw Material (RM)</option>
                    <option value="TRADED_GOOD">Traded Goods</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">Item Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Fresh Malai Paneer 200g Pack"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500"
                />
                {formErrors.name && <p className="text-xs text-rose-400 mt-1">{formErrors.name}</p>}
              </div>

              <div className="p-3 bg-zinc-950/50 rounded-xl border border-zinc-800 text-xs text-zinc-400">
                ℹ️ We recommend choosing clear naming with package size so customers and drivers distinguish variants easily.
              </div>
            </div>
          )}

          {/* Tab 2: Units & UoM Conversion */}
          {activeTab === 'units' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">Primary Base UoM *</label>
                  <input
                    type="text"
                    value={primaryUom}
                    onChange={(e) => setPrimaryUom(e.target.value)}
                    placeholder="e.g. pcs, kg, litres"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500"
                  />
                  <span className="text-[11px] text-zinc-500">Inventory counts & base pricing use this unit.</span>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">Secondary Packaging UoM</label>
                  <input
                    type="text"
                    value={secondaryUom}
                    onChange={(e) => setSecondaryUom(e.target.value)}
                    placeholder="e.g. crates, boxes, bags"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500"
                  />
                  <span className="text-[11px] text-zinc-500">Delivery trucks load and dispatch in this unit.</span>
                </div>
              </div>

              <div className="p-4 bg-teal-950/20 border border-teal-500/30 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">UoM Conversion Factor</span>
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-300">
                    <input
                      type="checkbox"
                      checked={isCatchWeight}
                      onChange={(e) => setIsCatchWeight(e.target.checked)}
                      className="rounded border-zinc-700 bg-zinc-900 text-teal-600 focus:ring-teal-500"
                    />
                    <span>Catch-weight item (variable weighment)</span>
                  </label>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400">1 {secondaryUom || 'crate'} =</span>
                  <input
                    type="number"
                    step="any"
                    value={conversionFactor}
                    onChange={(e) => setConversionFactor(e.target.value)}
                    className="w-28 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-teal-500"
                  />
                  <span className="text-xs text-zinc-400">{primaryUom || 'kg'}</span>
                </div>

                <div className="p-2.5 bg-zinc-950/60 rounded-xl border border-zinc-800/80 text-xs text-teal-300">
                  Live Preview: <strong>1 {secondaryUom || 'crate'}</strong> equals{' '}
                  <strong>{conversionFactor || '1'} {primaryUom || 'kg'}</strong>. When loading 10 {secondaryUom || 'crates'}, inventory deducts{' '}
                  <strong>{(parseFloat(conversionFactor) || 1) * 10} {primaryUom || 'kg'}</strong>.
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Tax & HSN */}
          {activeTab === 'tax' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">Tax Treatment</label>
                  <select
                    value={taxTreatment}
                    onChange={(e) => setTaxTreatment(e.target.value as ItemRecord['taxTreatment'])}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500"
                  >
                    <option value="TAXABLE">Taxable</option>
                    <option value="EXEMPT">Exempt (0% Nil)</option>
                    <option value="NIL_RATED">Nil Rated</option>
                    <option value="NON_GST">Non-GST</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">GST Rate (%)</label>
                  <select
                    value={gstRate}
                    onChange={(e) => setGstRate(e.target.value)}
                    disabled={taxTreatment !== 'TAXABLE'}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white disabled:opacity-50 focus:outline-none focus:border-teal-500"
                  >
                    <option value="0">0%</option>
                    <option value="5">5% (Common Dairy)</option>
                    <option value="12">12% (Butter/Ghee)</option>
                    <option value="18">18% (Standard)</option>
                    <option value="28">28% (Luxury)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">HSN Code</label>
                  <input
                    type="text"
                    value={hsnCode}
                    onChange={(e) => setHsnCode(e.target.value)}
                    placeholder="e.g. 04061000"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>
              <p className="text-xs text-zinc-400">
                The Harmonized System of Nomenclature (HSN) code is mandatory on tax invoices under Indian GST rules.
              </p>
            </div>
          )}

          {/* Tab 4: Pricing Rules */}
          {activeTab === 'pricing' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">Minimum Margin % (OD-001)</label>
                <input
                  type="number"
                  step="any"
                  value={minMarginPct}
                  onChange={(e) => setMinMarginPct(e.target.value)}
                  className="w-40 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-teal-500"
                />
              </div>
              <div className="p-4 bg-zinc-950/60 rounded-xl border border-zinc-800 text-xs text-zinc-300 space-y-1.5">
                <div className="font-bold text-white">How Floor Price Works:</div>
                <div>Floor Price = Cost of Goods × (1 + {minMarginPct || 0}%).</div>
                <div className="text-zinc-400">
                  Sales orders entered with unit price below this floor trigger a mandatory approval request to the Owner before confirmation.
                </div>
              </div>
            </div>
          )}

          {/* Tab 5: Stock & Shelf Life */}
          {activeTab === 'stock' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">Shelf Life (Days)</label>
                  <input
                    type="number"
                    value={shelfLifeDays}
                    onChange={(e) => setShelfLifeDays(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-teal-500"
                  />
                  <span className="text-[11px] text-zinc-500">Expiring batches will trigger priority dispatch alerts.</span>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">Minimum Stock Trigger (MTS, OD-013)</label>
                  <input
                    type="number"
                    value={minStockQty}
                    onChange={(e) => setMinStockQty(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-teal-500"
                  />
                  <span className="text-[11px] text-zinc-500">Triggers Make-to-Stock work order suggestions when stock breaches this level.</span>
                </div>
              </div>
            </div>
          )}

          {/* Tab 6: Recipe (BOM) */}
          {activeTab === 'recipe' && (
            <div className="p-6 bg-zinc-950/60 border border-zinc-800 rounded-2xl text-center space-y-2">
              <div className="text-3xl">🍲</div>
              <h4 className="text-sm font-bold text-white">Bill of Materials (BOM)</h4>
              <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                Define the standard recipe ingredients (e.g. Milk 10L + Citric Acid 20g = Paneer 1.8kg) in the Production BOM module.
              </p>
            </div>
          )}

          {/* Footer actions */}
          <div className="pt-4 border-t border-zinc-800 flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <div className="flex items-center gap-2">
              {!editingItem && (
                <Button variant="secondary" size="sm" onClick={() => handleSaveItem(true)}>
                  Save & Add Another
                </Button>
              )}
              <Button variant="primary" size="sm" onClick={() => handleSaveItem(false)}>
                {editingItem ? 'Save Changes' : 'Create Item'}
              </Button>
            </div>
          </div>
        </div>
      </Dialog>

      {/* 6. CSV Import Modal (§8, F3-06) */}
      <CsvImportModal<Partial<ItemRecord>>
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Catalog Items via CSV"
        entityName="Item"
        expectedHeaders={[
          { key: 'sku', label: 'SKU', required: true, example: 'FG-PANEER-500G' },
          { key: 'name', label: 'Item Name', required: true, example: 'Fresh Paneer 500g' },
          { key: 'category', label: 'Category', required: true, example: 'PROCESSED_FG' },
          { key: 'primaryUom', label: 'Primary UoM', required: true, example: 'pcs' },
          { key: 'secondaryUom', label: 'Secondary UoM', required: false, example: 'crates' },
          { key: 'conversionFactor', label: 'Conversion Factor', required: false, example: '20' },
          { key: 'hsnCode', label: 'HSN', required: true, example: '04061000' },
          { key: 'gstRate', label: 'GST %', required: true, example: '5' },
        ]}
        validator={(row) => {
          const errors: string[] = [];
          if (!row.sku) errors.push('Missing SKU');
          if (!row.name) errors.push('Missing Item Name');
          if (!row.primaryUom) errors.push('Missing Primary UoM');
          const isValid = errors.length === 0;
          return {
            isValid,
            errors,
            parsed: {
              id: `itm-csv-${Date.now()}-${Math.random()}`,
              sku: row.sku?.toUpperCase(),
              name: row.name,
              category: (row.category as any) || 'PROCESSED_FG',
              primaryUom: row.primaryUom || 'pcs',
              secondaryUom: row.secondaryUom || 'crates',
              conversionFactor: parseFloat(row.conversionFactor || '1') || 1,
              isCatchWeight: false,
              hsnCode: row.hsnCode || '04061000',
              gstRate: parseFloat(row.gstRate || '5') || 5,
              taxTreatment: 'TAXABLE',
              minMarginPct: 15,
              shelfLifeDays: 14,
              minStockQty: 100,
              currentStock: 0,
              active: true,
            },
          };
        }}
        onImport={async (validRows) => {
          setItems((prev) => [...(validRows as ItemRecord[]), ...prev]);
          return { importedCount: validRows.length, skippedCount: 0 };
        }}
      />
    </div>
  );
}
