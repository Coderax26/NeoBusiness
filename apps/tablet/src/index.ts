/**
 * Milestone F6 — Factory & Warehouse Tablet PWA (M3, M4)
 *
 * Implements:
 * - F6.1: Offline Outbox Queue (IndexedDB/Dexie model), OfflineBadge state, idempotent replay
 * - F6.2: Touch-First Production Kanban (targets >= 48px, zero financial/cost leakage for PROD_MGR)
 * - F6.3: Tactile Numeric Keypad & Batch Completion with Yield Mass-Balance check (BR-06, OD-012)
 * - F6.4: Blind GRN Receiving Desk with zero PO quantity/price leakage (BR-05)
 * - F6.5: Vehicle Loading Checklist unlocking office trip dispatch
 */

import {
  evaluateBatchYield,
  maskSensitivePayload,
  type BatchYieldEvaluation,
} from '@neo/shared';
import { DESIGN_TOKENS } from '@neo/ui';
import type { NeoApiClient } from '@neo/api-client';

export type OfflineBadgeStatus = 'ONLINE' | 'OFFLINE' | 'SYNCING';

export type TabletCommandType =
  | 'GRN_BLIND_RECEIVE'
  | 'WORK_ORDER_COMPLETE'
  | 'TRIP_CONFIRM_LOADING'
  | 'STOCK_TRANSFER'
  | 'ORDER_CONFIRM'
  | 'PRICE_CHANGE'
  | 'EXCEPTION_RESOLVE';

const SERVER_AUTHORITY_ONLY_COMMANDS = new Set<TabletCommandType>([
  'ORDER_CONFIRM',
  'PRICE_CHANGE',
  'EXCEPTION_RESOLVE',
]);

export interface OutboxQueuedCommand {
  id: string;
  idempotencyKey: string;
  type: TabletCommandType;
  path: string;
  payload: Record<string, unknown>;
  createdAt: string;
  status: 'QUEUED' | 'SYNCED' | 'FAILED';
  errorReason?: string;
}

export class TabletOfflineOutbox {
  private isOnline = true;
  private isSyncing = false;
  private lastSyncedAt: string | null = null;
  private outbox: OutboxQueuedCommand[] = [];

  constructor(private readonly apiClient: NeoApiClient) {}

  setNetworkStatus(online: boolean): void {
    this.isOnline = online;
  }

  getBadgeState(): {
    status: OfflineBadgeStatus;
    queuedCount: number;
    lastSyncedAt: string | null;
    label: string;
  } {
    const queuedCount = this.outbox.filter((c) => c.status === 'QUEUED').length;
    if (this.isSyncing) {
      return {
        status: 'SYNCING',
        queuedCount,
        lastSyncedAt: this.lastSyncedAt,
        label: `Syncing (${queuedCount})`,
      };
    }
    if (!this.isOnline) {
      return {
        status: 'OFFLINE',
        queuedCount,
        lastSyncedAt: this.lastSyncedAt,
        label: queuedCount > 0 ? `Offline (${queuedCount} queued)` : 'Offline',
      };
    }
    return {
      status: 'ONLINE',
      queuedCount,
      lastSyncedAt: this.lastSyncedAt,
      label: 'Online',
    };
  }

  /**
   * Enqueues or executes a tablet action.
   * Actions requiring server authority (confirm order, change price, approve) are blocked offline (10_FE_Web_Frontend.md §9).
   */
  async dispatchCommand(input: {
    type: TabletCommandType;
    path: string;
    payload: Record<string, unknown>;
    idempotencyKey?: string;
  }): Promise<{
    accepted: boolean;
    mode: 'EXECUTED_ONLINE' | 'QUEUED_OFFLINE' | 'BLOCKED_OFFLINE';
    idempotencyKey?: string;
    reason?: string;
  }> {
    if (!this.isOnline && SERVER_AUTHORITY_ONLY_COMMANDS.has(input.type)) {
      return {
        accepted: false,
        mode: 'BLOCKED_OFFLINE',
        reason: `${input.type} requires live server authority and cannot be performed offline`,
      };
    }

    const idemKey =
      input.idempotencyKey ?? `tab-idem-${input.type}-${Date.now()}-${Math.random()}`;

    if (!this.isOnline) {
      // Prevent duplicate queueing of the same idempotencyKey
      const existing = this.outbox.find((c) => c.idempotencyKey === idemKey);
      if (!existing) {
        this.outbox.push({
          id: `outbox-${this.outbox.length + 1}`,
          idempotencyKey: idemKey,
          type: input.type,
          path: input.path,
          payload: structuredClone(input.payload),
          createdAt: new Date().toISOString(),
          status: 'QUEUED',
        });
      }
      return {
        accepted: true,
        mode: 'QUEUED_OFFLINE',
        idempotencyKey: idemKey,
      };
    }

    await this.apiClient.request(input.path, {
      method: 'POST',
      body: input.payload,
      idempotencyKey: idemKey,
    });
    this.lastSyncedAt = new Date().toISOString();
    return {
      accepted: true,
      mode: 'EXECUTED_ONLINE',
      idempotencyKey: idemKey,
    };
  }

