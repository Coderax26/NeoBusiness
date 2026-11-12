import React from 'react';
import { KpiCard } from './KpiCard';

export default {
  title: 'UI/KpiCard',
  component: KpiCard,
};

export const SalesKpi = () => (
  <KpiCard
    title="Today's Sales"
    value="₹ 4,82,450"
    subtitle="Target: ₹ 5,00,000"
    trend={{ direction: 'up', label: '+12.4% vs yesterday' }}
    sparklineValues={[32, 45, 48, 55, 62, 70, 75]}
    tone="success"
  />
);

export const ARAgingKpi = () => (
  <KpiCard
    title="Overdue Receivables"
    value="₹ 1,24,000"
    subtitle="4 accounts > 30 days"
    trend={{ direction: 'down', label: '-8.2% overdue' }}
    sparklineValues={[90, 85, 75, 70, 65, 55, 50]}
    tone="danger"
  />
);
