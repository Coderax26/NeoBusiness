import React from 'react';
import { StatusBadge } from './StatusBadge';

export default {
  title: 'UI/StatusBadge',
  component: StatusBadge,
};

export const OrderConfirmed = () => <StatusBadge entity="ORDER" status="CONFIRMED" />;
export const OrderPendingApproval = () => <StatusBadge entity="ORDER" status="PENDING_APPROVAL" />;
export const InvoicePaid = () => <StatusBadge entity="INVOICE" status="PAID" />;
export const InvoiceOverdue = () => <StatusBadge entity="INVOICE" status="OVERDUE" />;
export const WorkOrderVariance = () => <StatusBadge entity="WORK_ORDER" status="VARIANCE_FLAG" />;