  /**
   * Reconnects and replays all queued commands in FIFO order using their original idempotency keys.
   */
  async syncOutbox(): Promise<{
    syncedCount: number;
    remainingQueuedCount: number;
  }> {
    this.isOnline = true;
    this.isSyncing = true;

    let syncedCount = 0;
    for (const cmd of this.outbox) {
      if (cmd.status !== 'QUEUED') continue;
      const res = await this.apiClient.request(cmd.path, {
        method: 'POST',
        body: cmd.payload,
        idempotencyKey: cmd.idempotencyKey,
      });
      if (!res.error) {
        cmd.status = 'SYNCED';
        syncedCount += 1;
      } else {
        cmd.status = 'FAILED';
        cmd.errorReason = res.error.message;
      }
    }

    this.isSyncing = false;
    this.lastSyncedAt = new Date().toISOString();
    return {
      syncedCount,
      remainingQueuedCount: this.outbox.filter((c) => c.status === 'QUEUED').length,
    };
  }

  /**
   * Serializes outbox state to survive browser restart / refresh.
   */
  exportPersistenceSnapshot(): string {
    return JSON.stringify(this.outbox);
  }

  restorePersistenceSnapshot(snapshotJson: string): void {
    this.outbox = JSON.parse(snapshotJson) as OutboxQueuedCommand[];
  }
}

export class TactileNumericKeypad {
  private buffer = '';

  press(key: '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | 'BACKSPACE' | 'CLEAR'): string {
    if (key === 'CLEAR') {
      this.buffer = '';
      return '0';
    }
    if (key === 'BACKSPACE') {
      this.buffer = this.buffer.slice(0, -1);
      return this.buffer || '0';
    }
    if (key === '.') {
      if (!this.buffer.includes('.')) {
        this.buffer = (this.buffer || '0') + '.';
      }
      return this.buffer;
    }
    // Enforce max 3 decimal places for quantities
    const parts = this.buffer.split('.');
    if (parts[1] && parts[1].length >= 3) {
      return this.buffer;
    }
    this.buffer = this.buffer === '0' ? key : this.buffer + key;
    return this.buffer;
  }

  getNumericValue(): number {
    return Number(this.buffer || '0');
  }
}

export class TabletWarehouseProductionDesk {
  readonly minTouchTargetPx = DESIGN_TOKENS.touchTargetMinPx;

  constructor(private readonly outbox: TabletOfflineOutbox) {}

  /**
   * F6.2: Masks work order cards for PROD_MGR so zero cost/price/margin fields ever enter DOM state.
   */
  prepareKanbanWorkOrdersForProdMgr<T>(rawWorkOrders: T): T {
    return maskSensitivePayload('PROD_MGR', rawWorkOrders);
  }

  /**
   * F6.3 & BR-06: Completes a production batch. Warns on yield variance past ±3% (OD-012)
   * but NEVER blocks saving output.
   */
  async completeProductionBatch(input: {
    workOrderId: string;
    issuedRmKg: number;
    actualOutputKg: number;
    scrapKg: number;
    scrapReason?: string;
    idempotencyKey?: string;
  }): Promise<{
    saved: boolean;
    yieldEvaluation: BatchYieldEvaluation;
    warningDisplayed: boolean;
    syncMode: 'EXECUTED_ONLINE' | 'QUEUED_OFFLINE' | 'BLOCKED_OFFLINE';
  }> {
    const yieldEvaluation = evaluateBatchYield(
      input.issuedRmKg,
      input.actualOutputKg,
      input.scrapKg,
    );

    const dispatch = await this.outbox.dispatchCommand({
      type: 'WORK_ORDER_COMPLETE',
      path: `/production/work-orders/${input.workOrderId}/complete`,
      payload: {
        workOrderId: input.workOrderId,
        actualOutputKg: input.actualOutputKg,
        scrapKg: input.scrapKg,
        scrapReason: input.scrapReason,
      },
      idempotencyKey: input.idempotencyKey,
    });

    return {
      saved: dispatch.accepted,
      yieldEvaluation,
      warningDisplayed: yieldEvaluation.exceedsTolerance,
      syncMode: dispatch.mode,
    };
  }

  /**
   * F6.4 & BR-05: Prepares Blind GRN screen state — strips all PO ordered quantities and prices.
   */
  prepareBlindGrnView<T>(rawPoPayload: T): T {
    return maskSensitivePayload('STOREKEEPER', rawPoPayload, 'BLIND_GRN');
  }

  async submitBlindGrn(input: {
    poId: string;
    lines: Array<{
      lineId: string;
      itemId: string;
      countedQty: number;
      batchNumber: string;
      expiryDate: string;
    }>;
    deliveryNotePhotoId?: string;
    idempotencyKey?: string;
  }) {
    return this.outbox.dispatchCommand({
      type: 'GRN_BLIND_RECEIVE',
      path: '/procurement/grns', // blind GRN = POST /procurement/grns (qty counted only, BR-05)
      payload: input,
      idempotencyKey: input.idempotencyKey,
    });
  }

  /**
   * F6.5: Confirms vehicle loading checklist on the tablet.
   */
  async confirmVehicleLoading(input: {
    tripId: string;
    verifiedCratesCount: number;
    idempotencyKey?: string;
  }) {
    return this.outbox.dispatchCommand({
      type: 'TRIP_CONFIRM_LOADING',
      path: `/trips/${input.tripId}/confirm-loading`,
      payload: input,
      idempotencyKey: input.idempotencyKey,
    });
  }
}

