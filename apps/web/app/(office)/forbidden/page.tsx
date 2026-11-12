import React from 'react';
import Link from 'next/link';

export default function ForbiddenPage() {
  return (
    <div className="max-w-md mx-auto text-center py-20">
      <div className="w-16 h-16 rounded-2xl bg-amber-500/20 text-amber-400 font-bold text-3xl flex items-center justify-center mx-auto mb-4 border border-amber-500/30">
        🔒
      </div>
      <h1 className="text-2xl font-bold text-white tracking-tight">Access Restricted</h1>
      <p className="text-sm text-zinc-400 mt-2 mb-8 leading-relaxed">
        You don't have permission to access this module or perform this action. Ask your Owner or Administrator if you need access.
      </p>

      <Link
        href="/home"
        className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-colors shadow-lg shadow-indigo-950/40"
      >
        ← Back to Control Tower Home
      </Link>
    </div>
  );
}
