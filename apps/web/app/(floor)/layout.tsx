'use client';

import React from 'react';
import Link from 'next/link';
import { FloorOutboxProvider, useFloorOutbox } from '../../src/lib/floor-outbox';

function FloorHeaderBar() {
  const { isOnline, isSyncing, pendingCount, lastSyncedAt, setOnline } = useFloorOutbox();

  return (
    <header className="min-h-20 bg-zinc-900 border-b border-zinc-800 px-6 py-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-4">
        <Link
          href="/floor"
          className="w-14 h-14 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 font-black text-xl flex items-center justify-center"
        >
          FL
        </Link>
        <div>
          <div className="text-lg font-bold text-white tracking-tight">NeoBus Floor Mode</div>
          <div className="text-sm text-zinc-400">Touch Terminal · Warehouse &amp; Production</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/* Offline / Online / Syncing Badge (§3.6) */}
        <button
          type="button"
          onClick={() => setOnline(!isOnline)}
          data-testid="floor-network-badge"
          className={`min-h-[48px] px-4 py-2 rounded-xl border text-sm font-bold flex items-center gap-2 ${
            isSyncing
              ? 'bg-sky-500/20 border-sky-500/50 text-sky-300'
              : isOnline
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-500/20 border-rose-500/50 text-rose-300'
          }`}
        >
          <span>{isSyncing ? '↻' : isOnline ? '●' : '○'}</span>
          <span>
            {isSyncing
              ? `Syncing (${pendingCount})`
              : isOnline
                ? `Online · Last sync ${lastSyncedAt}`
                : `Offline · Queued (${pendingCount})`}
          </span>
        </button>

        <Link
          href="/floor"
          className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm font-semibold text-zinc-200 border border-zinc-700 flex items-center"
        >
          Home
        </Link>

        <Link
          href="/login"
          className="min-h-[48px] px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm font-semibold text-zinc-200 border border-zinc-700 flex items-center"
        >
          Switch User
        </Link>
      </div>
    </header>
  );
}

export default function FloorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <FloorOutboxProvider>
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col text-[18px]">
        <FloorHeaderBar />
        <main className="flex-1 p-6 max-w-6xl w-full mx-auto">{children}</main>
      </div>
    </FloorOutboxProvider>
  );
}
