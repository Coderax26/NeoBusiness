import { QueryClient, type DefaultOptions } from '@tanstack/react-query';
import type { FriendlyApiError } from './api-client';

const queryConfig: DefaultOptions = {
  queries: {
    // 30 second background refresh while tab visible per OD-021
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
    refetchOnWindowFocus: true,
    retry(failureCount, error: any) {
      const err = error as FriendlyApiError;
      // Never retry client validation, auth, or permission errors
      if (err?.status && [400, 401, 403, 404, 422].includes(err.status)) {
        return false;
      }
      return failureCount < 2;
    },
  },
  mutations: {
    retry: 0,
  },
};

export function createQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: queryConfig });
}

// Module Query Key Factories
export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
  },
  commercial: {
    orders: (filters?: Record<string, any>) => ['m1', 'orders', filters] as const,
    order: (id: string) => ['m1', 'orders', id] as const,
    quotes: (filters?: Record<string, any>) => ['m1', 'quotes', filters] as const,
    prices: (date: string) => ['m1', 'prices', date] as const,
  },
  procurement: {
    pos: (filters?: Record<string, any>) => ['m2', 'pos', filters] as const,
    requisitions: (filters?: Record<string, any>) => ['m2', 'requisitions', filters] as const,
    bills: (filters?: Record<string, any>) => ['m2', 'bills', filters] as const,
    suppliers: (filters?: Record<string, any>) => ['m2', 'suppliers', filters] as const,
  },
  inventory: {
    stock: (siteId?: string) => ['m3', 'stock', siteId] as const,
    counts: (siteId?: string) => ['m3', 'counts', siteId] as const,
    transfers: (siteId?: string) => ['m3', 'transfers', siteId] as const,
  },
  fleet: {
    trips: (filters?: Record<string, any>) => ['m5', 'trips', filters] as const,
    vehicles: (siteId?: string) => ['m5', 'vehicles', siteId] as const,
  },
  finance: {
    invoices: (filters?: Record<string, any>) => ['m6', 'invoices', filters] as const,
    expenses: (filters?: Record<string, any>) => ['m6', 'expenses', filters] as const,
    cashbook: (siteId?: string) => ['m6', 'cashbook', siteId] as const,
    ledger: (customerId: string) => ['m6', 'customers', customerId, 'ledger'] as const,
  },
};
