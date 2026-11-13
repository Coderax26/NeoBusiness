/**
 * Client-side Inventory, Warehouse & Floor Mode Store / Seed Data for Phase F6
 */

export interface StockRow {
  id: string;
  itemId: string;
  sku: string;
  itemName: string;
  category: 'RAW_MATERIAL' | 'PROCESSED_FG' | 'PACKAGING';
  siteId: string;
  siteName: string;
  locationCode: string;
  batchNo: string;
  onHand: number;
  reserved: number;
  minStock: number;
  uom: string;
  altUomLabel: string; // e.g., "40 crates ≈ 812 kg"
  unitCost: number; // owner only
  daysToExpiry: number;
  expiryDate: string;
}

export interface AtpProjection {
  itemId: string;
  sku: string;
  itemName: string;
  siteId: string;
  siteName: string;
  uom: string;
  onHand: number;
  reserved: number;
  incomingPoQty: number;
  incomingPoRef: string;
  plannedProductionQty: number;
  plannedProductionRef: string;
}

export interface TransferRecord {
  id: string;
  transferNo: string;
  fromSite: string;
  fromLocation: string;
  toSite: string;
  toLocation: string;
  itemId: string;
  itemName: string;
  batchNo: string;
  qty: number;
  receivedQty?: number;
  uom: string;
  status: 'DRAFT' | 'DISPATCHED' | 'RECEIVED' | 'COMPLETED' | 'CANCELLED';
  createdAt: string;
}

export interface AdjustmentRecord {
  id: string;
  adjNo: string;
  itemId: string;
  itemName: string;
  batchNo: string;
  siteName: string;
  qtyDelta: number;
  uom: string;
  valueImpact: number; // owner only
  reason: 'DAMAGE' | 'EXPIRY' | 'COUNT_DIFFERENCE' | 'SPILLAGE' | 'OTHER';
  notes: string;
  photoName?: string;
  isLargeVariance: boolean; // STOCK_VARIANCE exception
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  requestedBy: string;
  createdAt: string;
}

export interface LedgerEntry {
  id: string;
  timestamp: string;
  itemId: string;
  itemName: string;
  batchNo: string;
  siteName: string;
  type: 'GRN' | 'SALE' | 'TRANSFER' | 'PRODUCTION_OUT' | 'PRODUCTION_IN' | 'ADJUSTMENT' | 'REVERSAL';
  qtyDelta: number;
  runningBalance: number;
  uom: string;
  refNo: string;
  reversedById?: string;
  reversesId?: string;
}

export interface ReservationRecord {
  id: string;
  orderNo: string;
  customerName: string;
  itemId: string;
  itemName: string;
  batchNo: string;
  siteName: string;
  qty: number;
  uom: string;
  expiresAt: string;
  status: 'ACTIVE' | 'RELEASED';
}

export interface StockCountRecord {
  id: string;
  sheetNo: string;
  siteName: string;
  locationCode: string;
  category: string;
  status: 'OPEN' | 'POSTED';
  createdAt: string;
  lines: Array<{
    itemId: string;
    itemName: string;
    uom: string;
    systemQty: number;
    countedQty: number;
  }>;
}

export interface StockAlertItem {
  id: string;
  type: 'LOW_STOCK' | 'EXPIRING' | 'NEGATIVE' | 'DRIFT';
  itemName: string;
  siteName: string;
  detail: string;
  severity: 'HIGH' | 'MEDIUM';
}

export interface FloorExpectedPo {
  poId: string;
  poNumber: string;
  supplierName: string;
  vehicleNo: string;
  siteName: string;
  lines: Array<{
    lineId: string;
    itemId: string;
    itemSku: string;
    itemName: string;
    uom: string;
    shelfLifeDays: number;
    orderedQty: number; // stripped before Blind GRN render!
    unitPrice: number; // stripped before Blind GRN render!
  }>;
}

export interface FloorLoadingTrip {
  tripId: string;
  tripNo: string;
  vehicleNo: string;
  driverName: string;
  status: 'LOADING' | 'READY_TO_DISPATCH';
  stops: Array<{
    stopId: string;
    customerName: string;
    itemId: string;
    itemName: string;
    suggestedBatch: string;
    requiredQty: number;
    loadedQty: number;
    uom: string;
    checked: boolean;
  }>;
}

