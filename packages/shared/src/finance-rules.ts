/**
 * @neo/shared — Finance, Collections, Cheques, EOD, Tally & Opening Balances (Phase F9)
 * Implements Acceptance Criteria #1–#7.
 */

import { addMoney, subMoney } from './money.js';

export type ChequeStatus = 'RECEIVED' | 'DEPOSITED' | 'CLEARED' | 'BOUNCED' | 'RETURNED';

export interface ChequeTransitionResult {
  nextStatus: ChequeStatus;
  customerBalanceDelta: number;
  raisesFollowUp: boolean;
  reversesAllocation: boolean;
}

export function processChequeTransition(
  currentStatus: ChequeStatus,
  action: 'DEPOSIT' | 'CLEAR' | 'BOUNCE' | 'RETURN',
  chequeAmount: number,
): ChequeTransitionResult {
  if (action === 'DEPOSIT' && currentStatus === 'RECEIVED') {
    return { nextStatus: 'DEPOSITED', customerBalanceDelta: 0, raisesFollowUp: false, reversesAllocation: false };
  }
  if (action === 'CLEAR' && currentStatus === 'DEPOSITED') {
    return { nextStatus: 'CLEARED', customerBalanceDelta: 0, raisesFollowUp: false, reversesAllocation: false };
  }
  if (action === 'BOUNCE' && (currentStatus === 'DEPOSITED' || currentStatus === 'RECEIVED')) {
    return {
      nextStatus: 'BOUNCED',
      customerBalanceDelta: Number(addMoney(0, chequeAmount)),
      raisesFollowUp: true,
      reversesAllocation: true,
    };
  }
  if (action === 'RETURN' && currentStatus === 'BOUNCED') {
    return { nextStatus: 'RETURNED', customerBalanceDelta: 0, raisesFollowUp: false, reversesAllocation: false };
  }
  throw new Error(`Invalid cheque transition: ${currentStatus} -> ${action}`);
}

export interface EodChecklistInput {
  openTripsCount: number;
  nonZeroFieldWalletsCount: number;
  uninvoicedDeliveriesCount: number;
  pendingHandoversCount: number;
  undepositedChequesCount: number;
  depositSlipPrepared: boolean;
}

export interface EodChecklistRow {
  key: string;
  label: string;
  passed: boolean;
  detail: string;
  fixHref: string;
}

export function evaluateEodChecklist(input: EodChecklistInput): {
  canSignOff: boolean;
  rows: EodChecklistRow[];
} {
  const rows: EodChecklistRow[] = [
    {
      key: 'trips',
      label: 'All trips closed',
      passed: input.openTripsCount === 0,
      detail:
        input.openTripsCount === 0
          ? 'All dispatched trips closed for the day'
          : `${input.openTripsCount} trip(s) still open`,
      fixHref: '/logistics/trips',
    },
    {
      key: 'wallets',
      label: 'Field staff wallets at zero',
      passed: input.nonZeroFieldWalletsCount === 0,
      detail:
        input.nonZeroFieldWalletsCount === 0
          ? 'All driver/collector wallets settled to ₹0.00'
          : `${input.nonZeroFieldWalletsCount} field staff wallet(s) have unhanded cash/cheques`,
      fixHref: '/finance/handovers',
    },
    {
      key: 'invoiced',
      label: 'All deliveries invoiced',
      passed: input.uninvoicedDeliveriesCount === 0,
      detail:
        input.uninvoicedDeliveriesCount === 0
          ? 'Every dispatched order has a tax invoice'
          : `${input.uninvoicedDeliveriesCount} delivery(s) missing tax invoice`,
      fixHref: '/finance/invoices',
    },
    {
      key: 'handovers',
      label: 'Cash handovers verified',
      passed: input.pendingHandoversCount === 0,
      detail:
        input.pendingHandoversCount === 0
          ? 'All handovers verified or resolved'
          : `${input.pendingHandoversCount} handover(s) pending verification`,
      fixHref: '/finance/handovers',
    },
    {
      key: 'cheques',
      label: 'Cheques deposited / scheduled',
      passed: input.undepositedChequesCount === 0,
      detail:
        input.undepositedChequesCount === 0
          ? 'All due cheques deposited'
          : `${input.undepositedChequesCount} cheque(s) pending deposit`,
      fixHref: '/finance/cheques',
    },
    {
      key: 'deposit_slip',
      label: 'Net cash & bank deposit slip ready',
      passed: input.depositSlipPrepared,
      detail: input.depositSlipPrepared
        ? 'Deposit slip generated and matched'
        : 'Generate bank deposit slip before sign-off',
      fixHref: '/finance/eod',
    },
  ];

  return {
    canSignOff: rows.every((r) => r.passed),
    rows,
  };
}

export interface TallyVoucherInput {
  voucherNo: string;
  voucherType: 'Sales' | 'Receipt' | 'Credit Note' | 'Payment';
  date: string;
  partyName: string;
  amount: number;
  narration: string;
}

function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generateTallyXmlBatch(input: {
  fromDate: string;
  toDate: string;
  voucherTypes: Array<TallyVoucherInput['voucherType']>;
  vouchers: TallyVoucherInput[];
}): { xml: string; includedCount: number } {
  const filtered = input.vouchers.filter(
    (v) =>
      v.date >= input.fromDate &&
      v.date <= input.toDate &&
      input.voucherTypes.includes(v.voucherType),
  );

  const voucherNodes = filtered
    .map(
      (v) => `      <TALLYMESSAGE xmlns:UDF="TallyUDF">
        <VOUCHER VCHTYPE="${escapeXml(v.voucherType)}" ACTION="Create">
          <DATE>${escapeXml(v.date.replace(/-/g, ''))}</DATE>
          <VOUCHERNUMBER>${escapeXml(v.voucherNo)}</VOUCHERNUMBER>
          <PARTYLEDGERNAME>${escapeXml(v.partyName)}</PARTYLEDGERNAME>
          <NARRATION>${escapeXml(v.narration)}</NARRATION>
          <AMOUNT>${Number(subMoney(v.amount, 0)).toFixed(2)}</AMOUNT>
        </VOUCHER>
      </TALLYMESSAGE>`,
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVFROMDATE>${escapeXml(input.fromDate.replace(/-/g, ''))}</SVFROMDATE>
          <SVTODATE>${escapeXml(input.toDate.replace(/-/g, ''))}</SVTODATE>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
${voucherNodes}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

  return { xml, includedCount: filtered.length };
}

export type OpeningBalanceStatus = 'DRAFT' | 'SIGNED_OFF' | 'IMPORTED' | 'REVERSED';

export function transitionOpeningBalanceBatch(
  currentStatus: OpeningBalanceStatus,
  action: 'SIGN_OFF' | 'IMPORT' | 'REVERSE',
  cutoffDate?: string,
): OpeningBalanceStatus {
  if (action === 'SIGN_OFF') {
    if (currentStatus !== 'DRAFT') {
      throw new Error('Only DRAFT batches can be signed off.');
    }
    if (!cutoffDate) {
      throw new Error('Cut-off date is required for owner sign-off.');
    }
    return 'SIGNED_OFF';
  }
  if (action === 'IMPORT') {
    if (currentStatus !== 'SIGNED_OFF') {
      throw new Error('Batch must be SIGNED_OFF by Owner before import.');
    }
    return 'IMPORTED';
  }
  if (action === 'REVERSE') {
    if (currentStatus !== 'IMPORTED') {
      throw new Error('Only IMPORTED batches can be reversed.');
    }
    return 'REVERSED';
  }
  throw new Error(`Unsupported action: ${action}`);
}

