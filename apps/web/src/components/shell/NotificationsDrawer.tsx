'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Drawer, Button, Badge } from '@neo/ui';
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
      title="Notifications & Alerts"
      subtitle={`${unreadCount} unread system alerts`}
      width="md"
    >
      <div className="flex justify-between items-center mb-4 pb-2 border-b border-zinc-800">
        <span className="text-xs text-zinc-400">Activity Stream</span>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            className="text-xs text-teal-400 hover:text-teal-300 font-semibold"
          >
            Mark all read ✓
          </button>
        )}
      </div>

      <div className="space-y-3">
        {notifications.map((n) => (
          <Link
            key={n.id}
            href={n.href}
            onClick={() => {
              markItemRead(n.id);
              onClose();
            }}
            className={`block p-3.5 rounded-xl border transition-colors ${
              n.read
                ? 'bg-zinc-900/40 border-zinc-800/80 text-zinc-400'
                : 'bg-zinc-900 border-teal-500/30 text-zinc-200 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                {!n.read && <span className="w-2 h-2 rounded-full bg-teal-400" />}
                {n.title}
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">
                {formatISTDate(n.timestamp, true)}
              </span>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">{n.message}</p>
          </Link>
        ))}
      </div>
    </Drawer>
  );
};
