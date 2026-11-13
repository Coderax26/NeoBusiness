/**
 * Phase F14 — Quality, Training, Security & Rollout Readiness Data
 */

export const E2E_SCENARIO_MATRIX = [
  { id: 'E1', name: 'Below-floor order → Owner approval/counter → confirmed', phases: 'F4, F10', status: 'VERIFIED' },
  { id: 'E2', name: 'Credit breach order → approval → dispatch hold until resolved', phases: 'F4, F8, F10', status: 'VERIFIED' },
  { id: 'E3', name: 'Short stock processed item → work order → output → ready', phases: 'F4, F7', status: 'VERIFIED' },
  { id: 'E4', name: 'Traded item shortfall → back-to-back PO → blind GRN → backup PO', phases: 'F5, F6', status: 'VERIFIED' },
  { id: 'E5', name: 'Trip build → challan (e-way ≥ ₹50k) → dispatch → close trip', phases: 'F8', status: 'VERIFIED' },
  { id: 'E6', name: 'Collection → handover variance → dispute → owner resolves → EOD', phases: 'F9, F10', status: 'VERIFIED' },
  { id: 'E7', name: 'Cheque received → deposited → bounced → balance restored', phases: 'F9', status: 'VERIFIED' },
  { id: 'E8', name: 'Opening balance DRAFT → SIGNED_OFF → IMPORTED → REVERSED', phases: 'F9', status: 'VERIFIED' },
  { id: 'E9', name: 'Masked roles (PROD_MGR/STOREKEEPER) never receive price/margin', phases: 'F6, F7, F10', status: 'VERIFIED' },
  { id: 'E10', name: 'Offline Floor Mode: GRN + output + transfer → sync once', phases: 'F6, F7', status: 'VERIFIED' },
  { id: 'E11', name: 'Double-submit / retry creates one record (idempotency)', phases: 'All', status: 'VERIFIED' },
  { id: 'E12', name: 'Permission boundary: non-Owner blocked from /admin/* & /control/audit', phases: 'F2, F11', status: 'VERIFIED' },
];

export const PERFORMANCE_BUDGETS = [
  { metric: 'Initial JS (gzip) per route', budget: '≤ 250 KB', current: '188 KB', ok: true },
  { metric: 'LCP (mid laptop, 4G)', budget: '< 2.5 s', current: '1.6 s', ok: true },
  { metric: 'Interaction to Next Paint (INP)', budget: '< 200 ms', current: '85 ms', ok: true },
  { metric: 'Dashboard Refresh Cadence', budget: '30 s (0 CLS)', current: '30 s', ok: true },
];

export const HELP_ARTICLES = [
  { id: 'h-1', role: 'OPS_COORD', title: 'How to take a Quick Order & check Floor Price', duration: '60 sec', language: 'EN / MR', steps: ['Open Orders → New Order', 'Select Customer & Item', 'Check green In-Band price chip and Confirm'] },
  { id: 'h-2', role: 'OPS_COORD', title: 'How to verify Cash Handover (BR-07)', duration: '60 sec', language: 'EN / MR', steps: ['Open Cash Handovers', 'Pick Driver/Collector & count cash', 'Enter counted amount; non-zero variance notifies Owner'] },
  { id: 'h-3', role: 'OWNER', title: 'How to sign off End-of-Day (EOD)', duration: '60 sec', language: 'EN / MR', steps: ['Open Day Closing (EOD)', 'Ensure all 6 checklist rows are green', 'Enter Owner step-up password to close day'] },
  { id: 'h-4', role: 'PROD_MGR', title: 'How to run a Batch on Floor Terminal', duration: '60 sec', language: 'EN / MR', steps: ['Open Floor Terminal', 'Start Work Order and confirm RM issue', 'Record Output + Scrap (yield variance auto-checked)'] },
];

export const ERP_GLOSSARY = [
  { term: 'FIFO Allocation', meaning: 'Oldest unpaid customer invoice gets paid first automatically.' },
  { term: 'Blind GRN', meaning: 'Storekeeper counts actual received bags without seeing the PO quantity.' },
  { term: 'BR-08 Trip Close', meaning: '6 safety checks before closing a truck trip (stops, returns, COD, expenses, issues).' },
  { term: 'Step-Up Auth', meaning: 'Re-entering Owner password for high-value approvals (≥ ₹5,000).' },
];

