import {
  formatINR,
  parseINR,
  formatDateIST,
  formatDateTimeIST,
  addMoney,
  subMoney,
  mulMoney,
  pctOf,
  cmpMoney,
} from '@neo/shared';

export {
  formatINR,
  parseINR,
  formatDateIST,
  formatDateTimeIST,
  addMoney,
  subMoney,
  mulMoney,
  pctOf,
  cmpMoney,
};

/**
 * Format any numeric or numeric string as INR with fallback
 */
export function displayINR(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return '₹0.00';
  return formatINR(amount);
}

/**
 * Friendly time ago (e.g. "Just now", "5m ago", "2h ago")
 */
export function timeAgo(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

