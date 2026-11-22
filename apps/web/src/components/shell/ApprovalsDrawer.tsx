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

const RESOLVED_IDS_STORAGE_KEY = 'neobus_resolved_exception_ids_v1';

export const ApprovalsDrawer: React.FC<{
  open: boolean;
  onClose: () => void;
  onCountChange?: (count: number) => void;
}> = ({ open, onClose, onCountChange }) => {
  const [exceptions, setExceptions] = useState<PendingException[]>([]);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [counterTargetId, setCounterTargetId] = useState<string | null>(null);
  const [counterPrice, setCounterPrice] = useState<string>('430');

  useEffect(() => {
    let active = true;
    const loadExceptions = async () => {
      let resolvedIds: string[] = [];
      try {
        const saved = localStorage.getItem(RESOLVED_IDS_STORAGE_KEY);
        if (saved) resolvedIds = JSON.parse(saved);
      } catch {
        resolvedIds = [];
      }

      try {
        const res = await fetch('/api/proxy/exceptions?status=PENDING');
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data?.data)
            ? data.data
            : Array.isArray(data)
            ? data
            : null;
          if (active && Array.isArray(list)) {
            const normalized: PendingException[] = list.map((raw: any) => {
              const payload =
                typeof raw.context_payload_json === 'string'
                  ? (() => {
                      try {
                        return JSON.parse(raw.context_payload_json);
                      } catch {
                        return {};
                      }
                    })()
                  : (raw.context_payload_json ?? {});
              const type = String(raw.exception_type ?? raw.type ?? 'EXCEPTION');
              const refLabel =
                raw.reference_table && raw.reference_id
                  ? `${raw.reference_table} (${raw.reference_id})`
                  : '';
              const impactVal =
                raw.value_at_risk !== null && raw.value_at_risk !== undefined
                  ? `₹${Number(raw.value_at_risk).toLocaleString('en-IN')}`
                  : '';
              return {
                id: String(raw.id),
                type,
                title: String(payload?.title ?? raw.title ?? type.replace(/_/g, ' ')),
                summary: String(payload?.summary ?? raw.summary ?? refLabel),
                impact: String(raw.impact ?? impactVal),
                requestedBy: String(
                  payload?.requestedBy ?? raw.requestedBy ?? raw.requested_by ?? 'System',
                ),
                createdAt: String(raw.createdAt ?? raw.created_at ?? ''),
              };
            });
            setExceptions(normalized.filter((e) => !resolvedIds.includes(e.id)));
            return;
          }
        }
      } catch {
        setDecisionError('Failed to load pending exceptions.');
      }

      if (active) {
        setExceptions([]);
      }
    };

    void loadExceptions();
    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    onCountChange?.(exceptions.length);
  }, [exceptions.length, onCountChange]);

  const markResolvedLocally = (id: string) => {
    try {
      const saved = localStorage.getItem(RESOLVED_IDS_STORAGE_KEY);
      const list: string[] = saved ? JSON.parse(saved) : [];
      if (!list.includes(id)) {
        localStorage.setItem(RESOLVED_IDS_STORAGE_KEY, JSON.stringify([...list, id]));
      }
    } catch {
      // ignore storage errors
    }
  };

  const submitDecision = async (
    id: string,
    decision: 'APPROVED' | 'REJECTED' | 'COUNTER_OFFERED',
    counterOfferPrice?: number,
  ) => {
    setDecisionError(null);
    const mappedAction = decision === 'COUNTER_OFFERED' ? 'COUNTERED' : decision;
    try {
      const res = await fetch(`/api/proxy/exceptions/${encodeURIComponent(id)}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: mappedAction,
          remarks: `Decision ${mappedAction} from Approvals Drawer`,
          ...(counterOfferPrice !== undefined
            ? { counter: { price: counterOfferPrice, amount: counterOfferPrice } }
            : {}),
        }),
      });
      if (!res.ok) {
        setDecisionError(`Failed to persist ${decision.toLowerCase()} decision for ${id}. Please retry.`);
        return;
      }
      markResolvedLocally(id);
      setExceptions((prev) => prev.filter((e) => e.id !== id));
      if (counterTargetId === id) {
        setCounterTargetId(null);
      }
    } catch {
      setDecisionError(`Network error while saving decision for ${id}. Item retained in queue.`);
    }
  };

  const handleApprove = (id: string) => {
    void submitDecision(id, 'APPROVED');
  };

  const handleReject = (id: string) => {
    void submitDecision(id, 'REJECTED');
  };

  const handleSubmitCounter = (id: string) => {
    const parsed = Number(counterPrice);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setDecisionError('Please enter a valid positive counter-offer price.');
      return;
    }
    void submitDecision(id, 'COUNTER_OFFERED', parsed);
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
        {decisionError && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300"
          >
            {decisionError}
          </div>
        )}
        {exceptions.length === 0 ? (
          <EmptyState
            icon="🎉"
            title="All caught up!"
            description="There are no pending price overrides, credit breaches, or supplier rate exceptions waiting for decision."
          />
        ) : (
          exceptions.map((exc) => (
            <div key={exc.id} className="space-y-2">
              <ExceptionCard
                id={exc.id}
                type={exc.type}
                title={exc.title}
                summary={exc.summary}
                impact={exc.impact}
                onApprove={handleApprove}
                onReject={handleReject}
                onCounter={(id) => {
                  setCounterTargetId(id);
                  setDecisionError(null);
                }}
              />
              {counterTargetId === exc.id && (
                <div className="p-3 rounded-xl bg-zinc-900 border border-teal-500/40 flex items-center gap-2 text-xs">
                  <label className="text-zinc-300 font-semibold">Counter Price (₹):</label>
                  <input
                    type="number"
                    step="0.5"
                    value={counterPrice}
                    onChange={(e) => setCounterPrice(e.target.value)}
                    className="w-28 bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-white font-mono"
                  />
                  <Button size="sm" variant="primary" onClick={() => handleSubmitCounter(exc.id)}>
                    Send Counter
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setCounterTargetId(null)}>
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </Drawer>
  );
};
