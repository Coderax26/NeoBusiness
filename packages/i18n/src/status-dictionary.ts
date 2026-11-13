/**
 * Human Status Dictionary (§6 & Rule U2)
 * Translates technical ERP enum codes into clear, plain-language sentences in English & Marathi.
 * "Plain words first, ERP term second."
 */

export interface HumanStatus {
  code: string;
  en: string;
  mr: string;
  tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger';
  icon: string;
  description: string;
}

export const STATUS_DICTIONARY: Record<string, Record<string, HumanStatus>> = {
  ORDER: {
    DRAFT: {
      code: 'DRAFT',
      en: 'Draft',
      mr: 'कच्चा मसुदा',
      tone: 'neutral',
      icon: 'pencil',
      description: 'Order is being drafted and not yet submitted.',
    },
    PENDING_APPROVAL: {
      code: 'PENDING_APPROVAL',
      en: 'Waiting for Owner',
      mr: 'मालक मंजुरीची प्रतीक्षा',
      tone: 'warning',
      icon: 'hourglass',
      description: 'Price is below floor or credit limit exceeded; awaiting Owner sign-off.',
    },
    CONFIRMED: {
      code: 'CONFIRMED',
      en: 'Confirmed',
      mr: 'निश्चित केले',
      tone: 'info',
      icon: 'check',
      description: 'Order confirmed and committed to production & dispatch.',
    },
    IN_PRODUCTION_SOURCING: {
      code: 'IN_PRODUCTION_SOURCING',
      en: 'Being made / sourced',
      mr: 'उत्पादन / खरेदी सुरू',
      tone: 'info',
      icon: 'factory',
      description: 'Items are being produced or sourced from supplier.',
    },
    READY: {
      code: 'READY',
      en: 'Ready to dispatch',
      mr: 'वितरणासाठी सज्ज',
      tone: 'success',
      icon: 'package',
      description: 'Stock allocated and staged for loading.',
    },
    DISPATCHED: {
      code: 'DISPATCHED',
      en: 'On the way',
      mr: 'मार्गावर आहे',
      tone: 'info',
      icon: 'truck',
      description: 'Loaded on vehicle and in transit to customer.',
    },
    DELIVERED: {
      code: 'DELIVERED',
      en: 'Delivered',
      mr: 'पोहोचवले',
      tone: 'success',
      icon: 'check-circle',
      description: 'Goods safely handed over to customer.',
    },
    DELIVERED_FULL: {
      code: 'DELIVERED_FULL',
      en: 'Delivered',
      mr: 'पूर्ण वितरित',
      tone: 'success',
      icon: 'check-circle',
      description: 'Entire quantity received and acknowledged.',
    },
    DELIVERED_PARTIAL: {
      code: 'DELIVERED_PARTIAL',
      en: 'Partly delivered',
      mr: 'अंशतः वितरित',
      tone: 'warning',
      icon: 'alert-triangle',
      description: 'Partial quantity delivered; shortfall flagged for redelivery or credit.',
    },
    CLOSED: {
      code: 'CLOSED',
      en: 'Closed',
      mr: 'पूर्ण झाले',
      tone: 'neutral',
      icon: 'archive',
      description: 'Order fully delivered, invoiced, and settled.',
    },
    CANCELLED: {
      code: 'CANCELLED',
      en: 'Cancelled',
      mr: 'रद्द केले',
      tone: 'danger',
      icon: 'x',
      description: 'Order cancelled before fulfillment.',
    },
    REJECTED: {
      code: 'REJECTED',
      en: 'Rejected',
      mr: 'नाकारले',
      tone: 'danger',
      icon: 'x-circle',
      description: 'Price or credit override was rejected by Owner.',
    },
  },

  INVOICE: {
    UNPAID: {
      code: 'UNPAID',
      en: 'Not paid',
      mr: 'थकीत',
      tone: 'neutral',
      icon: 'clock',
      description: 'Invoice issued; payment is within credit terms.',
    },
    PARTIAL: {
      code: 'PARTIAL',
      en: 'Part paid',
      mr: 'अंशतः भरलेले',
      tone: 'warning',
      icon: 'pie-chart',
      description: 'Partial payment received; balance pending.',
    },
    PAID: {
      code: 'PAID',
      en: 'Paid',
      mr: 'पूर्ण भरलेले',
      tone: 'success',
      icon: 'check-circle',
      description: 'Invoice settled in full.',
    },
    OVERDUE: {
      code: 'OVERDUE',
      en: 'Overdue',
      mr: 'मुदत उलटून गेलेले',
      tone: 'danger',
      icon: 'alert-circle',
      description: 'Payment past credit term due date.',
    },
  },

  PO: {
    DRAFT: {
      code: 'DRAFT',
      en: 'Draft',
      mr: 'कच्चा मसुदा',
      tone: 'neutral',
      icon: 'pencil',
      description: 'Purchase order is being created.',
    },
    PENDING_APPROVAL: {
      code: 'PENDING_APPROVAL',
      en: 'Waiting approval',
      mr: 'मंजुरीची प्रतीक्षा',
      tone: 'warning',
      icon: 'hourglass',
      description: 'PO value exceeds threshold; awaiting sign-off.',
    },
    ISSUED: {
      code: 'ISSUED',
      en: 'Sent to supplier',
      mr: 'पुरवठादारास पाठवले',
      tone: 'info',
      icon: 'send',
      description: 'Purchase order issued to supplier.',
    },
    PARTIALLY_RECEIVED: {
      code: 'PARTIALLY_RECEIVED',
      en: 'Partly received',
      mr: 'अंशतः प्राप्त',
      tone: 'warning',
      icon: 'package',
      description: 'Some shipments received via Blind GRN.',
    },
    CLOSED: {
      code: 'CLOSED',
      en: 'Closed',
      mr: 'पूर्ण झाले',
      tone: 'success',
      icon: 'check-circle',
      description: 'All items received and matched with bills.',
    },
  },

  EXCEPTION: {
    PENDING: {
      code: 'PENDING',
      en: 'Needs decision',
      mr: 'निर्णयाची आवश्यकता',
      tone: 'warning',
      icon: 'alert-triangle',
      description: 'Action required from Owner or approver.',
    },
    APPROVED: {
      code: 'APPROVED',
      en: 'Approved',
      mr: 'मंजूर केले',
      tone: 'success',
      icon: 'check',
      description: 'Exception approved with authorization record.',
    },
    REJECTED: {
      code: 'REJECTED',
      en: 'Rejected',
      mr: 'नाकारले',
      tone: 'danger',
      icon: 'x',
      description: 'Exception rejected; original restriction stands.',
    },
    COUNTERED: {
      code: 'COUNTERED',
      en: 'Counter offered',
      mr: 'पर्यायी प्रस्ताव',
      tone: 'info',
      icon: 'repeat',
      description: 'Owner offered an alternative price or credit ceiling.',
    },
    EXPIRED: {
      code: 'EXPIRED',
      en: 'Expired',
      mr: 'कालबाह्य झाले',
      tone: 'neutral',
      icon: 'clock',
      description: 'Exception decision expired without action.',
    },
  },

  THREE_WAY_MATCH: {
    MATCHED: {
      code: 'MATCHED',
      en: 'Matches PO & GRN',
      mr: 'PO आणि GRN शी तंतोतंत',
      tone: 'success',
      icon: 'check-circle',
      description: 'Bill quantity and rate match PO and actual physical receipt.',
    },
    TIMING: {
      code: 'TIMING',
      en: 'Timing differs',
      mr: 'वेळेतील तफावत',
      tone: 'warning',
      icon: 'clock',
      description: 'Goods received before or after bill date.',
    },
    AMOUNT: {
      code: 'AMOUNT',
      en: 'Amount differs',
      mr: 'रक्कमेत तफावत',
      tone: 'danger',
      icon: 'alert-triangle',
      description: 'Bill rate differs from PO agreement; requires review.',
    },
    FULL_MISMATCH: {
      code: 'FULL_MISMATCH',
      en: 'Does not match',
      mr: 'तफावत आढळली',
      tone: 'danger',
      icon: 'x-circle',
      description: 'Quantity and amount differ substantially from GRN receipt.',
    },
  },
};

/**
 * Returns the human-readable status for any entity and code.
 * Falls back safely if the code is unknown.
 */
export function getHumanStatus(
  entity?: string,
  code?: string,
  locale: 'en' | 'mr' = 'en',
): HumanStatus {
  const safeEntity = String(entity || 'ORDER').toUpperCase();
  const safeCode = String(code || 'DRAFT').toUpperCase();
  const entityGroup = STATUS_DICTIONARY[safeEntity];
  const match = entityGroup?.[safeCode];

  if (match) {
    return match;
  }

  // Graceful fallback: un-snake code to Title Case
  const fallbackLabel = String(code || entity || 'Status')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return {
    code: safeCode,
    en: fallbackLabel,
    mr: fallbackLabel,
    tone: 'neutral',
    icon: 'info',
    description: `Status: ${fallbackLabel}`,
  };
}

