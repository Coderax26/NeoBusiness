import { Injectable, BadRequestException } from '@nestjs/common';

/**
 * PO State Machine - Enforces valid state transitions for Purchase Orders
 *
 * States: DRAFT → PENDING_APPROVAL → ISSUED → PARTIALLY_RECEIVED → CLOSED
 *                    ↘ CANCELLED ↙                    ↘ CANCELLED
 *
 * Rules:
 * - DRAFT can go to PENDING_APPROVAL (price spike) or ISSUED (no spike) or CANCELLED
 * - PENDING_APPROVAL can go to ISSUED (approved) or CANCELLED (rejected)
 * - ISSUED can go to PARTIALLY_RECEIVED (GRN posted) or CANCELLED
 * - PARTIALLY_RECEIVED can go to CLOSED (fully received) or CANCELLED
 * - CLOSED is terminal
 * - CANCELLED is terminal
 */
@Injectable()
export class POStateMachine {
  private readonly validTransitions: Record<string, string[]> = {
    DRAFT: ['PENDING_APPROVAL', 'ISSUED', 'CANCELLED'],
    PENDING_APPROVAL: ['ISSUED', 'CANCELLED'],
    ISSUED: ['PARTIALLY_RECEIVED', 'CLOSED', 'CANCELLED'],
    PARTIALLY_RECEIVED: ['CLOSED', 'CANCELLED'],
    CLOSED: [],
    CANCELLED: [],
  };

  private readonly terminalStates = ['CLOSED', 'CANCELLED'];

  /**
   * Check if a state transition is valid
   */
  canTransition(from: string, to: string): boolean {
    if (this.terminalStates.includes(from)) {
      return false;
    }
    return this.validTransitions[from]?.includes(to) ?? false;
  }

  /**
   * Get valid next states from current state
   */
  getValidNextStates(current: string): string[] {
    return this.validTransitions[current] ?? [];
  }

  /**
   * Validate and throw if transition is invalid
   */
  assertCanTransition(from: string, to: string): void {
    if (!this.canTransition(from, to)) {
      throw new BadRequestException(
        `Invalid PO state transition: ${from} → ${to}. Valid: ${this.validTransitions[from]?.join(', ') ?? 'none'}`,
      );
    }
  }

  /**
   * Check if state is terminal
   */
  isTerminal(state: string): boolean {
    return this.terminalStates.includes(state);
  }

  /**
   * Check if PO can be issued (from DRAFT)
   */
  canIssue(status: string): boolean {
    return status === 'DRAFT';
  }

  /**
   * Check if PO can be cancelled
   */
  canCancel(status: string): boolean {
    return !this.terminalStates.includes(status);
  }

  /**
   * Check if PO can receive GRN
   */
  canReceive(status: string): boolean {
    return status === 'ISSUED' || status === 'PARTIALLY_RECEIVED';
  }

  /**
   * Check if PO can be closed (fully received)
   */
  canClose(status: string, receivedQty: number, confirmedQty: number): boolean {
    if (status !== 'PARTIALLY_RECEIVED') {
      return false;
    }
    return receivedQty >= confirmedQty;
  }
}

/**
 * State transition audit entry for logging
 */
export interface POStateTransition {
  from: string;
  to: string;
  timestamp: Date;
  userId: string;
  reason?: string;
}
