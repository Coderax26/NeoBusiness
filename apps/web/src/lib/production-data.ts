/**
 * Client-side Production & Factory Store / Seed Data for Phase F7
 */

import type { BomRecord } from '@neo/shared';

export interface WorkOrderRecord {
  id: string;
  woNumber: string;
  finishedItemId: string;
  finishedItemName: string;
  bomId: string;
  bomCode: string;
  siteName: string;
  plannedQty: number;
  issuedRmQty: number;
  actualOutputQty: number;
  scrapQty: number;
  uom: string;
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  requiredBy: string;
  startedAt?: string;
  linkedSalesOrderNo?: string;
  customerName?: string;
  packagingLot?: string;
  yieldVarianceException?: boolean;
  cancelReason?: string;
}

export interface RmRequisitionRecord {
  id: string;
  reqNo: string;
  itemId: string;
  itemSku: string;
  itemName: string;
  qty: number;
  uom: string;
  neededBy: string;
  sourceWoNo?: string;
  status: 'DRAFT' | 'OPEN' | 'APPROVED' | 'PO_CREATED' | 'CANCELLED';
}

export interface WastageRecord {
  id: string;
  wastageNo: string;
  woId: string;
  woNumber: string;
  itemName: string;
  qty: number;
  uom: string;
  reason: 'BURNT' | 'SPILLED' | 'QUALITY_REJECT' | 'OTHER';
  photoName?: string;
  requiresWriteOffApproval: boolean; // WASTAGE_WRITEOFF
  loggedAt: string;
}

export interface WorkerMasterRecord {
  id: string;
  code: string;
  name: string;
  station: string;
  shift: 'SHIFT_1' | 'SHIFT_2';
  status: 'IN' | 'OUT';
  lastPunch: string;
  hoursToday: number;
  monthlyHours: number;
  assignedWoNo?: string;
}

export const INITIAL_BOMS: BomRecord[] = [
  {
    id: 'bom-feed-v2',
    code: 'BOM-FEED-V2',
    version: 2,
    finishedItemId: 'itm-feed-fg',
    finishedItemName: 'Premium Dairy Cattle Feed (50kg)',
    outputQty: 100,
    outputUom: 'kg',
    status: 'ACTIVE',
    steps: [
      'Grind Yellow Maize Grain to 2mm mesh',
      'Blend Soybean Meal & Mineral Premix for 12 mins',
      'Inject Molasses binder and pelletize at 75°C',
      'Cool & pack into 50kg HDPE sacks',
    ],
    ingredients: [
      { itemId: 'itm-maize', itemSku: 'RM-MAIZE-01', itemName: 'Yellow Maize Grain (Grade A)', qty: 55, uom: 'kg', expectedLossPct: 2, unitCost: 26 },
      { itemId: 'itm-soy', itemSku: 'RM-SOY-02', itemName: 'Soybean Meal (46% Protein)', qty: 32, uom: 'kg', expectedLossPct: 1, unitCost: 48 },
      { itemId: 'itm-molasses', itemSku: 'RM-MOL-03', itemName: 'Sugarcane Molasses', qty: 10, uom: 'kg', expectedLossPct: 0.5, unitCost: 18 },
      { itemId: 'itm-mineral', itemSku: 'RM-MIN-04', itemName: 'Mineral Mixture Premix', qty: 3, uom: 'kg', expectedLossPct: 0, unitCost: 92 },
    ],
  },
  {
    id: 'bom-feed-v3',
    code: 'BOM-FEED-V3',
    version: 3,
    finishedItemId: 'itm-feed-fg',
    finishedItemName: 'Premium Dairy Cattle Feed (50kg)',
    outputQty: 100,
    outputUom: 'kg',
    status: 'DRAFT',
    steps: [
      'High-protein winter formula: grind Maize to 2mm',
      'Increase Soybean Meal to 35 kg for extra milk yield',
      'Pelletize & pack into 50kg HDPE sacks',
    ],
    ingredients: [
      { itemId: 'itm-maize', itemSku: 'RM-MAIZE-01', itemName: 'Yellow Maize Grain (Grade A)', qty: 52, uom: 'kg', expectedLossPct: 2, unitCost: 26 },
      { itemId: 'itm-soy', itemSku: 'RM-SOY-02', itemName: 'Soybean Meal (46% Protein)', qty: 35, uom: 'kg', expectedLossPct: 1, unitCost: 48 },
      { itemId: 'itm-molasses', itemSku: 'RM-MOL-03', itemName: 'Sugarcane Molasses', qty: 10, uom: 'kg', expectedLossPct: 0.5, unitCost: 18 },
      { itemId: 'itm-mineral', itemSku: 'RM-MIN-04', itemName: 'Mineral Mixture Premix', qty: 3, uom: 'kg', expectedLossPct: 0, unitCost: 92 },
    ],
  },
  {
    id: 'bom-calf-v1',
    code: 'BOM-CALF-V1',
    version: 1,
    finishedItemId: 'itm-calf-fg',
    finishedItemName: 'Calf Starter Mash (25kg)',
    outputQty: 100,
    outputUom: 'kg',
    status: 'ACTIVE',
    steps: [
      'Fine-crush Maize & Soybean Meal',
      'Mix Mineral Premix uniformly',
    ],
    ingredients: [
      { itemId: 'itm-maize', itemSku: 'RM-MAIZE-01', itemName: 'Yellow Maize Grain (Grade A)', qty: 60, uom: 'kg', expectedLossPct: 1.5, unitCost: 26 },
      { itemId: 'itm-soy', itemSku: 'RM-SOY-02', itemName: 'Soybean Meal (46% Protein)', qty: 36, uom: 'kg', expectedLossPct: 1, unitCost: 48 },
      { itemId: 'itm-mineral', itemSku: 'RM-MIN-04', itemName: 'Mineral Mixture Premix', qty: 4, uom: 'kg', expectedLossPct: 0, unitCost: 92 },
    ],
  },
];