export const INITIAL_STOCK_ROWS: StockRow[] = [
  {
    id: 'stk-1',
    itemId: 'itm-soy',
    sku: 'RM-SOY-02',
    itemName: 'Soybean Meal (46% Protein)',
    category: 'RAW_MATERIAL',
    siteId: 'site-1',
    siteName: 'Pune Central Depot',
    locationCode: 'RM-A1',
    batchNo: 'B-SOY-1102',
    onHand: 1850,
    reserved: 450,
    minStock: 1000,
    uom: 'kg',
    altUomLabel: '37 bags ≈ 1,850 kg',
    unitCost: 48,
    daysToExpiry: 42,
    expiryDate: '2026-12-25',
  },
  {
    id: 'stk-2',
    itemId: 'itm-maize',
    sku: 'RM-MAIZE-01',
    itemName: 'Yellow Maize Grain (Grade A)',
    category: 'RAW_MATERIAL',
    siteId: 'site-1',
    siteName: 'Pune Central Depot',
    locationCode: 'RM-A2',
    batchNo: 'B-MZ-1019',
    onHand: 620,
    reserved: 200,
    minStock: 800,
    uom: 'kg',
    altUomLabel: '12.4 bags ≈ 620 kg',
    unitCost: 26,
    daysToExpiry: 6,
    expiryDate: '2026-11-19',
  },
  {
    id: 'stk-3',
    itemId: 'itm-feed-fg',
    sku: 'FG-FEED-50',
    itemName: 'Premium Dairy Cattle Feed (50kg)',
    category: 'PROCESSED_FG',
    siteId: 'site-2',
    siteName: 'Baramati Plant',
    locationCode: 'FG-B1',
    batchNo: 'B-FG-1110',
    onHand: 812,
    reserved: 160,
    minStock: 500,
    uom: 'kg',
    altUomLabel: '40 crates ≈ 812 kg',
    unitCost: 34,
    daysToExpiry: 2,
    expiryDate: '2026-11-15',
  },
  {
    id: 'stk-4',
    itemId: 'itm-mineral',
    sku: 'RM-MIN-04',
    itemName: 'Mineral Mixture Premix',
    category: 'RAW_MATERIAL',
    siteId: 'site-2',
    siteName: 'Baramati Plant',
    locationCode: 'RM-C3',
    batchNo: 'B-MIN-0915',
    onHand: 95,
    reserved: 0,
    minStock: 150,
    uom: 'kg',
    altUomLabel: '3.8 drums ≈ 95 kg',
    unitCost: 92,
    daysToExpiry: -2,
    expiryDate: '2026-11-11',
  },
  {
    id: 'stk-5',
    itemId: 'itm-hdpe',
    sku: 'PKG-HDPE-50',
    itemName: '50 kg HDPE Woven Sack',
    category: 'PACKAGING',
    siteId: 'site-1',
    siteName: 'Pune Central Depot',
    locationCode: 'PKG-01',
    batchNo: 'B-PKG-1101',
    onHand: 180,
    reserved: 50,
    minStock: 300,
    uom: 'pcs',
    altUomLabel: '180 sacks',
    unitCost: 22,
    daysToExpiry: 180,
    expiryDate: '2027-05-12',
  },
];

export const INITIAL_ATP_PROJECTIONS: AtpProjection[] = [
  {
    itemId: 'itm-soy',
    sku: 'RM-SOY-02',
    itemName: 'Soybean Meal (46% Protein)',
    siteId: 'site-1',
    siteName: 'Pune Central Depot',
    uom: 'kg',
    onHand: 1850,
    reserved: 450,
    incomingPoQty: 1000,
    incomingPoRef: 'PO-2026-101 (ETA 15 Nov)',
    plannedProductionQty: 0,
    plannedProductionRef: '—',
  },
  {
    itemId: 'itm-feed-fg',
    sku: 'FG-FEED-50',
    itemName: 'Premium Dairy Cattle Feed (50kg)',
    siteId: 'site-2',
    siteName: 'Baramati Plant',
    uom: 'kg',
    onHand: 812,
    reserved: 160,
    incomingPoQty: 0,
    incomingPoRef: '—',
    plannedProductionQty: 2500,
    plannedProductionRef: 'WO-2026-088 (14 Nov)',
  },
];

