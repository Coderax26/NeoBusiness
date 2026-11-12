'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../../src/components/ui/Button';

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('owner@neobus.in');
  const [pin, setPin] = useState('123456');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, pin }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message || 'Incorrect login details. Please check your phone/email and PIN.');
        return;
      }

      // Check role to direct to Office vs Floor mode
      const role = data?.user?.role;
      if (role === 'PROD_MGR' || role === 'STOREKEEPER') {
        router.push('/floor');
      } else {
        router.push('/home');
      }
    } catch (err: any) {
      setError('Unable to reach server. Please check your network connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-zinc-950 via-zinc-900 to-indigo-950/40">
      <div className="w-full max-w-md bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 rounded-2xl p-8 shadow-2xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-600/20 text-indigo-400 font-bold text-xl border border-indigo-500/30 mb-3">
            NB
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">NeoBus ERP</h1>
          <p className="text-xs text-zinc-400 mt-1">Sign in to your site workspace</p>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <span>✕</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
              Phone or Email
            </label>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full bg-zinc-800/80 border border-zinc-700 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[48px]"
              placeholder="e.g. 9876543210 or user@neobus.in"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
              PIN or Password
            </label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full bg-zinc-800/80 border border-zinc-700 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[48px]"
              placeholder="Enter 4-6 digit security PIN"
              required
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full mt-4"
            loading={loading}
          >
            Sign In to NeoBus
          </Button>
        </form>

        <div className="mt-8 pt-6 border-t border-zinc-800/80 text-center">
          <p className="text-xs text-zinc-500">
            Forgot your PIN? Ask your Administrator or Owner to reset your credentials.
          </p>
        </div>
      </div>
    </div>
  );
}

