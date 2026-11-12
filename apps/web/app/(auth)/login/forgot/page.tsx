'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@neo/ui';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<'phone' | 'otp' | 'new_pin'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || phone.length < 10) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }
    setError(null);
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setStep('otp');
    }, 600);
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (otp !== '123456' && otp.length !== 6) {
      setError('Invalid verification code. For demo use: 123456');
      return;
    }
    setError(null);
    setStep('new_pin');
  };

  const handleResetPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin.length < 4 || newPin.length > 6) {
      setError('PIN must be 4 to 6 digits.');
      return;
    }
    if (newPin !== confirmPin) {
      setError('PIN confirmation does not match.');
      return;
    }
    setError(null);
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSuccess(true);
      setTimeout(() => router.push('/login'), 2000);
    }, 800);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-zinc-950 via-zinc-900 to-teal-950/30">
      <div className="w-full max-w-md bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 rounded-3xl p-8 shadow-2xl">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-teal-600/20 text-teal-300 font-bold text-xl border border-teal-500/40 mb-3 shadow-md">
            🔒
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">Reset Password or PIN</h1>
          <p className="text-xs text-zinc-400 mt-1">
            {step === 'phone'
              ? 'Enter your registered mobile number'
              : step === 'otp'
              ? 'Enter the 6-digit code sent to your phone'
              : 'Create a new secure PIN'}
          </p>
        </div>

        {error && (
          <div className="mb-5 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
            ✕ {error}
          </div>
        )}

        {success ? (
          <div className="text-center p-6 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl text-emerald-200">
            <div className="text-2xl mb-2">✓</div>
            <div className="font-bold text-sm">PIN Successfully Updated!</div>
            <p className="text-xs text-emerald-300/80 mt-1">Redirecting you to login...</p>
          </div>
        ) : (
          <>
            {step === 'phone' && (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    Mobile Phone Number
                  </label>
                  <div className="flex rounded-xl overflow-hidden border border-zinc-800">
                    <span className="bg-zinc-800 px-3 flex items-center text-xs font-semibold text-zinc-400 border-r border-zinc-700">
                      🇮🇳 +91
                    </span>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="98765 43210"
                      className="flex-1 bg-zinc-950 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 outline-none"
                    />
                  </div>
                </div>

                <Button type="submit" variant="primary" size="lg" className="w-full mt-4" loading={loading}>
                  Send Verification Code →
                </Button>
              </form>
            )}

            {step === 'otp' && (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    6-Digit SMS Verification Code
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="Enter 6-digit OTP (e.g. 123456)"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-center text-lg font-mono tracking-widest text-white outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Demo OTP: <strong className="text-teal-300 font-mono">123456</strong>
                  </p>
                </div>

                <Button type="submit" variant="primary" size="lg" className="w-full mt-4">
                  Verify Code →
                </Button>
              </form>
            )}

            {step === 'new_pin' && (
              <form onSubmit={handleResetPin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    New Security PIN (4-6 digits)
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-center text-lg font-mono text-white outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    Confirm New Security PIN
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-center text-lg font-mono text-white outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <Button type="submit" variant="primary" size="lg" className="w-full mt-4" loading={loading}>
                  Set New Security PIN
                </Button>
              </form>
            )}
          </>
        )}

        <div className="mt-6 pt-4 border-t border-zinc-800 text-center">
          <Link href="/login" className="text-xs text-zinc-400 hover:text-white transition-colors">
            ← Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}