export const INITIAL_WORK_ORDERS: WorkOrderRecord[] = [
  {
    id: 'wo-88',
    woNumber: 'WO-2026-088',
    finishedItemId: 'itm-feed-fg',
    finishedItemName: 'Premium Dairy Cattle Feed (50kg)',
    bomId: 'bom-feed-v2',
    bomCode: 'BOM-FEED-V2',
    siteName: 'Baramati Plant',
    plannedQty: 1000,
    issuedRmQty: 1000,
    actualOutputQty: 620,
    scrapQty: 15,
    uom: 'kg',
    status: 'IN_PROGRESS',
    requiredBy: '2026-11-13 18:00',
    startedAt: '09:10',
    linkedSalesOrderNo: 'SO-2026-104',
    customerName: 'Sahyadri Dairy',
    packagingLot: 'LOT-1113-A',
  },
  {
    id: 'wo-89',
    woNumber: 'WO-2026-089',
    finishedItemId: 'itm-feed-fg',
    finishedItemName: 'Premium Dairy Cattle Feed (50kg)',
    bomId: 'bom-feed-v2',
    bomCode: 'BOM-FEED-V2',
    siteName: 'Baramati Plant',
    plannedQty: 1500,
    issuedRmQty: 0,
    actualOutputQty: 0,
    scrapQty: 0,
    uom: 'kg',
    status: 'PLANNED',
    requiredBy: '2026-11-14 14:00',
    linkedSalesOrderNo: 'SO-2026-102',
    customerName: 'Gokul Milk Union',
  },
  {
    id: 'wo-90',
    woNumber: 'WO-2026-090',
    finishedItemId: 'itm-calf-fg',
    finishedItemName: 'Calf Starter Mash (25kg)',
    bomId: 'bom-calf-v1',
    bomCode: 'BOM-CALF-V1',
    siteName: 'Baramati Plant',
    plannedQty: 500,
    issuedRmQty: 500,
    actualOutputQty: 472,
    scrapQty: 8,
    uom: 'kg',
    status: 'COMPLETED',
    requiredBy: '2026-11-13 12:00',
    startedAt: '07:00',
    linkedSalesOrderNo: 'SO-2026-101',
    customerName: 'Krishi Kendra Agro',
    packagingLot: 'LOT-1113-C1',
    yieldVarianceException: true,
  },
  {
    id: 'wo-91',
    woNumber: 'WO-2026-091',
    finishedItemId: 'itm-feed-fg',
    finishedItemName: 'Premium Dairy Cattle Feed (50kg)',
    bomId: 'bom-feed-v2',
    bomCode: 'BOM-FEED-V2',
    siteName: 'Baramati Plant',
    plannedQty: 800,
    issuedRmQty: 0,
    actualOutputQty: 0,
    scrapQty: 0,
    uom: 'kg',
    status: 'PLANNED',
    requiredBy: '2026-11-15 16:00',
  },
];