export const INITIAL_TRANSFERS: TransferRecord[] = [
  {
    id: 'trf-1',
    transferNo: 'TRF-2026-019',
    fromSite: 'Baramati Plant',
    fromLocation: 'FG-B1',
    toSite: 'Pune Central Depot',
    toLocation: 'FG-A1',
    itemId: 'itm-feed-fg',
    itemName: 'Premium Dairy Cattle Feed (50kg)',
    batchNo: 'B-FG-1110',
    qty: 500,
    uom: 'kg',
    status: 'DISPATCHED',
    createdAt: '2026-11-13 08:20',
  },
  {
    id: 'trf-2',
    transferNo: 'TRF-2026-018',
    fromSite: 'Pune Central Depot',
    fromLocation: 'RM-A1',
    toSite: 'Baramati Plant',
    toLocation: 'RM-B2',
    itemId: 'itm-soy',
    itemName: 'Soybean Meal (46% Protein)',
    batchNo: 'B-SOY-1102',
    qty: 400,
    uom: 'kg',
    status: 'DRAFT',
    createdAt: '2026-11-13 10:05',
  },
];

export const INITIAL_ADJUSTMENTS: AdjustmentRecord[] = [
  {
    id: 'adj-1',
    adjNo: 'ADJ-2026-031',
    itemId: 'itm-mineral',
    itemName: 'Mineral Mixture Premix',
    batchNo: 'B-MIN-0915',
    siteName: 'Baramati Plant',
    qtyDelta: -95,
    uom: 'kg',
    valueImpact: -8740,
    reason: 'EXPIRY',
    notes: 'Expired batch quarantined for disposal',
    photoName: 'mineral-expired-tag.jpg',
    isLargeVariance: true,
    status: 'PENDING_APPROVAL',
    requestedBy: 'Ramesh Patil (Storekeeper)',
    createdAt: '2026-11-13 09:30',
  },
  {
    id: 'adj-2',
    adjNo: 'ADJ-2026-030',
    itemId: 'itm-maize',
    itemName: 'Yellow Maize Grain (Grade A)',
    batchNo: 'B-MZ-1019',
    siteName: 'Pune Central Depot',
    qtyDelta: -15,
    uom: 'kg',
    valueImpact: -390,
    reason: 'SPILLAGE',
    notes: 'Torn sack during forklift handling',
    isLargeVariance: false,
    status: 'APPROVED',
    requestedBy: 'Suresh Jadhav',
    createdAt: '2026-11-12 17:10',
  },
];

export const INITIAL_LEDGER_ENTRIES: LedgerEntry[] = [
  {
    id: 'led-104',
    timestamp: '2026-11-13 07:45',
    itemId: 'itm-maize',
    itemName: 'Yellow Maize Grain (Grade A)',
    batchNo: 'B-MZ-1019',
    siteName: 'Pune Central Depot',
    type: 'GRN',
    qtyDelta: 800,
    runningBalance: 1020,
    uom: 'kg',
    refNo: 'GRN-2026-201',
  },
  {
    id: 'led-103',
    timestamp: '2026-11-12 18:10',
    itemId: 'itm-maize',
    itemName: 'Yellow Maize Grain (Grade A)',
    batchNo: 'B-MZ-1019',
    siteName: 'Pune Central Depot',
    type: 'REVERSAL',
    qtyDelta: -200,
    runningBalance: 220,
    uom: 'kg',
    refNo: 'REV-ADJ-2026-028',
    reversesId: 'led-102',
  },
  {
    id: 'led-102',
    timestamp: '2026-11-12 16:00',
    itemId: 'itm-maize',
    itemName: 'Yellow Maize Grain (Grade A)',
    batchNo: 'B-MZ-1019',
    siteName: 'Pune Central Depot',
    type: 'ADJUSTMENT',
    qtyDelta: 200,
    runningBalance: 420,
    uom: 'kg',
    refNo: 'ADJ-2026-028',
    reversedById: 'led-103',
  },
  {
    id: 'led-101',
    timestamp: '2026-11-12 11:30',
    itemId: 'itm-soy',
    itemName: 'Soybean Meal (46% Protein)',
    batchNo: 'B-SOY-1102',
    siteName: 'Pune Central Depot',
    type: 'SALE',
    qtyDelta: -300,
    runningBalance: 1850,
    uom: 'kg',
    refNo: 'SO-2026-102',
  },
];

export const INITIAL_RESERVATIONS: ReservationRecord[] = [
  {
    id: 'res-1',
    orderNo: 'SO-2026-104',
    customerName: 'Sahyadri Dairy',
    itemId: 'itm-soy',
    itemName: 'Soybean Meal (46% Protein)',
    batchNo: 'B-SOY-1102',
    siteName: 'Pune Central Depot',
    qty: 450,
    uom: 'kg',
    expiresAt: '2026-11-15 18:00',
    status: 'ACTIVE',
  },
  {
    id: 'res-2',
    orderNo: 'SO-2026-102',
    customerName: 'Gokul Milk Union',
    itemId: 'itm-maize',
    itemName: 'Yellow Maize Grain (Grade A)',
    batchNo: 'B-MZ-1019',
    siteName: 'Pune Central Depot',
    qty: 200,
    uom: 'kg',
    expiresAt: '2026-11-14 14:00',
    status: 'ACTIVE',
  },
];

