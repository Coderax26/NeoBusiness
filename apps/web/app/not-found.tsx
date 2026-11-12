import React from 'react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center shadow-2xl">
        <div className="w-12 h-12 rounded-xl bg-zinc-800 text-zinc-300 font-bold text-xl flex items-center justify-center mx-auto mb-4 border border-zinc-700">
          🔍
        </div>
        <h2 className="text-xl font-bold text-white tracking-tight">Record Not Found</h2>
        <p className="text-xs text-zinc-400 mt-2 mb-6 leading-relaxed">
          This record or screen no longer exists or was moved to another location.
        </p>

        <Link
          href="/home"
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition-colors"
        >
          Return to Control Tower Home →
        </Link>
      </div>
    </div>
  );
}
