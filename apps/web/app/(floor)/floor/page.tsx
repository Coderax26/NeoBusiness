'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { NumericKeypad } from '@neo/ui';
import type { SessionUser } from '@neo/shared';

export default function FloorTerminalPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [keypadOpen, setKeypadOpen] = useState(false);
  const [keypadValue, setKeypadValue] = useState('0');
  const [keypadContext, setKeypadContext] = useState<string>('');

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => {});
  }, []);

  const isStorekeeper = user?.role === 'STOREKEEPER';

  const prodMgrTiles = [
    {
      title: 'Active Work Orders',
      description: 'Cook, process, and pack batches according to standard BOM recipes',
      icon: '⚙️',
      color: 'border-orange-500/40 bg-orange-950/20 text-orange-200',
      badge: '5 Active Batches',
      href: '/floor/production',
    },
    {
      title: 'Record Batch Output & Yield',
      description: 'Log actual finished goods output and calculate physical yield variance',
      icon: '📦',
      color: 'border-teal-500/40 bg-teal-950/20 text-teal-200',
      badge: 'Yield Check',
      href: '/floor/output',
    },
    {
      title: 'Raw Material Request',
      description: 'Request ingredients and packaging crates from warehouse storekeeper',
      icon: '📋',
      color: 'border-blue-500/40 bg-blue-950/20 text-blue-200',
      badge: 'BOM Pull',
      href: '/floor/material-request',
    },
    {
      title: 'Shift Worker Attendance',
      description: 'Record headcount, shifts, and machine station assignments',
      icon: '👥',
      color: 'border-emerald-500/40 bg-emerald-950/20 text-emerald-200',
      badge: 'Shift 1 Active',
      href: '/floor/attendance',
    },
    {
      title: 'Report Production Wastage',
      description: 'Log spilled pulp, rejected packaging, and equipment downtime',
      icon: '🗑️',
      color: 'border-rose-500/40 bg-rose-950/20 text-rose-200',
      badge: 'Spill Log',
      href: '/floor/wastage',
    },
    {
      title: 'Quick Scale Keypad',
      description: 'Enter weights and quantity readings with gloves on touchscreen',
      icon: '🔢',
      color: 'border-purple-500/40 bg-purple-950/20 text-purple-200',
      badge: 'Large Touch',
      onClick: () => {
        setKeypadContext('Scale / Crate Tare Reading');
        setKeypadOpen(true);
      },
    },
  ];

  const storekeeperTiles = [
    {
      title: 'Blind GRN Receiving',
      description: 'Weigh and count incoming supplier lots without seeing invoice amounts (BR-05)',
      icon: '📥',
      color: 'border-blue-500/40 bg-blue-950/20 text-blue-200',
      badge: '3 Deliveries Arriving',
      href: '/floor/grn',
    },
    {
      title: 'Vehicle Loading Check',
      description: 'Verify crate counts and seal delivery vehicle before gate pass (G-FLT-2)',
      icon: '🚚',
      color: 'border-emerald-500/40 bg-emerald-950/20 text-emerald-200',
      badge: '2 Trucks Staged',
      href: '/floor/loading',
    },
    {
      title: 'Inter-Site Warehouse Transfers',
      description: 'Dispatch or receive pallets transferred between Pune plant and Mumbai hub',
      icon: '🔄',
      color: 'border-indigo-500/40 bg-indigo-950/20 text-indigo-200',
      badge: '1 Inbound Truck',
      href: '/floor/transfers',
    },
    {
      title: 'Physical Stock Count',
      description: 'Cycle count cold rooms and raw material bins to reconcile stock',
      icon: '🔢',
      color: 'border-amber-500/40 bg-amber-950/20 text-amber-200',
      badge: 'Weekly Cycle',
      href: '/floor/stock-counts',
    },
    {
      title: 'Stock Damage & Adjustment',
      description: 'Record crushed crates or expired dairy lots with reason code',
      icon: '⚠️',
      color: 'border-rose-500/40 bg-rose-950/20 text-rose-200',
      badge: 'Damaged Lot',
      href: '/floor/adjustments',
    },
    {
      title: 'Quick Count Keypad',
      description: 'Touchscreen numeric entry for high-speed stock counts',
      icon: '⌨️',
      color: 'border-purple-500/40 bg-purple-950/20 text-purple-200',
      badge: 'Keypad (56px)',
      onClick: () => {
        setKeypadContext('Physical Bin Count');
        setKeypadOpen(true);
      },
    },
  ];

  const activeTiles = isStorekeeper ? storekeeperTiles : prodMgrTiles;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">
            {isStorekeeper ? 'Warehouse & Receiving Terminal' : 'Factory Production Terminal'}
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Logged in as <strong className="text-white">{user?.name || 'Operator'}</strong> ({user?.role || 'FLOOR_STAFF'}). Tap any action tile.
          </p>
        </div>

        <Link
          href="/home"
          className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
        >
          🖥 Switch to Office View
        </Link>
      </div>

      {/* Grid of large 56px touch tiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {activeTiles.map((tile: any) => {
          if (tile.onClick) {
            return (
              <button
                key={tile.title}
                type="button"
                onClick={tile.onClick}
                className={`p-6 rounded-3xl border-2 shadow-2xl flex flex-col justify-between min-h-[180px] active:scale-[0.98] transition-transform text-left select-none ${tile.color}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-4xl">{tile.icon}</span>
                    <div>
                      <h3 className="text-lg font-bold text-white">{tile.title}</h3>
                      <p className="text-xs text-zinc-300/80 mt-1 leading-relaxed">{tile.description}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between pt-4 border-t border-white/10">
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-white/10 text-white">
                    {tile.badge}
                  </span>
                  <span className="text-sm font-bold text-white">Open Keypad ↵</span>
                </div>
              </button>
            );
          }

          return (
            <Link
              key={tile.title}
              href={tile.href}
              className={`p-6 rounded-3xl border-2 shadow-2xl flex flex-col justify-between min-h-[180px] active:scale-[0.98] transition-transform select-none ${tile.color}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-4xl">{tile.icon}</span>
                  <div>
                    <h3 className="text-lg font-bold text-white">{tile.title}</h3>
                    <p className="text-xs text-zinc-300/80 mt-1 leading-relaxed">{tile.description}</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between pt-4 border-t border-white/10">
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-white/10 text-white">
                  {tile.badge}
                </span>
                <span className="text-sm font-bold text-white">Start Task →</span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Touchpad Keypad Modal */}
      {keypadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white">{keypadContext}</h3>
              <button
                type="button"
                onClick={() => setKeypadOpen(false)}
                className="text-zinc-400 hover:text-white p-1 text-sm"
              >
                ✕
              </button>
            </div>
            <NumericKeypad
              value={keypadValue}
              onChange={setKeypadValue}
              onSubmit={() => {
                alert(`Logged reading: ${keypadValue} for ${keypadContext}`);
                setKeypadOpen(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
