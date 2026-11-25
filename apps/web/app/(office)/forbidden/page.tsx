import React from 'react';
import Link from 'next/link';

export default function ForbiddenPage() {
  return (
    <div className="max-w-md mx-auto text-center py-20">
      <div className="w-16 h-16 rounded-[4px] bg-haldi-soft text-haldi font-bold text-3xl flex items-center justify-center mx-auto mb-4 border border-haldi/30">
        🔒
      </div>
      <h1 className="text-2xl font-bold text-ink tracking-tight">Access Restricted</h1>
      <p className="text-sm text-ink-3 mt-2 mb-8 leading-relaxed">
        You don't have permission to access this module or perform this action. Ask your Owner or Administrator if you need access.
      </p>

      <Link
        href="/home"
        className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-action hover:bg-action-hover text-white font-medium text-sm transition-colors shadow-lg shadow-indigo-950/40"
      >
        ← Back to Control Tower Home
      </Link>
    </div>
  );
}

