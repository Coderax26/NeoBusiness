import React from 'react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-sheet border border-rule rounded-[4px] p-8 text-center shadow-2xl">
        <div className="w-12 h-12 rounded-[3px] bg-sunken text-ink-2 font-bold text-xl flex items-center justify-center mx-auto mb-4 border border-rule-strong">
          🔍
        </div>
        <h2 className="text-xl font-bold text-ink tracking-tight">Record Not Found</h2>
        <p className="text-xs text-ink-3 mt-2 mb-6 leading-relaxed">
          This record or screen no longer exists or was moved to another location.
        </p>

        <Link
          href="/home"
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-action hover:bg-action-hover text-white font-medium text-xs transition-colors"
        >
          Return to Control Tower Home →
        </Link>
      </div>
    </div>
  );
}

