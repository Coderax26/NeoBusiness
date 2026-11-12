'use client';

import React from 'react';
import Link from 'next/link';

export default function FloorTerminalPage() {
  const floorTiles = [
    {
      title: 'Blind GRN Receiving',
      description: 'Receive supplier goods without seeing expected quantities (BR-05 blind check)',
      icon: '📥',
      color: 'border-blue-500/40 bg-blue-950/20 text-blue-200',
      badge: '3 POs Arriving',
      href: '/floor/grn',
    },
    {
      title: 'Vehicle Loading Check',
      description: 'Confirm crates and quantities loaded onto delivery vehicles (G-FLT-2)',
      icon: '🚚',
      color: 'border-emerald-500/40 bg-emerald-950/20 text-emerald-200',
      badge: '2 Trips Loading',
      href: '/floor/loading',
    },
    {
      title: 'Production Work Orders',
      description: 'Start cooking, record ingredient consumption, and log output batches',
      icon: '⚙️',
      color: 'border-purple-500/40 bg-purple-950/20 text-purple-200',
      badge: '5 Active WOs',
      href: '/floor/production',
    },
    {
      title: 'Physical Stock Count',
      description: 'Cycle count storage bins and cold rooms to detect variances (G-INV-3)',
      icon: '🔢',
      color: 'border-amber-500/40 bg-amber-950/20 text-amber-200',
      badge: 'Count Active',
      href: '/floor/stock-counts',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Select Operation</h1>
          <p className="text-xs text-zinc-400">Tap a tile to open the touch-friendly step-by-step workflow</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {floorTiles.map((tile) => (
          <Link
            key={tile.title}
            href={tile.href}
            className={`p-6 rounded-2xl border-2 shadow-xl flex flex-col justify-between min-h-[160px] active:scale-[0.98] transition-transform ${tile.color}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="text-4xl">{tile.icon}</span>
                <div>
                  <h3 className="text-lg font-bold text-white">{tile.title}</h3>
                  <p className="text-xs text-zinc-300/80 mt-1">{tile.description}</p>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between pt-4 border-t border-white/10">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/10 text-white">
                {tile.badge}
              </span>
              <span className="text-sm font-bold text-white">Start Task →</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

