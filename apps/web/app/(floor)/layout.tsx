'use client';

import React from 'react';
import Link from 'next/link';
import { FloorOutboxProvider, useFloorOutbox } from '../../src/lib/floor-outbox';

function FloorHeaderBar() {
  const { isOnline, isSyncing, pendingCount, lastSyncedAt, setOnline } = useFloorOutbox();

  return (
    <header className="min-h-20 bg-sheet border-b border-rule px-6 py-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-4">
        <Link
          href="/floor"
          className="w-14 h-14 rounded-[6px] bg-action text-[#16140F] font-bold text-xl flex items-center justify-center"
        >
          FL
        </Link>
        <div>
          <div className="text-[20px] font-semibold text-ink tracking-tight">
            NeoBus Floor Mode
          </div>
          <div className="text-[14px] text-ink-3 font-devanagari">
            Touch Terminal · गोदाम व कारखाना
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/* Offline / Online / Syncing Badge (§3.6) */}
        <button
          type="button"
          onClick={() => setOnline(!isOnline)}
          data-testid="floor-network-badge"
          className={`min-h-[48px] px-4 py-2 rounded-[6px] border text-[15px] font-semibold flex items-center gap-2.5 ${
            isSyncing
              ? 'bg-action-soft border-action text-action'
              : isOnline
                ? 'bg-leaf-soft border-leaf/40 text-leaf'
                : 'bg-madder-soft border-madder text-madder'
          }`}
        >
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              isSyncing ? 'bg-action' : isOnline ? 'bg-leaf' : 'bg-madder'
            }`}
          />
          <span>
            {isSyncing
              ? `Syncing (${pendingCount})`
              : isOnline
                ? `Online · synced ${lastSyncedAt}`
                : `Offline · queued (${pendingCount})`}
          </span>
        </button>

        <Link
          href="/floor"
          className="min-h-[48px] px-4 py-2 rounded-[6px] bg-sunken hover:bg-sheet text-[15px] font-semibold text-ink border border-rule-strong flex items-center"
        >
          Home
        </Link>

        <Link
          href="/login"
          className="min-h-[48px] px-4 py-2 rounded-[6px] bg-sunken hover:bg-sheet text-[15px] font-semibold text-ink border border-rule-strong flex items-center"
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
      <div
        data-theme="floor"
        className="min-h-screen bg-paper text-ink flex flex-col text-[18px]"
      >
        <FloorHeaderBar />
        <main className="flex-1 p-6 max-w-6xl w-full mx-auto">{children}</main>
      </div>
    </FloorOutboxProvider>
  );
}
