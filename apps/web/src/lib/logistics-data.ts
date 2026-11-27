/**
 * Client-side Logistics, Fleet & Delivery Store / Seed Data for Phase F8
 */

export interface ReadyOrderItem {
  id: string;
  orderNo: string;
  customerId?: string;
  customerName: string;
  siteId?: string;
  area: string;
  deliveryWindow: '04-08' | '10-12' | '13-16' | '18-21';
  weightKg: number;
  crates: number;
  valueInr: number;
  status: 'READY' | 'PENDING_APPROVAL';
  rawStatus?: string;
  creditHold: boolean;
  gpsX: number;
  gpsY: number;
  lines?: Array<{ itemId: string; qty: number }>;
}

export interface FleetVehicleOption {
  id: string;
  regNo: string;
  model: string;
  capacityKg: number;
  capacityCrates: number;
  tripsThisMonth: number;
  kmThisMonth: number;
  insuranceExpiry: string;
  fitnessExpiry: string;
  pucExpiry: string;
}

export interface TripStopDetail {
  stopId: string;
  seq: number;
  orderNo: string;
  customerName: string;
  area: string;
  weightKg: number;
  valueInr: number;
  deliveryStatus: 'PENDING' | 'DELIVERED' | 'PARTIAL' | 'FAILED';
  expectedCodInr: number;
  collectedCodInr: number;
  challanNo?: string;
  ewayBillRef?: string;
  epodSignedBy?: string;
  epodPhotoName?: string;
  returnedQty?: number;
  issueReason?: string;
  gpsX: number;
  gpsY: number;
}

export interface TripRecord {
  id: string;
  tripNo: string;
  tripDate: string;
  vehicleId: string;
  vehicleRegNo: string;
  driverId: string;
  driverName: string;
  status: 'DRAFT' | 'LOADING' | 'IN_TRANSIT' | 'COMPLETED' | 'CLOSED';
  loadingConfirmed: boolean;
  lastUpdated: string;
  unloggedReturnsCount: number;
  codHandedOver: boolean;
  expensesEntered: boolean;
  openIssuesCount: number;
  stops: TripStopDetail[];
}

export interface DeliveryIssueRecord {
  id: string;
  issueNo: string;
  tripId: string;
  tripNo: string;
  stopOrderNo: string;
  customerName: string;
  type: 'DAMAGE' | 'SHORT' | 'CUSTOMER_ABSENT' | 'WRONG_ITEM' | 'DISPUTE';
  description: string;
  photoName?: string;
  status: 'OPEN' | 'RESOLVED';
  resolutionOutcome?: 'REDELIVER' | 'CREDIT_NOTE' | 'WRITE_OFF';
  reportedAt: string;
}

export interface TripExpenseRecord {
  id: string;
  tripId: string;
  tripNo: string;
  vehicleRegNo: string;
  category: 'FUEL' | 'TOLL' | 'LOADING' | 'FOOD' | 'REPAIR';
  amount: number;
  receiptName?: string;
  date: string;
  notes: string;
}

export const READY_ORDERS_POOL: ReadyOrderItem[] = [
  { id: 'ro-1', orderNo: 'SO-2026-104', customerName: 'Sahyadri Dairy', area: 'Baramati East', deliveryWindow: '10-12', weightKg: 850, crates: 42, valueInr: 62500, status: 'READY', creditHold: false, gpsX: 120, gpsY: 70 },
  { id: 'ro-2', orderNo: 'SO-2026-105', customerName: 'Gokul Milk Union', area: 'Indapur Road', deliveryWindow: '10-12', weightKg: 600, crates: 30, valueInr: 31200, status: 'READY', creditHold: false, gpsX: 210, gpsY: 110 },
  { id: 'ro-3', orderNo: 'SO-2026-106', customerName: 'Krishi Kendra Agro', area: 'Phaltan', deliveryWindow: '13-16', weightKg: 450, crates: 22, valueInr: 24800, status: 'READY', creditHold: false, gpsX: 300, gpsY: 85 },
  { id: 'ro-4', orderNo: 'SO-2026-107', customerName: 'Nandanvan Farms', area: 'Daund', deliveryWindow: '13-16', weightKg: 500, crates: 25, valueInr: 54000, status: 'READY', creditHold: true, gpsX: 170, gpsY: 145 },
];

