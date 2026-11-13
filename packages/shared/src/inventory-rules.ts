/**
 * @neo/shared — Inventory, ATP, Expiry & Floor Offline Outbox Rules (Phase F6)
 * Implements:
 * - ATP = On Hand - Reserved (Acceptance Criterion #1)
 * - Expiry watchlist bucket classification & threshold filtering (Acceptance Criterion #5)
 * - Idempotent Offline Outbox queue for Floor Mode (Acceptance Criterion #3)
 */

export type ExpiryBucket =
  | 'EXPIRED'
  | 'LE_3_DAYS'
  | 'LE_7_DAYS'
  | 'LE_30_DAYS'
  | 'HEALTHY';

export interface ExpiryClassification {
  bucket: ExpiryBucket;
  label: string;
  color: 'rose' | 'amber' | 'emerald';
  suggestedAction: 'Write off' | 'Discount' | 'Sell first' | 'Normal FEFO';
}

export function computeAtp(onHand: number, reserved: number): number {
  return Math.max(0, Number((onHand - reserved).toFixed(3)));
}

export function classifyExpiryBucket(daysToExpiry: number): ExpiryClassification {
  if (daysToExpiry <= 0) {
    return {
      bucket: 'EXPIRED',
      label: 'Expired',
      color: 'rose',
      suggestedAction: 'Write off',
    };
  }
  if (daysToExpiry <= 3) {
    return {
      bucket: 'LE_3_DAYS',
      label: '≤ 3 days',
      color: 'rose',
      suggestedAction: 'Discount',
    };
  }
  if (daysToExpiry <= 7) {
    return {
      bucket: 'LE_7_DAYS',
      label: '≤ 7 days',
      color: 'amber',
      suggestedAction: 'Sell first',
    };
  }
  if (daysToExpiry <= 30) {
    return {
      bucket: 'LE_30_DAYS',
      label: '≤ 30 days',
      color: 'emerald',
      suggestedAction: 'Sell first',
    };
  }
  return {
    bucket: 'HEALTHY',
    label: '> 30 days',
    color: 'emerald',
    suggestedAction: 'Normal FEFO',
  };
}

export type FloorCommandType =
  | 'GRN_CAPTURE'
  | 'LOADING_CONFIRM'
  | 'TRANSFER_RECEIVE'
  | 'ADJUSTMENT_REQUEST'
  | 'APPROVAL_ACTION'
  | 'PRICING_CHANGE';

const SERVER_ONLY_FLOOR_COMMANDS = new Set<FloorCommandType>([
  'APPROVAL_ACTION',
  'PRICING_CHANGE',
]);

export interface FloorOutboxItem {
  id: string;
  idempotencyKey: string;
  type: FloorCommandType;
  endpoint: string;
  payload: Record<string, unknown>;
  captured_at: string;
  status: 'QUEUED' | 'SYNCED' | 'FAILED';
  errorReason?: string;
}

export function canQueueFloorCommandOffline(type: FloorCommandType): {
  allowed: boolean;
  reason?: string;
} {
  if (SERVER_ONLY_FLOOR_COMMANDS.has(type)) {
    return {
      allowed: false,
      reason: 'Approvals and pricing require an online connection to the server.',
    };
  }
  return { allowed: true };
}

/**
 * Replays queued Floor Outbox items idempotently — each queued item executes
 * at most once when online.
 */
export async function replayFloorOutbox(
  items: FloorOutboxItem[],
  sender: (item: FloorOutboxItem) => Promise<{ ok: boolean; error?: string }>,
): Promise<{
  updated: FloorOutboxItem[];
  syncedCount: number;
  failedCount: number;
}> {
  let syncedCount = 0;
  let failedCount = 0;
  const seenKeys = new Set<string>();
  const updated: FloorOutboxItem[] = [];

  for (const item of items) {
    if (item.status === 'SYNCED' || seenKeys.has(item.idempotencyKey)) {
      updated.push(item);
      continue;
    }
    seenKeys.add(item.idempotencyKey);

    try {
      const res = await sender(item);
      if (res.ok) {
        syncedCount += 1;
        updated.push({ ...item, status: 'SYNCED', errorReason: undefined });
      } else {
        failedCount += 1;
        updated.push({
          ...item,
          status: 'FAILED',
          errorReason: res.error || 'Server rejected sync',
        });
      }
    } catch (err) {
      failedCount += 1;
      updated.push({
        ...item,
        status: 'FAILED',
        errorReason: err instanceof Error ? err.message : 'Network error',
      });
    }
  }

  return { updated, syncedCount, failedCount };
}

