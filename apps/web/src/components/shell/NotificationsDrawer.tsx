'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Drawer } from '@neo/ui';
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

export const NotificationsDrawer: React.FC<{
  open: boolean;
  onClose: () => void;
  onUnreadCountChange?: (count: number) => void;
}> = ({ open, onClose, onUnreadCountChange }) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: 'notif-1',
      title: 'Price Override Approved',
      message: 'Owner approved below-floor rate of ₹420/kg for order SO-2611-0042.',
      type: 'approval',
      read: false,
      href: '/sales/orders',
      timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    },
    {
      id: 'notif-2',
      title: 'Orders Staged & Ready',
      message: '3 orders (4,200 kg total) marked READY in Pune Cold Storage. Ready to build trip.',
      type: 'order',
      read: false,
      href: '/logistics/trips',
      timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    },
    {
      id: 'notif-3',
      title: 'Cash Handover Disputed',
      message: 'Cashier flagged -₹1,200 variance on Driver Ramesh shift collection.',
      type: 'handover',
      read: false,
      href: '/finance/handovers',
      timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    },
    {
      id: 'notif-4',
      title: 'Expiring Stock Warning',
      message: 'Batch B-MAN-092 (180 kg) expires in 4 days at Mumbai Hub.',
      type: 'stock',
      read: true,
      href: '/inventory/stock',
      timestamp: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    },
  ]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    onUnreadCountChange?.(0);
  };

  const markItemRead = (id: string) => {
    const updated = notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
    setNotifications(updated);
    onUnreadCountChange?.(updated.filter((n) => !n.read).length);
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Notifications"
      subtitle={`${unreadCount} unread alerts`}
      width="md"
    >
      <div className="flex justify-between items-center mb-3 pb-2 border-b border-ink">
        <span className="text-[13px] font-semibold text-ink">Activity</span>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            className="text-[13px] text-action hover:underline font-medium"
          >
            Mark all read ✓
          </button>
        )}
      </div>

      <div className="divide-y divide-rule">
        {notifications.map((n) => (
          <Link
            key={n.id}
            href={n.href}
            onClick={() => {
              markItemRead(n.id);
              onClose();
            }}
            className={`block py-3.5 transition-colors hover:bg-paper/60 px-2 -mx-2 rounded-[3px] ${
              n.read ? 'text-ink-3' : 'text-ink'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[14px] font-medium text-ink flex items-center gap-2">
                {!n.read && <span className="w-2 h-2 rounded-full bg-madder" />}
                {n.title}
              </span>
              <span className="text-[12.5px] text-ink-3 font-mono">
                {formatISTDate(n.timestamp, true)}
              </span>
            </div>
            <p className="text-[13px] text-ink-2 leading-relaxed">{n.message}</p>
          </Link>
        ))}
      </div>
    </Drawer>
  );
};
