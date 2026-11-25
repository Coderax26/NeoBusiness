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
    <div className="min-h-screen flex items-center justify-center p-4 bahi-ledger-bg">
      <div className="w-full max-w-md bg-sheet border border-rule-strong rounded-[4px] p-8 shadow-xl">
        <div className="text-center mb-6">
          <div className="font-serif text-[22px] font-semibold text-ink mb-2">NeoBus</div>
          <h1 className="font-serif text-[24px] font-medium text-ink tracking-tight">Reset Password or PIN</h1>
          <p className="text-[13.5px] text-ink-3 mt-1">
            {step === 'phone'
              ? 'Enter your registered mobile number'
              : step === 'otp'
              ? 'Enter the 6-digit code sent to your phone'
              : 'Create a new secure PIN'}
          </p>
        </div>

        {error && (
          <div className="mb-5 p-3 rounded-[3px] bg-madder-soft border border-madder/30 text-madder text-xs">
            ✕ {error}
          </div>
        )}

        {success ? (
          <div className="text-center p-6 bg-leaf-soft border border-leaf/30 rounded-[4px] text-leaf">
            <div className="text-2xl mb-2">✓</div>
            <div className="font-bold text-sm">PIN Successfully Updated!</div>
            <p className="text-xs text-leaf/80 mt-1">Redirecting you to login...</p>
          </div>
        ) : (
          <>
            {step === 'phone' && (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-ink-2 mb-1.5">
                    Mobile Phone Number
                  </label>
                  <div className="flex rounded-[3px] overflow-hidden border border-rule">
                    <span className="bg-sunken px-3 flex items-center text-xs font-semibold text-ink-3 border-r border-rule-strong">
                      🇮🇳 +91
                    </span>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="98765 43210"
                      className="flex-1 bg-paper px-3.5 py-2.5 text-sm text-ink placeholder-ink-3 outline-none"
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
                  <label className="block text-xs font-semibold text-ink-2 mb-1.5">
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
                    className="w-full bg-paper border border-rule rounded-[3px] px-4 py-3 text-center text-lg font-mono tracking-widest text-ink outline-none focus:ring-2 focus:ring-action"
                  />
                  <p className="text-[11px] text-ink-3 mt-1">
                    Demo OTP: <strong className="text-action font-mono">123456</strong>
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
                  <label className="block text-xs font-semibold text-ink-2 mb-1.5">
                    New Security PIN (4-6 digits)
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value)}
                    className="w-full bg-paper border border-rule rounded-[3px] px-4 py-3 text-center text-lg font-mono text-ink outline-none focus:ring-2 focus:ring-action"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink-2 mb-1.5">
                    Confirm New Security PIN
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value)}
                    className="w-full bg-paper border border-rule rounded-[3px] px-4 py-3 text-center text-lg font-mono text-ink outline-none focus:ring-2 focus:ring-action"
                  />
                </div>

                <Button type="submit" variant="primary" size="lg" className="w-full mt-4" loading={loading}>
                  Set New Security PIN
                </Button>
              </form>
            )}
          </>
        )}

        <div className="mt-6 pt-4 border-t border-rule text-center">
          <Link href="/login" className="text-xs text-ink-3 hover:text-ink transition-colors">
            ← Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}

