'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@neo/ui';

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('owner@neobus.in');
  const [secret, setSecret] = useState('123456');
  const [usePin, setUsePin] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Rate-limiting state (5 attempts / 60s per F2-01)
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);

  useEffect(() => {
    // Load remembered device
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('neobus_remembered_identifier');
      if (saved) setIdentifier(saved);
    }
  }, []);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (lockoutSeconds > 0) {
      timer = setInterval(() => {
        setLockoutSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [lockoutSeconds]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutSeconds > 0) return;

    setError(null);
    setLoading(true);

    try {
      const payload = usePin
        ? { identifier, pin: secret }
        : { identifier, password: secret, pin: secret };

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        const nextAttempts = failedAttempts + 1;
        setFailedAttempts(nextAttempts);

        if (nextAttempts >= 5) {
          setLockoutSeconds(60);
          setError('Too many failed attempts. For your security, login is locked for 60 seconds.');
        } else {
          setError(
            data?.error?.message ||
              `Incorrect credentials. Please verify your ${usePin ? 'PIN' : 'password'}. (${
                5 - nextAttempts
              } attempts remaining)`,
          );
        }
        return;
      }

      // Successful login
      setFailedAttempts(0);
      if (rememberDevice && typeof window !== 'undefined') {
        localStorage.setItem('neobus_remembered_identifier', identifier);
      } else if (typeof window !== 'undefined') {
        localStorage.removeItem('neobus_remembered_identifier');
      }

      const role = data?.user?.role;
      if (role === 'PROD_MGR' || role === 'STOREKEEPER') {
        router.push('/floor');
      } else {
        router.push('/home');
      }
    } catch {
      setError('Unable to reach server. Please check your network connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-zinc-950 via-zinc-900 to-teal-950/30">
      <div className="w-full max-w-md bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 rounded-3xl p-8 shadow-2xl">
        {/* Company Logo & Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-teal-600/20 text-teal-300 font-bold text-2xl border border-teal-500/40 mb-3 shadow-lg shadow-teal-950/40">
            NB
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">NeoBus ERP</h1>
          <p className="text-xs text-zinc-400 mt-1">Enterprise Operations &amp; Control Tower</p>
        </div>

        {/* Auth Mode Toggle (Password vs Quick PIN for Floor devices) */}
        <div className="flex bg-zinc-950/60 p-1 rounded-xl mb-6 border border-zinc-800">
          <button
            type="button"
            onClick={() => {
              setUsePin(false);
              setError(null);
            }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              !usePin
                ? 'bg-teal-600 text-white shadow-xs'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Password (Office)
          </button>
          <button
            type="button"
            onClick={() => {
              setUsePin(true);
              setError(null);
            }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              usePin
                ? 'bg-teal-600 text-white shadow-xs'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Security PIN (Floor)
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-5 p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2"
          >
            <span className="font-bold">✕</span>
            <span>{error}</span>
          </div>
        )}

        {lockoutSeconds > 0 && (
          <div className="mb-5 p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs text-center font-mono">
            ⏳ Try again in <strong className="text-white">{lockoutSeconds}s</strong>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5 select-none">
              Phone Number or Email
            </label>
            <input
              type="text"
              required
              disabled={lockoutSeconds > 0 || loading}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500 min-h-[44px]"
              placeholder={usePin ? 'Enter registered phone (e.g. 9876543210)' : 'name@neobus.in or phone'}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-zinc-300 select-none">
                {usePin ? '4-6 Digit Security PIN' : 'Account Password'}
              </label>
              <Link
                href="/login/forgot"
                className="text-xs text-teal-400 hover:text-teal-300 transition-colors"
              >
                Forgot {usePin ? 'PIN' : 'password'}?
              </Link>
            </div>
            <div className="relative flex items-center">
              <input
                type={showSecret ? 'text' : 'password'}
                inputMode={usePin ? 'numeric' : 'text'}
                required
                disabled={lockoutSeconds > 0 || loading}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-4 pr-12 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500 min-h-[44px]"
                placeholder={usePin ? '••••••' : 'Enter password'}
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-3 text-xs text-zinc-500 hover:text-zinc-300 p-1"
                aria-label={showSecret ? 'Hide password' : 'Show password'}
              >
                {showSecret ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberDevice}
                onChange={(e) => setRememberDevice(e.target.checked)}
                className="rounded border-zinc-700 bg-zinc-950 text-teal-600 focus:ring-teal-500"
              />
              <span>Remember this device</span>
            </label>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full mt-4"
            loading={loading}
            disabled={lockoutSeconds > 0}
          >
            {lockoutSeconds > 0 ? `Locked (${lockoutSeconds}s)` : 'Sign In to Workspace'}
          </Button>
        </form>
      </div>
    </div>
  );
}
