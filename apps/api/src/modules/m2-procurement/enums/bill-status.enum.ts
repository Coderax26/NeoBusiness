/**
 * Supplier Bill Status Enum
 */

export enum BillStatus {
  /** Bill not yet submitted for approval */
  DRAFT = 'DRAFT',

  /** Submitted for approval, awaiting review */
  PENDING_APPROVAL = 'PENDING_APPROVAL',

  /** Approved, ready to generate taxes and post */
  APPROVED = 'APPROVED',

  /** Rejected, requires correction */
  REJECTED = 'REJECTED',
}
