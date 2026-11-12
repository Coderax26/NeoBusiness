'use client';

import React, { useEffect } from 'react';
import { Button } from '../src/components/ui/Button';
import { captureClientException } from '../lib/telemetry';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureClientException(error, { digest: error.digest });
  }, [error]);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center shadow-2xl">
        <div className="w-12 h-12 rounded-xl bg-rose-500/20 text-rose-400 font-bold text-xl flex items-center justify-center mx-auto mb-4 border border-rose-500/30">
          ✕
        </div>
        <h2 className="text-xl font-bold text-white tracking-tight">Something went wrong</h2>
        <p className="text-xs text-zinc-400 mt-2 mb-6 leading-relaxed">
          We couldn't reach the server or process this action. Your work is saved — you can try reloading the latest data.
        </p>

        <div className="flex gap-3 justify-center">
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Reload Latest
          </Button>
          <Button variant="primary" onClick={() => reset()}>
            Try Again
          </Button>
        </div>
      </div>
    </div>
  );
}