export const INITIAL_STOCK_COUNTS: StockCountRecord[] = [
  {
    id: 'cnt-1',
    sheetNo: 'CC-2026-1113',
    siteName: 'Pune Central Depot',
    locationCode: 'RM-A1 / RM-A2',
    category: 'RAW_MATERIAL',
    status: 'OPEN',
    createdAt: '2026-11-13 08:00',
    lines: [
      { itemId: 'itm-soy', itemName: 'Soybean Meal (46% Protein)', uom: 'kg', systemQty: 1850, countedQty: 1845 },
      { itemId: 'itm-maize', itemName: 'Yellow Maize Grain (Grade A)', uom: 'kg', systemQty: 620, countedQty: 620 },
    ],
  },
];

export const INITIAL_STOCK_ALERTS: StockAlertItem[] = [
  { id: 'alt-1', type: 'LOW_STOCK', itemName: 'Yellow Maize Grain (Grade A)', siteName: 'Pune Central Depot', detail: '620 kg on hand vs 800 kg min stock', severity: 'HIGH' },
  { id: 'alt-2', type: 'LOW_STOCK', itemName: '50 kg HDPE Woven Sack', siteName: 'Pune Central Depot', detail: '180 pcs vs 300 pcs min stock', severity: 'MEDIUM' },
  { id: 'alt-3', type: 'EXPIRING', itemName: 'Premium Dairy Cattle Feed (50kg)', siteName: 'Baramati Plant', detail: 'Batch B-FG-1110 expires in 2 days', severity: 'HIGH' },
  { id: 'alt-4', type: 'EXPIRING', itemName: 'Mineral Mixture Premix', siteName: 'Baramati Plant', detail: 'Batch B-MIN-0915 expired 2 days ago', severity: 'HIGH' },
  { id: 'alt-5', type: 'DRIFT', itemName: 'Soybean Meal (46% Protein)', siteName: 'Pune Central Depot', detail: '-5 kg cycle count drift pending review', severity: 'MEDIUM' },
];

export const INITIAL_FLOOR_EXPECTED_POS: FloorExpectedPo[] = [
  {
    poId: 'po-104',
    poNumber: 'PO-2026-104',
    supplierName: 'Mahalaxmi Feed Mills',
    vehicleNo: 'MH-12-AB-1234',
    siteName: 'Baramati Plant',
    lines: [
      {
        lineId: 'fpol-1',
        itemId: 'itm-molasses',
        itemSku: 'RM-MOL-03',
        itemName: 'Sugarcane Molasses',
        uom: 'kg',
        shelfLifeDays: 90,
        orderedQty: 1200,
        unitPrice: 18,
      },
      {
        lineId: 'fpol-2',
        itemId: 'itm-hdpe',
        itemSku: 'PKG-HDPE-50',
        itemName: '50 kg HDPE Woven Sack',
        uom: 'pcs',
        shelfLifeDays: 365,
        orderedQty: 1000,
        unitPrice: 22,
      },
    ],
  },
];

export const INITIAL_FLOOR_TRIPS: FloorLoadingTrip[] = [
  {
    tripId: 'trp-501',
    tripNo: 'TRP-2026-501',
    vehicleNo: 'MH-12-TR-8890',
    driverName: 'Vikram Shinde',
    status: 'LOADING',
    stops: [
      {
        stopId: 'stp-1',
        customerName: 'Sahyadri Dairy',
        itemId: 'itm-feed-fg',
        itemName: 'Premium Dairy Cattle Feed (50kg)',
        suggestedBatch: 'B-FG-1110 (FEFO)',
        requiredQty: 400,
        loadedQty: 0,
        uom: 'kg',
        checked: false,
      },
      {
        stopId: 'stp-2',
        customerName: 'Gokul Milk Union',
        itemId: 'itm-soy',
        itemName: 'Soybean Meal (46% Protein)',
        suggestedBatch: 'B-SOY-1102 (FEFO)',
        requiredQty: 300,
        loadedQty: 0,
        uom: 'kg',
        checked: false,
      },
    ],
  },
];