export const FLEET_VEHICLES: FleetVehicleOption[] = [
  { id: 'veh-1', regNo: 'MH-12-AB-1234', model: 'Tata 407 Gold', capacityKg: 2000, capacityCrates: 100, tripsThisMonth: 19, kmThisMonth: 2480, insuranceExpiry: '2027-02-15', fitnessExpiry: '2026-12-01', pucExpiry: '2026-11-28' },
  { id: 'veh-2', regNo: 'MH-12-TR-8890', model: 'Eicher Pro 2049', capacityKg: 3500, capacityCrates: 175, tripsThisMonth: 24, kmThisMonth: 3820, insuranceExpiry: '2027-04-10', fitnessExpiry: '2027-01-20', pucExpiry: '2027-01-05' },
  { id: 'veh-3', regNo: 'MH-14-CD-4421', model: 'Ashok Leyland Dost+', capacityKg: 1500, capacityCrates: 75, tripsThisMonth: 14, kmThisMonth: 1650, insuranceExpiry: '2026-11-20', fitnessExpiry: '2026-12-15', pucExpiry: '2026-11-18' },
];

export const FLEET_DRIVERS = [
  { id: 'drv-1', name: 'Raju Pawar', phone: '+91 98500 11223', currentTripNo: 'TRP-2026-501', status: 'ON_ROAD' },
  { id: 'drv-2', name: 'Vikram Shinde', phone: '+91 98500 44556', currentTripNo: 'TRP-2026-502', status: 'LOADING' },
];

export const COLLECTORS_MONITOR = [
  { id: 'col-1', name: 'Mahesh Desai', pendingVisits: 4, walletCashInr: 18400, walletChequeInr: 24000, handoverStatus: 'PENDING' },
  { id: 'col-2', name: 'Sandeep Jadhav', pendingVisits: 2, walletCashInr: 9200, walletChequeInr: 0, handoverStatus: 'SETTLED' },
];

