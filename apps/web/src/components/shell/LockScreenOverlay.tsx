'use client';

import React, { useState, useEffect } from 'react';
import { Button, Avatar } from '@neo/ui';
import type { SessionUser } from '@neo/shared';

export interface LockScreenOverlayProps {
  user: SessionUser | null;
  idleTimeoutMinutes?: number;
  onUnlock?: () => void;
}

export const LockScreenOverlay: React.FC<LockScreenOverlayProps> = ({
  user,
  idleTimeoutMinutes = 30, // 30 min office, 5 min floor per F2-01
  onUnlock,
}) => {
  const [isLocked, setIsLocked] = useState(false);
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const resetTimer = () => {
      if (isLocked) return;
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setIsLocked(true);
      }, idleTimeoutMinutes * 60 * 1000);
    };

    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart'];
    events.forEach((ev) => window.addEventListener(ev, resetTimer));
    resetTimer();

    return () => {
      clearTimeout(timeoutId);
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
    };
  }, [idleTimeoutMinutes, isLocked]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secret) return;

    setLoading(true);
    setError(null);

    try {
      // Validate credentials against BFF /api/auth/login or session check
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: user?.phone || user?.email || '',
          password: secret,
          pin: secret,
        }),
      });

      if (!res.ok) {
        setError('Incorrect PIN or password. Try again.');
        return;
      }

      setIsLocked(false);
      setSecret('');
      onUnlock?.();
    } catch {
      setError('Unable to verify credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isLocked) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in select-none">
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-3xl p-8 text-center shadow-2xl">
        <div className="flex justify-center mb-4">
          <Avatar name={user?.name || 'User'} size="lg" />
        </div>

        <h3 className="text-base font-bold text-white tracking-tight">{user?.name || 'Authorized User'}</h3>
        <p className="text-xs text-zinc-400 mt-0.5">Session locked due to inactivity</p>
        <p className="text-[11px] text-teal-300/80 mt-1 mb-6">
          Your in-progress forms and drafts are safely preserved.
        </p>

        {error && (
          <div className="mb-4 p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
            ✕ {error}
          </div>
        )}

        <form onSubmit={handleUnlock} className="space-y-4">
          <input
            type="password"
            autoFocus
            required
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Enter PIN or Password"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-center text-sm font-mono text-white placeholder-zinc-500 outline-none focus:ring-2 focus:ring-teal-500"
          />

          <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
            Unlock Workspace 🔓
          </Button>
        </form>
      </div>
    </div>
  );
};

