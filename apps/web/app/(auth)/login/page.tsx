'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Check, Delete } from 'lucide-react';
import { Button } from '@neo/ui';
import { useLocale } from '../../../src/lib/locale';

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
    badge: 'Owner',
    desc: 'Approvals, margins, analytics, day closing & admin',
  },
  {
    label: 'Anita Desai (Coordinator)',
    role: 'OPS_COORD',
    identifier: '+919876543211',
    secret: '2233',
    usePin: false,
    badge: 'Office Desk',
    desc: 'Sales orders, procurement, dispatch & daily prices',
  },
  {
    label: 'Arjun Rao (Storekeeper)',
    role: 'STOREKEEPER',
    identifier: '+919876543215',
    secret: '6677',
    usePin: true,
    badge: 'Floor Mode',
    desc: 'Receive goods, stock count, transfers & loading',
  },
  {
    label: 'Suresh Patel (Production Mgr)',
    role: 'PROD_MGR',
    identifier: '+919876543212',
    secret: '3344',
    usePin: true,
    badge: 'Factory Floor',
    desc: 'Work orders, batch output, wastage & attendance',
  },
];

function getTimeGreeting() {
  const hr = new Date().getHours();
  if (hr < 12) return { en: 'Good morning.', mr: 'शुभ प्रभात' };
  if (hr < 17) return { en: 'Good afternoon.', mr: 'शुभ दुपार' };
  return { en: 'Good evening.', mr: 'शुभ संध्याकाळ' };
}

