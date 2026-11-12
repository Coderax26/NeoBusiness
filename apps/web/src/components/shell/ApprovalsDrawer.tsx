'use client';

import React, { useState, useEffect } from 'react';
import { Drawer, Button, ExceptionCard, EmptyState } from '@neo/ui';

export interface PendingException {
  id: string;
  type: string;
  title: string;
  summary: string;
  impact: string;
  requestedBy: string;
  createdAt: string;
}

export const ApprovalsDrawer: React.FC<{
  open: boolean;
  onClose: () => void;
  onCountChange?: (count: number) => void;
}> = ({ open, onClose, onCountChange }) => {
  const [exceptions, setExceptions] = useState<PendingException[]>([
    {
      id: 'EXP-001',
      type: 'PRICE_BELOW_FLOOR',
      title: 'Order SO-2611-0042 Price Below Floor',
      summary: 'Sales coordinator quoted ₹420/kg for Alphonso Pulp (Daily Floor: ₹435/kg). Volume: 1,200 kg.',
      impact: 'Gross margin drops from 16.2% to 12.8% (-₹18,000 on order). Customer is Tier-1 Distributor.',
      requestedBy: 'Priya (Ops Coordinator)',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'EXP-002',
      type: 'CREDIT_LIMIT_BREACH',
      title: 'Credit Limit Breach for Sai Supermart',
      summary: 'Order value ₹85,000 exceeds available credit limit of ₹20,000 (Current AR: ₹1,80,000 / Limit: ₹2,00,000).',
      impact: 'Exposure increases to ₹2,65,000. Customer has 1 overdue invoice past 15 days.',
      requestedBy: 'Amit (Sales Desk)',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'EXP-003',
      type: 'SUPPLIER_RATE_SPIKE',
      title: 'Raw Mango Purchase Rate Spike',
      summary: 'PO-2611-0018 rate quoted at ₹38/kg vs standard contract rate of ₹32/kg due to local market shortage.',
      impact: 'Batch production cost increases by ₹14,400 across 2.4 MT lot.',
      requestedBy: 'Kiran (Procurement Desk)',
      createdAt: new Date().toISOString(),
    },
  ]);

  useEffect(() => {
    onCountChange?.(exceptions.length);
  }, [exceptions.length, onCountChange]);

  const handleApprove = (id: string) => {
    setExceptions((prev) => prev.filter((e) => e.id !== id));
  };

  const handleReject = (id: string) => {
    setExceptions((prev) => prev.filter((e) => e.id !== id));
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Approvals & Exceptions Inbox"
      subtitle={`${exceptions.length} decisions waiting for your authorization`}
      width="lg"
    >
      <div className="space-y-4">
        {exceptions.length === 0 ? (
          <EmptyState
            icon="🎉"
            title="All caught up!"
            description="There are no pending price overrides, credit breaches, or supplier rate exceptions waiting for decision."
          />
        ) : (
          exceptions.map((exc) => (
            <ExceptionCard
              key={exc.id}
              id={exc.id}
              type={exc.type}
              title={exc.title}
              summary={exc.summary}
              impact={exc.impact}
              onApprove={handleApprove}
              onReject={handleReject}
              onCounter={(id) => {
                alert(`Counter-offer dialog opened for ${id}`);
              }}
            />
          ))
        )}
      </div>
    </Drawer>
  );
};
