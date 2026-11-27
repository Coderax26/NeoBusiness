'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Drawer, EmptyState } from '@neo/ui';
import { formatISTDate } from '@neo/shared';

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'approval' | 'order' | 'handover' | 'stock';
  read: boolean;
  href: string;
  timestamp: string;
}

const NOTIFICATION_EVENT_TITLES: Record<string, string> = {
  PRICE_OVERRIDE_APPROVED: 'Price Override Approved',
  ORDER_READY: 'Orders Staged & Ready',
  CASH_HANDOVER_DISPUTED: 'Cash Handover Disputed',
  EXPIRING_STOCK: 'Expiring Stock Warning',
};

function mapApiNotification(raw: any): NotificationItem {
  const payload =
    typeof raw.payload_json === 'string'
      ? (() => {
        try {
          return JSON.parse(raw.payload_json);
        } catch {
          return {};
        }
      })()
      : (raw.payload_json ?? {});

  const eventType = String(raw.event_type || raw.template_code || '').toUpperCase();
  let type: NotificationItem['type'] = 'order';
  let href = '/home';
  if (eventType.includes('APPROV') || eventType.includes('EXCEPTION') || eventType.includes('OVERRIDE')) {
    type = 'approval';
    href = '/control/approvals';
  } else if (eventType.includes('HANDOVER') || eventType.includes('CASH') || eventType.includes('COLLECTION')) {
    type = 'handover';
    href = '/finance/handovers';
  } else if (eventType.includes('STOCK') || eventType.includes('EXPIR') || eventType.includes('GRN')) {
    type = 'stock';
    href = '/inventory/stock';
  } else if (eventType.includes('ORDER') || eventType.includes('TRIP')) {
    type = 'order';
    href = '/sales/orders';
  }

  const title =
    payload?.title ||
    raw.title ||
    NOTIFICATION_EVENT_TITLES[eventType] ||
    (eventType ? eventType.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : 'System Alert');

  const message =
    payload?.message ||
    payload?.body ||
    raw.body ||
    raw.message ||
    `Update via ${String(raw.channel || 'In-App')}`;

  return {
    id: String(raw.id),
    title,
    message,
    type,
    read: String(raw.status || '').toUpperCase() === 'DELIVERED' || Boolean(raw.read),
    href: payload?.href || href,
    timestamp: String(raw.created_at || raw.timestamp || new Date().toISOString()),
  };
}

export const NotificationsDrawer: React.FC<{
  open: boolean;
  onClose: () => void;
  onUnreadCountChange?: (count: number) => void;
}> = ({ open, onClose, onUnreadCountChange }) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/proxy/notifications?limit=30');
      if (!res.ok) {
        setLoadError('Unable to load alerts right now.');
        return;
      }
      const json = await res.json();
      const rows = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
      setNotifications(rows.map(mapApiNotification));
    } catch {
      setLoadError('Unable to load alerts right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications, open]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [unreadCount, onUnreadCountChange]);

  const markAllRead = async () => {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await Promise.all(
      unreadIds.map((id) =>
        fetch(`/api/proxy/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' }).catch(
          () => null,
        ),
      ),
    );
  };

  const markItemRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    await fetch(`/api/proxy/notifications/${encodeURIComponent(id)}/read`, {
      method: 'POST',
    }).catch(() => null);
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Notifications"
      subtitle={unreadCount > 0 ? `${unreadCount} unread alerts` : 'All caught up'}
      width="md"
    >
      <div className="flex justify-between items-center mb-3 pb-2 border-b border-ink">
        <span className="text-[13px] font-semibold text-ink">Activity</span>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => void markAllRead()}
            className="text-[13px] text-action hover:underline font-medium"
          >
            Mark all read ✓
          </button>
        )}
      </div>

      {loadError && (
        <div className="mb-3 p-3 rounded-[3px] bg-madder-soft border border-madder/30 text-[13px] text-madder">
          {loadError}
        </div>
      )}

      {loading && notifications.length === 0 ? (
        <div className="py-8 text-center text-[13px] text-ink-3">Loading alerts...</div>
      ) : notifications.length === 0 ? (
        <EmptyState
          title="No alerts yet"
          description="You will see order confirmations, approval updates, and stock warnings here."
        />
      ) : (
        <div className="divide-y divide-rule">
          {notifications.map((n) => (
            <Link
              key={n.id}
              href={n.href}
              onClick={() => {
                if (!n.read) void markItemRead(n.id);
                onClose();
              }}
              className={`block py-3.5 transition-colors hover:bg-paper/60 px-2 -mx-2 rounded-[3px] ${n.read ? 'text-ink-3' : 'text-ink'
                }`}
            >
              <div className="flex items-center justify-between mb-1 gap-2">
                <span className="text-[14px] font-medium text-ink flex items-center gap-2">
                  {!n.read && <span className="w-2 h-2 rounded-full bg-madder shrink-0" />}
                  {n.title}
                </span>
                <span className="text-[12px] text-ink-3 font-mono shrink-0">
                  {formatISTDate(n.timestamp, true)}
                </span>
              </div>
              <p className="text-[13px] text-ink-2 leading-relaxed">{n.message}</p>
            </Link>
          ))}
        </div>
      )}
    </Drawer>
  );
};
