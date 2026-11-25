'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Factory,
  Package,
  ClipboardList,
  Users,
  Trash2,
  Calculator,
  Inbox,
  Truck,
  ArrowLeftRight,
  Scale,
  AlertTriangle,
  Monitor,
  type LucideIcon,
} from 'lucide-react';
import { NumericKeypad } from '@neo/ui';
import type { SessionUser } from '@neo/shared';

interface FloorTile {
  title: string;
  mr: string;
  description: string;
  Icon: LucideIcon;
  accent: string;
  badge: string;
  href?: string;
  onClick?: () => void;
}

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

  const prodMgrTiles: FloorTile[] = [
    {
      title: 'Active Work Orders',
      mr: 'सक्रिय उत्पादन बॅचेस',
      description: 'Cook, process, and pack batches according to standard BOM recipes',
      Icon: Factory,
      accent: 'border-l-4 border-l-action',
      badge: 'Work Orders',
      href: '/floor/production',
    },
    {
      title: 'Record Batch Output & Yield',
      mr: 'उत्पादन नोंदणी',
      description: 'Log actual finished goods output and calculate physical yield variance',
      Icon: Package,
      accent: 'border-l-4 border-l-leaf',
      badge: 'Yield Check',
      href: '/floor/output',
    },
    {
      title: 'Raw Material Request',
      mr: 'कच्चा माल मागणी',
      description: 'Request ingredients and packaging crates from warehouse storekeeper',
      Icon: ClipboardList,
      accent: 'border-l-4 border-l-action',
      badge: 'BOM Pull',
      href: '/floor/material-request',
    },
    {
      title: 'Shift Worker Attendance',
      mr: 'कामगार हजेरी',
      description: 'Record headcount, shifts, and machine station assignments',
      Icon: Users,
      accent: 'border-l-4 border-l-leaf',
      badge: 'Shift Active',
      href: '/floor/attendance',
    },
    {
      title: 'Report Production Wastage',
      mr: 'नुकसान / वाया गेलेला माल',
      description: 'Log spilled pulp, rejected packaging, and equipment downtime',
      Icon: Trash2,
      accent: 'border-l-4 border-l-madder',
      badge: 'Spill Log',
      href: '/floor/wastage',
    },
    {
      title: 'Quick Scale Keypad',
      mr: 'वजन नोंदणी कीपॅड',
      description: 'Enter weights and quantity readings with gloves on touchscreen',
      Icon: Calculator,
      accent: 'border-l-4 border-l-action',
      badge: 'Large Touch',
      onClick: () => {
        setKeypadContext('Scale / Crate Tare Reading');
        setKeypadOpen(true);
      },
    },
  ];

  const storekeeperTiles: FloorTile[] = [
    {
      title: 'Blind GRN Receiving',
      mr: 'माल आवक मोजणी',
      description: 'Count incoming supplier lots without seeing invoice amounts',
      Icon: Inbox,
      accent: 'border-l-4 border-l-action',
      badge: 'Receiving',
      href: '/floor/grn',
    },
    {
      title: 'Vehicle Loading Check',
      mr: 'वाहन भराई तपासणी',
      description: 'Verify crate counts and seal delivery vehicle before gate pass',
      Icon: Truck,
      accent: 'border-l-4 border-l-leaf',
      badge: 'Dispatch Gate',
      href: '/floor/loading',
    },
    {
      title: 'Inter-Site Warehouse Transfers',
      mr: 'गोदाम हस्तांतरण',
      description: 'Dispatch or receive pallets transferred between plant and hub',
      Icon: ArrowLeftRight,
      accent: 'border-l-4 border-l-action',
      badge: 'Transfers',
      href: '/floor/transfers',
    },
    {
      title: 'Physical Stock Count',
      mr: 'प्रत्यक्ष साठा मोजणी',
      description: 'Cycle count cold rooms and raw material bins to reconcile stock',
      Icon: Scale,
      accent: 'border-l-4 border-l-action',
      badge: 'Cycle Count',
      href: '/floor/stock-counts',
    },
    {
      title: 'Stock Damage & Adjustment',
      mr: 'साठा तफावत नोंदणी',
      description: 'Record crushed crates or expired lots with reason code',
      Icon: AlertTriangle,
      accent: 'border-l-4 border-l-madder',
      badge: 'Damaged Lot',
      href: '/floor/adjustments',
    },
    {
      title: 'Quick Count Keypad',
      mr: 'मोजणी कीपॅड',
      description: 'Touchscreen numeric entry for high-speed stock counts',
      Icon: Calculator,
      accent: 'border-l-4 border-l-action',
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
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-rule">
        <div>
          <h1 className="text-[26px] font-semibold text-ink">
            {isStorekeeper ? 'Warehouse & Receiving Terminal' : 'Factory Production Terminal'}
          </h1>
          <p className="text-[15px] text-ink-3 mt-1">
            Operator: <strong className="text-ink">{user?.name || 'Operator'}</strong> ({user?.role || 'FLOOR_STAFF'})
          </p>
        </div>

        <Link
          href="/home"
          className="min-h-[48px] text-[14px] font-semibold px-4 py-2 rounded-[6px] bg-sunken hover:bg-sheet text-ink border border-rule-strong inline-flex items-center gap-2"
        >
          <Monitor className="w-4 h-4" />
          <span>Office View</span>
        </Link>
      </div>

      {/* Grid of large 56px+ touch tiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {activeTiles.map((tile) => {
          const TileIcon = tile.Icon;
          const inner = (
            <>
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-[6px] bg-sunken border border-rule-strong flex items-center justify-center shrink-0 text-action">
                  <TileIcon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-[19px] font-semibold text-ink leading-snug">{tile.title}</h3>
                  <div className="font-devanagari text-[15px] text-ink-3 mt-0.5">{tile.mr}</div>
                  <p className="text-[14px] text-ink-2 mt-2 leading-relaxed">{tile.description}</p>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between pt-3.5 border-t border-rule">
                <span className="text-[13px] font-semibold px-2.5 py-1 rounded-[4px] bg-sunken text-ink-2">
                  {tile.badge}
                </span>
                <span className="text-[15px] font-bold text-action">
                  {tile.onClick ? 'Open Keypad ↵' : 'Start Task →'}
                </span>
              </div>
            </>
          );

          if (tile.onClick) {
            return (
              <button
                key={tile.title}
                type="button"
                onClick={tile.onClick}
                className={`p-6 rounded-[6px] bg-sheet border border-rule-strong hover:border-action flex flex-col justify-between min-h-[196px] active:scale-[0.98] transition-all text-left select-none ${tile.accent}`}
              >
                {inner}
              </button>
            );
          }

          return (
            <Link
              key={tile.title}
              href={tile.href!}
              className={`p-6 rounded-[6px] bg-sheet border border-rule-strong hover:border-action flex flex-col justify-between min-h-[196px] active:scale-[0.98] transition-all select-none ${tile.accent}`}
            >
              {inner}
            </Link>
          );
        })}
      </div>

      {/* Touchpad Keypad Modal */}
      {keypadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75">
          <div className="w-full max-w-sm bg-sheet border border-rule-strong rounded-[6px] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[16px] font-semibold text-ink">{keypadContext}</h3>
              <button
                type="button"
                onClick={() => setKeypadOpen(false)}
                className="text-ink-3 hover:text-ink p-2 text-base"
                aria-label="Close keypad"
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
