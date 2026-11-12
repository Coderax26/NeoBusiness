/**
 * Milestone F8 — Field Mobile Client (Driver & Collector)
 *
 * Implements:
 * - F8.1: Airplane-mode offline command queue, device timestamp & clock-skew detection
 * - F8.2: Driver stop manifest & Google Maps navigation handoff
 * - F8.3: Electronic Proof of Delivery (ePOD) with signature/photo & optional OTP (OD-014)
 * - F8.4: Doorstep COD/AR cash & cheque capture into custody wallet (OD-015) & trip-close blockers (BR-08)
 */

import {
  evaluateTripClosureReadiness,
  CONFIRMED_BUSINESS_CONFIG,
  type TripClosureReadiness,
} from '@neo/shared';

export interface MobileQueuedMutation {
  idempotencyKey: string;
  type: 'EPOD_CAPTURE' | 'COD_COLLECTION' | 'RETURN_ISSUE_REPORT';
  payload: Record<string, unknown>;
  deviceTimestampIso: string;
  synced: boolean;
}

export class FieldMobileController {
  private isAirplaneMode = false;
  private queue: MobileQueuedMutation[] = [];
  private walletCashInr = 0;
  private walletChequesInr = 0;

  setAirplaneMode(offline: boolean): void {
    this.isAirplaneMode = offline;
  }

  /**
   * F8.1: Evaluates device timestamp against server clock and flags skew > 5 minutes.
   */
  checkClockSkew(deviceTimeMs: number, serverTimeMs: number): {
    skewMinutes: number;
    hasClockSkewWarning: boolean;
  } {
    const skewMinutes = Number(
      (Math.abs(deviceTimeMs - serverTimeMs) / (60 * 1000)).toFixed(1),
    );
    return {
      skewMinutes,
      hasClockSkewWarning: skewMinutes > 5,
    };
  }

  /**
   * F8.2: Builds turn-by-turn navigation deep link for a delivery stop.
   */
  buildNavigationDeepLink(lat: number, lng: number): string {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
  }

  /**
   * F8.3 & OD-014: Captures ePOD at customer stop.
   * Signature and photo are required for offline-first MVP (epod_otp_required = false);
   * OTP is only required if the stop is explicitly flagged as creditHoldOtpRequired.
   */
  captureStopEpod(input: {
    stopId: string;
    signatureSvg: string;
    photoUri: string;
    otpCode?: string;
    creditHoldOtpRequired?: boolean;
    idempotencyKey?: string;
  }): {
    completed: boolean;
    queuedOffline: boolean;
    otpRequiredByDefault: boolean;
    error?: string;
  } {
    if (!input.signatureSvg || !input.photoUri) {
      return {
        completed: false,
        queuedOffline: false,
        otpRequiredByDefault: CONFIRMED_BUSINESS_CONFIG.EPOD_OTP_REQUIRED,
        error: 'Both customer signature and delivery photo are required for ePOD',
      };
    }

    if (input.creditHoldOtpRequired && !input.otpCode) {
      return {
        completed: false,
        queuedOffline: false,
        otpRequiredByDefault: CONFIRMED_BUSINESS_CONFIG.EPOD_OTP_REQUIRED,
        error: 'OTP required for Credit-Hold delivery stop',
      };
    }

    const idemKey = input.idempotencyKey ?? `epod-${input.stopId}`;
    const existing = this.queue.find((q) => q.idempotencyKey === idemKey);
    if (!existing) {
      this.queue.push({
        idempotencyKey: idemKey,
        type: 'EPOD_CAPTURE',
        payload: input,
        deviceTimestampIso: new Date().toISOString(),
        synced: !this.isAirplaneMode,
      });
    }

    return {
      completed: true,
      queuedOffline: this.isAirplaneMode,
      otpRequiredByDefault: CONFIRMED_BUSINESS_CONFIG.EPOD_OTP_REQUIRED,
    };
  }

  /**
   * F8.4 & OD-015: Captures doorstep cash or cheque collection.
   * Only physical CASH and CHEQUE enter the driver/collector custody wallet;
   * UPI/bank transfers credit the bank directly and bypass physical custody.
   */
  recordDoorstepCollection(input: {
    stopId: string;
    mode: 'CASH' | 'CHEQUE' | 'UPI_DIRECT';
    amountInr: number;
    idempotencyKey?: string;
  }): {
    walletCashInr: number;
    walletChequesInr: number;
    enteredCustodyWallet: boolean;
  } {
    const idemKey = input.idempotencyKey ?? `coll-${input.stopId}-${input.mode}`;
    const alreadyRecorded = this.queue.some((q) => q.idempotencyKey === idemKey);

    if (!alreadyRecorded) {
      this.queue.push({
        idempotencyKey: idemKey,
        type: 'COD_COLLECTION',
        payload: input,
        deviceTimestampIso: new Date().toISOString(),
        synced: !this.isAirplaneMode,
      });

      if (input.mode === 'CASH') {
        this.walletCashInr = Number((this.walletCashInr + input.amountInr).toFixed(2));
      } else if (input.mode === 'CHEQUE') {
        this.walletChequesInr = Number(
          (this.walletChequesInr + input.amountInr).toFixed(2),
        );
      }
    }

    return {
      walletCashInr: this.walletCashInr,
      walletChequesInr: this.walletChequesInr,
      enteredCustodyWallet: input.mode === 'CASH' || input.mode === 'CHEQUE',
    };
  }

  syncOfflineQueue(): { syncedCount: number } {
    this.isAirplaneMode = false;
    let syncedCount = 0;
    for (const item of this.queue) {
      if (!item.synced) {
        item.synced = true;
        syncedCount += 1;
      }
    }
    return { syncedCount };
  }

  checkTripCloseReadiness(input: {
    pendingStopsCount: number;
    unloggedReturnsCount: number;
    uncollectedCodOrdersCount: number;
  }): TripClosureReadiness {
    return evaluateTripClosureReadiness(input);
  }
}