export const INITIAL_RM_REQUISITIONS: RmRequisitionRecord[] = [
  {
    id: 'rmr-1',
    reqNo: 'RMREQ-2026-011',
    itemId: 'itm-maize',
    itemSku: 'RM-MAIZE-01',
    itemName: 'Yellow Maize Grain (Grade A)',
    qty: 645,
    uom: 'kg',
    neededBy: '2026-11-14',
    sourceWoNo: 'WO-2026-089',
    status: 'OPEN',
  },
  {
    id: 'rmr-2',
    reqNo: 'RMREQ-2026-012',
    itemId: 'itm-mineral',
    itemSku: 'RM-MIN-04',
    itemName: 'Mineral Mixture Premix',
    qty: 45,
    uom: 'kg',
    neededBy: '2026-11-14',
    sourceWoNo: 'WO-2026-089',
    status: 'APPROVED',
  },
];

export const INITIAL_WASTAGE_LOGS: WastageRecord[] = [
  {
    id: 'wst-1',
    wastageNo: 'WST-2026-01',
    woId: 'wo-90',
    woNumber: 'WO-2026-090',
    itemName: 'Calf Starter Mash (25kg)',
    qty: 8,
    uom: 'kg',
    reason: 'SPILLED',
    requiresWriteOffApproval: false,
    loggedAt: '2026-11-13 11:20',
  },
  {
    id: 'wst-2',
    wastageNo: 'WST-2026-02',
    woId: 'wo-88',
    woNumber: 'WO-2026-088',
    itemName: 'Premium Dairy Cattle Feed (50kg)',
    qty: 15,
    uom: 'kg',
    reason: 'QUALITY_REJECT',
    photoName: 'moisture-reject.jpg',
    requiresWriteOffApproval: true,
    loggedAt: '2026-11-13 13:10',
  },
];

export const INITIAL_WORKERS: WorkerMasterRecord[] = [
  { id: 'wrk-1', code: 'WRK-01', name: 'Anil Pawar', station: 'Pelletizer Line A', shift: 'SHIFT_1', status: 'IN', lastPunch: '06:58', hoursToday: 7.5, monthlyHours: 168, assignedWoNo: 'WO-2026-088' },
  { id: 'wrk-2', code: 'WRK-02', name: 'Prakash More', station: 'Hammer Mill', shift: 'SHIFT_1', status: 'IN', lastPunch: '07:02', hoursToday: 7.4, monthlyHours: 162, assignedWoNo: 'WO-2026-088' },
  { id: 'wrk-3', code: 'WRK-03', name: 'Ganesh Kulkarni', station: 'Bagging & Stitching', shift: 'SHIFT_1', status: 'OUT', lastPunch: '12:15', hoursToday: 5.2, monthlyHours: 154, assignedWoNo: 'WO-2026-090' },
  { id: 'wrk-4', code: 'WRK-04', name: 'Santosh Kale', station: 'Boiler & Steam', shift: 'SHIFT_2', status: 'OUT', lastPunch: 'Yesterday', hoursToday: 0, monthlyHours: 172 },
];

export const INITIAL_YIELD_TREND = [
  { day: '07 Nov', plannedKg: 2400, outputKg: 2360, yieldPct: 98.3 },
  { day: '08 Nov', plannedKg: 2600, outputKg: 2540, yieldPct: 97.7 },
  { day: '09 Nov', plannedKg: 2200, outputKg: 2180, yieldPct: 99.1 },
  { day: '10 Nov', plannedKg: 2800, outputKg: 2690, yieldPct: 96.1 },
  { day: '11 Nov', plannedKg: 2500, outputKg: 2455, yieldPct: 98.2 },
  { day: '12 Nov', plannedKg: 2700, outputKg: 2650, yieldPct: 98.1 },
  { day: '13 Nov', plannedKg: 2500, outputKg: 2380, yieldPct: 95.2 },
];

