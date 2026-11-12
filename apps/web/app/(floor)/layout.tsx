'use client';

import React from 'react';
import Link from 'next/link';

export default function FloorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Floor Header */}
      <header className="h-20 bg-zinc-900 border-b border-zinc-800 px-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 font-black text-xl flex items-center justify-center">
            FL
          </div>
          <div>
            <div className="text-base font-bold text-white tracking-tight">NeoBus Floor Mode</div>
            <div className="text-xs text-zinc-400">Touch Terminal · Warehouse & Production</div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-xs font-semibold text-zinc-300">
            Site: Factory Cold Store #1
          </div>
          <Link
            href="/login"
            className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 border border-zinc-700"
          >
            Switch User
          </Link>
        </div>
      </header>

      {/* Touch Screen Content */}
      <main className="flex-1 p-6 max-w-6xl w-full mx-auto">{children}</main>
    </div>
  );
}