export default function LoginPage() {
  const router = useRouter();
  const { locale, setLocale } = useLocale();
  const [identifier, setIdentifier] = useState('');
  const [secret, setSecret] = useState('');
  const showDemoPersonas = process.env.NEXT_PUBLIC_SHOW_DEMO_PERSONAS === 'true';
  const [usePin, setUsePin] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [greeting, setGreeting] = useState({ en: 'Good evening.', mr: 'शुभ संध्याकाळ' });

  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);

  useEffect(() => {
    setGreeting(getTimeGreeting());
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
    } else if (digit === 'BACK') {
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

      setFailedAttempts(0);
      if (rememberDevice && typeof window !== 'undefined') {
        localStorage.setItem('neobus_remembered_identifier', identifier);
      } else if (typeof window !== 'undefined') {
        localStorage.removeItem('neobus_remembered_identifier');
      }

      const role = data?.user?.role;
      const targetRoute = role === 'PROD_MGR' || role === 'STOREKEEPER' ? '/floor' : '/home';
      if (typeof window !== 'undefined') {
        window.location.assign(targetRoute);
      } else {
        router.push(targetRoute);
      }
    } catch {
      setError('Unable to reach server. Please check your network connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-paper text-ink flex flex-col lg:flex-row">
      {/* Left 58%: Ruled Ledger Paper with Double Madder Margin Line */}
      <div className="lg:w-[58%] bahi-ledger-bg relative px-8 py-10 sm:px-16 lg:pl-36 lg:pr-20 lg:py-16 flex flex-col border-b lg:border-b-0 lg:border-r border-rule">
        {/* Double red margin rule */}
        <div
          aria-hidden="true"
          className="hidden lg:block absolute top-0 bottom-0 left-[104px] bahi-margin-rule"
        />

        <div className="font-serif text-[26px] font-semibold tracking-tight text-ink">
          NeoBus
        </div>

        <div className="mt-16 lg:mt-36 max-w-xl">
          <h1 className="font-serif text-5xl sm:text-[68px] leading-[1.05] tracking-[-0.02em] font-normal text-ink">
            {greeting.en}
          </h1>
          <div className="font-devanagari text-2xl sm:text-[28px] font-medium text-ink-2 mt-3">
            {greeting.mr}
          </div>
          <p className="font-serif text-[18px] sm:text-[19px] leading-relaxed text-ink-2 mt-7 max-w-lg">
            Orders, stock, factory, deliveries and money, kept in one book.
          </p>
        </div>

        {/* Optional demo personas if enabled by env */}
        {showDemoPersonas && (
          <div className="mt-10 pt-6 border-t border-rule">
            <div className="text-[13px] font-semibold text-ink-2 mb-3">
              Demo logins (click to fill)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {DEMO_PERSONAS.map((persona) => {
                const isSelected = identifier === persona.identifier && usePin === persona.usePin;
                return (
                  <button
                    key={persona.role}
                    type="button"
                    onClick={() => handleSelectPersona(persona)}
                    className={`text-left p-3 rounded-[4px] border transition-colors ${
                      isSelected
                        ? 'bg-sheet border-action'
                        : 'bg-sheet/80 border-rule hover:border-rule-strong'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="text-[13.5px] font-semibold text-ink">{persona.label}</span>
                      <span className="text-[12px] text-action font-medium">{persona.badge}</span>
                    </div>
                    <p className="text-[12.5px] text-ink-3 line-clamp-1">{persona.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-auto pt-10 text-[13px] text-ink-3">
          Trouble signing in? Call the office on 02112 244 100.
        </div>
      </div>

      {/* Right 42%: Clean Sheet Sign-In Form */}
      <div className="lg:w-[42%] bg-sheet flex flex-col px-6 py-8 sm:px-14 lg:px-20 lg:py-10">
        {/* Language switch */}
        <div className="self-end text-[13.5px] text-ink-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLocale('en')}
            className={locale === 'en' ? 'text-ink font-semibold' : 'hover:text-ink'}
          >
            English
          </button>
          <span>·</span>
          <button
            type="button"
            onClick={() => setLocale('mr')}
            className={`font-devanagari ${locale === 'mr' ? 'text-ink font-semibold' : 'hover:text-ink'}`}
          >
            मराठी
          </button>
        </div>

        <div className="my-auto py-10 max-w-[400px] w-full mx-auto lg:mx-0">
          <h2 className="font-serif text-[32px] font-medium text-ink tracking-tight">
            {locale === 'mr' ? 'साइन इन करा' : 'Sign in'}
          </h2>
          <p className="text-[14.5px] text-ink-2 mt-1.5">
            {locale === 'mr'
              ? 'कार्यालयात नोंदवलेला मोबाईल क्रमांक वापरा.'
              : 'Use the mobile number registered with the office.'}
          </p>

          {error && (
            <div
              role="alert"
              className="mt-5 p-3.5 rounded-[3px] bg-madder-soft border border-madder/30 text-madder text-[13.5px] flex items-start gap-2"
            >
              <span className="font-semibold">✕</span>
              <span>{error}</span>
            </div>
          )}

          {lockoutSeconds > 0 && (
            <div className="mt-5 p-3 rounded-[3px] bg-haldi-soft border border-haldi/30 text-haldi text-[13.5px] text-center font-mono">
              Try again in <strong>{lockoutSeconds}s</strong>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div>
              <label className="block text-[13.5px] font-medium text-ink mb-1.5 select-none">
                {usePin ? 'Mobile number' : 'Mobile number or email'}
              </label>
              <div className="flex h-[46px] rounded-[3px] border border-rule-strong bg-white focus-within:border-action focus-within:ring-2 focus-within:ring-action/20 overflow-hidden">
                <span className="px-3 bg-paper border-r border-rule flex items-center text-[14px] text-ink-2 select-none">
                  +91
                </span>
                <input
                  type="text"
                  required
                  disabled={lockoutSeconds > 0 || loading}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="flex-1 px-3 bg-white text-[15px] text-[#1E1C19] placeholder-[#77716A] outline-none"
                  placeholder={usePin ? '98765 43212' : '99999 99999 or email'}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[13.5px] font-medium text-ink select-none">
                  {usePin ? '4–6 digit security PIN' : 'Password'}
                </label>
                <Link
                  href="/login/forgot"
                  className="text-[13.5px] font-medium text-action hover:underline"
                >
                  Forgot?
                </Link>
              </div>
              <div className="relative flex items-center h-[46px] rounded-[3px] border border-rule-strong bg-white focus-within:border-action focus-within:ring-2 focus-within:ring-action/20 overflow-hidden">
                <input
                  type={showSecret ? 'text' : 'password'}
                  inputMode={usePin ? 'numeric' : 'text'}
                  required
                  disabled={lockoutSeconds > 0 || loading}
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  className="w-full px-3 pr-11 h-full bg-white text-[15px] text-[#1E1C19] font-mono tracking-wider placeholder-[#77716A] outline-none"
                  placeholder={usePin ? '••••••' : 'Enter password'}
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-2.5 text-ink-3 hover:text-ink p-1.5"
                  aria-label={showSecret ? 'Hide password' : 'Show password'}
                >
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {usePin && (
              <div className="pt-1">
                <div className="text-[13px] text-ink-3 mb-2">Touch keypad</div>
                <div className="grid grid-cols-3 gap-2">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', 'BACK'].map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handlePinKey(key)}
                      className="h-12 rounded-[3px] bg-paper hover:bg-sunken border border-rule-strong text-[15px] font-semibold text-ink font-mono flex items-center justify-center transition-colors"
                    >
                      {key === 'BACK' ? <Delete className="w-4 h-4" /> : key}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <label className="flex items-center gap-2.5 text-[14px] text-ink-2 cursor-pointer select-none pt-0.5">
              <span
                className={`w-[17px] h-[17px] rounded-[2px] border flex items-center justify-center transition-colors ${
                  rememberDevice ? 'bg-action border-action text-white' : 'bg-white border-rule-strong'
                }`}
              >
                {rememberDevice && <Check className="w-3 h-3" strokeWidth={2.5} />}
              </span>
              <input
                type="checkbox"
                checked={rememberDevice}
                onChange={(e) => setRememberDevice(e.target.checked)}
                className="sr-only"
              />
              <span>Keep me signed in on this computer</span>
            </label>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full h-[48px] text-[15.5px]"
              loading={loading}
              disabled={lockoutSeconds > 0}
            >
              {lockoutSeconds > 0 ? `Locked (${lockoutSeconds}s)` : 'Sign in'}
            </Button>
          </form>

          <div className="mt-7 pt-4 border-t border-rule text-[14px] text-ink-2">
            {usePin ? (
              <>
                Signing in at an office desk?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setUsePin(false);
                    setError(null);
                  }}
                  className="text-action font-medium hover:underline"
                >
                  Sign in with your password →
                </button>
              </>
            ) : (
              <>
                Working on the floor or in the store?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setUsePin(true);
                    setError(null);
                  }}
                  className="text-action font-medium hover:underline"
                >
                  Sign in with your PIN →
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
