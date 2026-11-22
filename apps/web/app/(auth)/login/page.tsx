'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@neo/ui';

interface DemoPersona {
  label: string;
  role: string;
  identifier: string;
  secret: string;
  usePin: boolean;
  badge: string;
  desc: string;
}

const DEMO_PERSONAS: DemoPersona[] = [
  {
    label: 'Ravi Kumar (Owner)',
    role: 'OWNER',
    identifier: '+919876543210',
    secret: '1234',
    usePin: false,
    badge: 'Full Control Tower',
    desc: 'Approvals, margins, analytics, EOD sign-off & admin',
  },
  {
    label: 'Anita Desai (Ops Coord)',
    role: 'OPS_COORD',
    identifier: '+919876543211',
    secret: '2233',
    usePin: false,
    badge: 'Office Desk',
    desc: 'Sales orders, procurement, dispatch & daily price sheet',
  },
  {
    label: 'Arjun Rao (Storekeeper)',
    role: 'STOREKEEPER',
    identifier: '+919876543215',
    secret: '6677',
    usePin: true,
    badge: 'Floor Mode',
    desc: 'Touch-friendly blind GRN, stock count, transfers & loading',
  },
  {
    label: 'Suresh Patel (Production Mgr)',
    role: 'PROD_MGR',
    identifier: '+919876543212',
    secret: '3344',
    usePin: true,
    badge: 'Factory Floor',
    desc: 'Work orders, batch output, wastage & worker attendance',
  },
];

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [secret, setSecret] = useState('');
  const showDemoPersonas = process.env.NEXT_PUBLIC_SHOW_DEMO_PERSONAS === 'true';
  const [usePin, setUsePin] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Rate-limiting state (5 attempts / 60s per F2-01)
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('neobus_remembered_identifier');
      if (saved && saved !== 'owner@neobus.in') {
        setIdentifier(saved);
      }
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

  const handleSelectPersona = (persona: DemoPersona) => {
    setIdentifier(persona.identifier);
    setSecret(persona.secret);
    setUsePin(persona.usePin);
    setError(null);
  };

  const handlePinKey = (digit: string) => {
    if (lockoutSeconds > 0 || loading) return;
    if (digit === 'CLR') {
      setSecret('');
    } else if (digit === '⌫') {
      setSecret((prev) => prev.slice(0, -1));
    } else if (secret.length < 6) {
      setSecret((prev) => prev + digit);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutSeconds > 0) return;

    setError(null);
    setLoading(true);

    try {
      const payload = usePin
        ? { phone: identifier, identifier, pin: secret }
        : { phone: identifier, identifier, password: secret, pin: secret };

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
    <div className="min-h-screen w-full bg-zinc-950 text-zinc-100 flex flex-col lg:flex-row relative overflow-hidden">
      {/* Ambient Background Glows */}
      <div className="pointer-events-none absolute -top-40 -left-40 w-96 h-96 rounded-full bg-teal-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-emerald-500/10 blur-3xl" />

      {/* Left Column — Interactive Enterprise Control Tower Showcase */}
      <div className="lg:w-7/12 xl:w-3/5 p-8 lg:p-14 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-zinc-800/80 bg-gradient-to-br from-zinc-950 via-zinc-900/90 to-teal-950/25">
        <div>
          {/* Top Brand Bar */}
          <div className="flex items-center justify-between gap-4 mb-10">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-teal-950/60">
                NB
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-black tracking-tight text-white">NeoBus ERP</span>
                  <span className="text-[11px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-300 border border-teal-500/30">
                    v2.4 Control Tower
                  </span>
                </div>
                <p className="text-xs text-zinc-400">
                  Baramati Agro-Processing, Supply Chain &amp; Multi-Site Distribution
                </p>
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900/90 border border-zinc-800 text-xs text-zinc-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>All 3 Plants Online · IST Sync</span>
            </div>
          </div>

          {/* Hero Headline */}
          <div className="max-w-2xl mb-8">
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white leading-tight mb-3">
              Exception-First Operations &amp; Real-Time Margin Control.
            </h1>
            <p className="text-sm sm:text-base text-zinc-400 leading-relaxed">
              Manage daily commodity price bands, FEFO batch inventory, factory work orders, GPS
              fleet dispatch, and FIFO receivables from a single role-tailored workspace.
            </p>
          </div>

          {/* Live Telemetry Preview Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-8">
            <div className="p-4 rounded-2xl bg-zinc-900/75 border border-zinc-800/90 backdrop-blur-md">
              <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
                <span>Today&apos;s Dispatch Pulse</span>
                <span className="text-emerald-400 font-semibold">Live</span>
              </div>
              <div className="text-xl font-black text-white font-mono">PostgreSQL</div>
              <div className="text-[11px] text-zinc-500 mt-1">
                Role-Scoped Orders · Active Trips
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-900/75 border border-zinc-800/90 backdrop-blur-md">
              <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
                <span>Floor &amp; FEFO Guard</span>
                <span className="text-teal-400 font-semibold">100% Enforced</span>
              </div>
              <div className="text-xl font-black text-white font-mono">0 Drift</div>
              <div className="text-[11px] text-zinc-500 mt-1">
                Exact Decimal Money · Blind GRN Active
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-900/75 border border-zinc-800/90 backdrop-blur-md">
              <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
                <span>Pending Approvals</span>
                <span className="text-amber-400 font-semibold">Live SLA Tracking</span>
              </div>
              <div className="text-xl font-black text-white font-mono">&lt; 4 min</div>
              <div className="text-[11px] text-zinc-500 mt-1">
                Avg Owner Counter-Offer Resolution
              </div>
            </div>
          </div>

          {/* Interactive 1-Click Demo Role Switcher (only when NEXT_PUBLIC_SHOW_DEMO_PERSONAS=true) */}
          {showDemoPersonas && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Quick-Fill Role Personas (Click to Load Credentials)
              </span>
              <span className="text-[11px] text-teal-400 font-mono">Seeded Demo Users</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {DEMO_PERSONAS.map((persona) => {
                const isSelected = identifier === persona.identifier && usePin === persona.usePin;
                return (
                  <button
                    key={persona.role}
                    type="button"
                    onClick={() => handleSelectPersona(persona)}
                    className={`text-left p-3.5 rounded-2xl border transition-all ${
                      isSelected
                        ? 'bg-teal-950/40 border-teal-500/70 shadow-lg shadow-teal-950/50'
                        : 'bg-zinc-900/60 border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-sm font-bold text-white">{persona.label}</span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                          isSelected
                            ? 'bg-teal-500 text-zinc-950'
                            : 'bg-zinc-800 text-zinc-300'
                        }`}
                      >
                        {persona.badge}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 line-clamp-1 mb-1.5">{persona.desc}</p>
                    <div className="flex items-center gap-2 text-[11px] font-mono text-teal-300/90">
                      <span>Phone: {persona.identifier}</span>
                      <span>·</span>
                      <span>PIN: {persona.secret}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          )}
        </div>

        {/* Footer Compliance Note */}
        <div className="mt-8 pt-6 border-t border-zinc-800/70 flex flex-wrap items-center justify-between gap-4 text-xs text-zinc-500">
          <span>🔒 256-Bit JWT Session · Role-Scoped Field Masking (OD-004)</span>
          <span>Need help? Contact Plant IT Extension #104</span>
        </div>
      </div>

      {/* Right Column — Sign-In Card */}
      <div className="lg:w-5/12 xl:w-2/5 flex items-center justify-center p-6 sm:p-10 lg:p-12">
        <div className="w-full max-w-md bg-zinc-900/90 backdrop-blur-xl border border-zinc-800 rounded-3xl p-7 sm:p-9 shadow-2xl">
          {/* Card Header */}
          <div className="mb-6">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-300 text-xs font-semibold mb-3">
              <span>⚡</span>
              <span>Secure Workspace Sign-In</span>
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">Welcome back</h2>
            <p className="text-xs text-zinc-400 mt-1">
              Sign in with your office password or 6-digit factory floor security PIN.
            </p>
          </div>

          {/* Auth Mode Toggle (Password vs Quick PIN for Floor devices) */}
          <div className="grid grid-cols-2 bg-zinc-950 p-1 rounded-xl mb-6 border border-zinc-800">
            <button
              type="button"
              onClick={() => {
                setUsePin(false);
                setError(null);
              }}
              className={`py-2.5 text-xs font-bold rounded-lg transition-all ${
                !usePin
                  ? 'bg-teal-600 text-white shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              🔑 Password (Office)
            </button>
            <button
              type="button"
              onClick={() => {
                setUsePin(true);
                setError(null);
              }}
              className={`py-2.5 text-xs font-bold rounded-lg transition-all ${
                usePin
                  ? 'bg-teal-600 text-white shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              🔢 Security PIN (Floor)
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-5 p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5"
            >
              <span className="font-bold text-sm">✕</span>
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
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500 min-h-[46px]"
                placeholder={
                  usePin ? 'Enter registered phone (e.g. 9876543212)' : 'name@neobus.in or phone'
                }
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-zinc-300 select-none">
                  {usePin ? '4–6 Digit Security PIN' : 'Account Password'}
                </label>
                <Link
                  href="/login/forgot"
                  className="text-xs font-semibold text-teal-400 hover:text-teal-300 transition-colors"
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
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-4 pr-14 py-3 text-sm text-white font-mono tracking-wider placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500 min-h-[46px]"
                  placeholder={usePin ? '••••••' : 'Enter password'}
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-3 text-xs font-semibold text-zinc-400 hover:text-white px-2 py-1 rounded-md bg-zinc-900 border border-zinc-800"
                  aria-label={showSecret ? 'Hide password' : 'Show password'}
                >
                  {showSecret ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {/* Interactive Touch PIN Pad when in Floor PIN mode */}
            {usePin && (
              <div className="pt-1">
                <div className="text-[11px] text-zinc-400 mb-2 font-medium">
                  Touch Keypad (Glove-Friendly 48px Targets)
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', '⌫'].map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handlePinKey(key)}
                      className="h-11 rounded-xl bg-zinc-950 hover:bg-zinc-800 active:bg-teal-600/30 border border-zinc-800 text-sm font-bold text-zinc-200 font-mono transition-colors"
                    >
                      {key}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberDevice}
                  onChange={(e) => setRememberDevice(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-teal-600 focus:ring-teal-500"
                />
                <span>Remember this workstation</span>
              </label>
              <span className="text-[11px] text-zinc-500">Max 5 attempts / 60s</span>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full mt-2 py-3.5 text-sm font-bold rounded-xl bg-teal-600 hover:bg-teal-500 text-white shadow-lg shadow-teal-950/50 transition-all"
              loading={loading}
              disabled={lockoutSeconds > 0}
            >
              {lockoutSeconds > 0 ? `Locked (${lockoutSeconds}s)` : 'Sign In to Workspace →'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
