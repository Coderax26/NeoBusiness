'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  replayFloorOutbox,
  canQueueFloorCommandOffline,
  type FloorCommandType,
  type FloorOutboxItem,
} from '@neo/shared';

interface FloorOutboxContextValue {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncedAt: string;
  outbox: FloorOutboxItem[];
  pendingCount: number;
  failedItems: FloorOutboxItem[];
  setOnline: (online: boolean) => void;
  enqueueOrSend: (input: {
    type: FloorCommandType;
    endpoint: string;
    payload: Record<string, unknown>;
  }) => Promise<{ ok: boolean; queued: boolean; message: string }>;
  syncNow: () => Promise<void>;
  retryItem: (id: string) => Promise<void>;
}

const FloorOutboxContext = createContext<FloorOutboxContextValue | null>(null);
const STORAGE_KEY = 'neobus_floor_outbox_v1';

export function FloorOutboxProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState('10:02');
  const [outbox, setOutbox] = useState<FloorOutboxItem[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setOutbox(JSON.parse(saved));
    } catch {
      // ignore storage errors
    }
    if (typeof navigator !== 'undefined') {
      setIsOnline(navigator.onLine);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(outbox));
    } catch {
      // ignore storage errors
    }
  }, [outbox]);

  const sendToBackend = useCallback(async (item: FloorOutboxItem) => {
    try {
      const res = await fetch(item.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': item.idempotencyKey,
        },
        body: JSON.stringify({
          ...item.payload,
          captured_at: item.captured_at,
          idempotencyKey: item.idempotencyKey,
        }),
      });
      return {
        ok: res.ok,
        errorReason: res.ok ? undefined : `HTTP ${res.status}`,
      };
    } catch (err: any) {
      return {
        ok: false,
        errorReason: err?.message || 'Network request failed',
      };
    }
  }, []);

  const syncNow = useCallback(async () => {
    if (!isOnline) return;
    const queued = outbox.filter((i) => i.status === 'QUEUED');
    if (queued.length === 0) return;
    setIsSyncing(true);
    const result = await replayFloorOutbox(outbox, sendToBackend);
    const updatedMap = new Map(result.updated.map((u) => [u.id, u]));
    setOutbox((prev) =>
      prev.map((item) => {
        const replayed = updatedMap.get(item.id);
        if (!replayed) return item;
        // Preserve retry changes if item was re-queued while replay ran
        if (item.status === 'QUEUED' && replayed.status === 'FAILED') {
          return replayed;
        }
        return replayed;
      }),
    );
    setLastSyncedAt(
      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    );
    setIsSyncing(false);
  }, [isOnline, outbox, sendToBackend]);

  const setOnline = useCallback(
    (online: boolean) => {
      setIsOnline(online);
    },
    [],
  );

  useEffect(() => {
    if (isOnline && outbox.some((i) => i.status === 'QUEUED')) {
      syncNow();
    }
  }, [isOnline, outbox, syncNow]);

  const enqueueOrSend: FloorOutboxContextValue['enqueueOrSend'] = async ({
    type,
    endpoint,
    payload,
  }) => {
    if (!isOnline) {
      const check = canQueueFloorCommandOffline(type);
      if (!check.allowed) {
        return { ok: false, queued: false, message: check.reason || 'Blocked offline' };
      }
    }

    const uniqueToken =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const item: FloorOutboxItem = {
      id: `fl-${uniqueToken}`,
      idempotencyKey: `idem-${type}-${uniqueToken}`,
      type,
      endpoint,
      payload,
      captured_at: new Date().toISOString(),
      status: 'QUEUED',
    };

    if (!isOnline) {
      setOutbox((prev) => [item, ...prev]);
      return {
        ok: true,
        queued: true,
        message: 'Saved offline in Outbox — will sync automatically when Wi-Fi returns.',
      };
    }

    const res = await sendToBackend(item);
    if (res.ok) {
      setLastSyncedAt(
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      );
      return { ok: true, queued: false, message: 'Synced with server.' };
    }

    setOutbox((prev) => [{ ...item, status: 'FAILED', errorReason: 'Sync failed' }, ...prev]);
    return { ok: false, queued: true, message: 'Queued for retry.' };
  };

  const retryItem = async (id: string) => {
    setOutbox((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: 'QUEUED', errorReason: undefined } : i)),
    );
  };

  return (
    <FloorOutboxContext.Provider
      value={{
        isOnline,
        isSyncing,
        lastSyncedAt,
        outbox,
        pendingCount: outbox.filter((i) => i.status === 'QUEUED').length,
        failedItems: outbox.filter((i) => i.status === 'FAILED'),
        setOnline,
        enqueueOrSend,
        syncNow,
        retryItem,
      }}
    >
      {children}
    </FloorOutboxContext.Provider>
  );
}

export function useFloorOutbox() {
  const ctx = useContext(FloorOutboxContext);
  if (!ctx) {
    throw new Error('useFloorOutbox must be used inside FloorOutboxProvider');
  }
  return ctx;
}