export const INITIAL_TRIPS: TripRecord[] = [
  {
    id: 'trp-501',
    tripNo: 'TRP-2026-501',
    tripDate: '2026-11-13',
    vehicleId: 'veh-1',
    vehicleRegNo: 'MH-12-AB-1234',
    driverId: 'drv-1',
    driverName: 'Raju Pawar',
    status: 'IN_TRANSIT',
    loadingConfirmed: true,
    lastUpdated: '16:48',
    unloggedReturnsCount: 0,
    codHandedOver: false,
    expensesEntered: true,
    openIssuesCount: 1,
    stops: [
      {
        stopId: 'stp-1',
        seq: 1,
        orderNo: 'SO-2026-101',
        customerName: 'Sahyadri Dairy',
        area: 'Baramati East',
        weightKg: 650,
        valueInr: 58400,
        deliveryStatus: 'DELIVERED',
        expectedCodInr: 15000,
        collectedCodInr: 15000,
        challanNo: 'DC-2026-801',
        ewayBillRef: 'EWB-331098441202',
        epodSignedBy: 'R. Deshmukh',
        epodPhotoName: 'epod-sahyadri.jpg',
        gpsX: 90,
        gpsY: 50,
      },
      {
        stopId: 'stp-2',
        seq: 2,
        orderNo: 'SO-2026-102',
        customerName: 'Gokul Milk Union',
        area: 'Indapur Road',
        weightKg: 500,
        valueInr: 32000,
        deliveryStatus: 'PARTIAL',
        expectedCodInr: 12000,
        collectedCodInr: 10000,
        challanNo: 'DC-2026-802',
        epodSignedBy: 'V. Kulkarni',
        returnedQty: 2,
        issueReason: '2 torn bags returned',
        gpsX: 200,
        gpsY: 95,
      },
      {
        stopId: 'stp-3',
        seq: 3,
        orderNo: 'SO-2026-103',
        customerName: 'Kisan Agro Center',
        area: 'Phaltan',
        weightKg: 400,
        valueInr: 22400,
        deliveryStatus: 'PENDING',
        expectedCodInr: 8500,
        collectedCodInr: 0,
        challanNo: 'DC-2026-803',
        gpsX: 310,
        gpsY: 75,
      },
    ],
  },
  {
    id: 'trp-502',
    tripNo: 'TRP-2026-502',
    tripDate: '2026-11-13',
    vehicleId: 'veh-2',
    vehicleRegNo: 'MH-12-TR-8890',
    driverId: 'drv-2',
    driverName: 'Vikram Shinde',
    status: 'LOADING',
    loadingConfirmed: false,
    lastUpdated: '16:35',
    unloggedReturnsCount: 0,
    codHandedOver: false,
    expensesEntered: false,
    openIssuesCount: 0,
    stops: [
      {
        stopId: 'stp-4',
        seq: 1,
        orderNo: 'SO-2026-104',
        customerName: 'Sahyadri Dairy',
        area: 'Baramati East',
        weightKg: 850,
        valueInr: 62500,
        deliveryStatus: 'PENDING',
        expectedCodInr: 0,
        collectedCodInr: 0,
        challanNo: 'DC-2026-804',
        ewayBillRef: 'EWB-331098449910',
        gpsX: 120,
        gpsY: 120,
      },
    ],
  },
  {
    id: 'trp-503',
    tripNo: 'TRP-2026-503',
    tripDate: '2026-11-12',
    vehicleId: 'veh-3',
    vehicleRegNo: 'MH-14-CD-4421',
    driverId: 'drv-1',
    driverName: 'Raju Pawar',
    status: 'COMPLETED',
    loadingConfirmed: true,
    lastUpdated: 'Yesterday',
    unloggedReturnsCount: 0,
    codHandedOver: true,
    expensesEntered: true,
    openIssuesCount: 0,
    stops: [
      {
        stopId: 'stp-5',
        seq: 1,
        orderNo: 'SO-2026-098',
        customerName: 'Patil Dairy Farm',
        area: 'Daund',
        weightKg: 700,
        valueInr: 36400,
        deliveryStatus: 'DELIVERED',
        expectedCodInr: 18000,
        collectedCodInr: 18000,
        challanNo: 'DC-2026-798',
        epodSignedBy: 'A. Patil',
        gpsX: 160,
        gpsY: 140,
      },
    ],
  },
];

export const INITIAL_DELIVERY_ISSUES: DeliveryIssueRecord[] = [
  {
    id: 'iss-1',
    issueNo: 'ISS-2026-01',
    tripId: 'trp-501',
    tripNo: 'TRP-2026-501',
    stopOrderNo: 'SO-2026-102',
    customerName: 'Gokul Milk Union',
    type: 'DAMAGE',
    description: '2 HDPE bags torn during unloading; customer deducted ₹2,000 COD.',
    photoName: 'torn-sacks-gokul.jpg',
    status: 'OPEN',
    reportedAt: '2026-11-13 14:20',
  },
];

export const INITIAL_TRIP_EXPENSES: TripExpenseRecord[] = [
  {
    id: 'exp-1',
    tripId: 'trp-501',
    tripNo: 'TRP-2026-501',
    vehicleRegNo: 'MH-12-AB-1234',
    category: 'FUEL',
    amount: 2400,
    receiptName: 'diesel-pump-1113.jpg',
    date: '2026-11-13',
    notes: '30L diesel refill at Baramati highway pump',
  },
  {
    id: 'exp-2',
    tripId: 'trp-501',
    tripNo: 'TRP-2026-501',
    vehicleRegNo: 'MH-12-AB-1234',
    category: 'TOLL',
    amount: 185,
    date: '2026-11-13',
    notes: 'NH-65 toll plaza',
  },
];

