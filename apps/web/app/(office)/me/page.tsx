'use client';

import React, { useState, useEffect } from 'react';
import { Card, Button, Avatar, useTheme } from '@neo/ui';
import type { SessionUser } from '@neo/shared';
import { useLocale } from '../../../src/lib/locale';

export default function ProfilePage() {
  const { theme, setTheme, density, setDensity } = useTheme();
  const { locale, setLocale } = useLocale();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [language, setLanguage] = useState<'en' | 'mr'>(locale);
  const [selectedDensity, setSelectedDensity] = useState<'comfortable' | 'compact'>(density);
  const [selectedTheme, setSelectedTheme] = useState<'paper' | 'night'>(
    theme === 'night' || theme === 'dark' ? 'night' : 'paper',
  );
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  // Change PIN / Password
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinMessage, setPinMessage] = useState<{ text: string; tone: 'success' | 'error' } | null>(null);
  const [savingPin, setSavingPin] = useState(false);

  useEffect(() => {
    setLanguage(locale);
  }, [locale]);

  useEffect(() => {
    setSelectedDensity(density);
  }, [density]);

  useEffect(() => {
    setSelectedTheme(theme === 'night' || theme === 'dark' ? 'night' : 'paper');
  }, [theme]);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => { });
  }, []);

  const handleSavePreferences = async () => {
    setLocale(language);
    setDensity(selectedDensity);
    setTheme(selectedTheme);
    setSavedMsg('Saving...');
    try {
      const res = await fetch('/api/proxy/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferredLanguage: language,
          uiPreferences: { theme: selectedTheme, density: selectedDensity },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error?.message || `HTTP ${res.status}`);
      }
      setSavedMsg('Preferences saved.');
    } catch (err) {
      setSavedMsg(`Failed to sync preferences: ${(err as Error).message}`);
    }
    setTimeout(() => setSavedMsg(null), 3000);
  };

  const handleUpdatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinMessage(null);

    if (!currentPin.trim()) {
      setPinMessage({ text: 'Current PIN or password is required.', tone: 'error' });
      return;
    }
    if (!/^\d{4,6}$/.test(newPin)) {
      setPinMessage({ text: 'PIN must be 4 to 6 numeric digits.', tone: 'error' });
      return;
    }
    if (newPin !== confirmPin) {
      setPinMessage({ text: 'PIN confirmation does not match.', tone: 'error' });
      return;
    }

    setSavingPin(true);
    try {
      const res = await fetch('/api/proxy/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentCredential: currentPin,
          newCredential: newPin,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || data?.error?.message || `HTTP ${res.status}`);
      }
      setPinMessage({ text: 'Security PIN updated successfully!', tone: 'success' });
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
    } catch (err) {
      setPinMessage({ text: (err as Error).message || 'Failed to update security PIN.', tone: 'error' });
    } finally {
      setSavingPin(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="pb-4 border-b border-rule">
        <h1 className="font-serif text-[28px] font-medium tracking-tight text-ink">
          My Account & Preferences
        </h1>
        <p className="text-[13.5px] text-ink-3 mt-1">
          Manage your identity, security PIN, theme, language, and interface density
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* User Card */}
        <Card className="md:col-span-1 flex flex-col items-center text-center p-6">
          <Avatar name={user?.name || 'User'} size="lg" className="w-20 h-20 text-2xl mb-4" />
          <h3 className="text-[16px] font-semibold text-ink">{user?.name || 'Authorized Staff'}</h3>
          <span className="text-[13px] text-action font-medium mt-0.5">{user?.role || 'Staff Role'}</span>
          <p className="text-[13px] text-ink-3 mt-2 font-mono">{user?.phone || (user as any)?.email || '—'}</p>

          <div className="w-full mt-6 pt-4 border-t border-rule text-left space-y-2 text-[13px]">
            <div className="text-ink-3 font-medium">Assigned Sites:</div>
            <div className="space-y-1.5">
              {(user?.sites || []).map((s) => (
                <div key={s.id} className="p-2 rounded-[3px] bg-paper border border-rule text-ink">
                  {s.name} ({s.siteType})
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Preferences & Security Forms */}
        <div className="md:col-span-2 space-y-6">
          {/* Display & Language */}
          <Card className="p-6 space-y-4">
            <h3 className="text-[15px] font-semibold text-ink pb-2 bahi-section-rule">
              Interface & Regional Preferences
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-[13px] font-medium text-ink-2 mb-1.5">Language</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as 'en' | 'mr')}
                  className="w-full bg-paper border border-rule-strong rounded-[3px] px-3 py-2 text-[13.5px] text-ink"
                >
                  <option value="en">English (Default)</option>
                  <option value="mr">मराठी (Marathi)</option>
                </select>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-ink-2 mb-1.5">Theme</label>
                <select
                  value={selectedTheme}
                  onChange={(e) => setSelectedTheme(e.target.value as 'paper' | 'night')}
                  className="w-full bg-paper border border-rule-strong rounded-[3px] px-3 py-2 text-[13.5px] text-ink"
                >
                  <option value="paper">Paper (Light Ledger)</option>
                  <option value="night">Night (Dark)</option>
                </select>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-ink-2 mb-1.5">Layout Density</label>
                <select
                  value={selectedDensity}
                  onChange={(e) => setSelectedDensity(e.target.value as 'comfortable' | 'compact')}
                  className="w-full bg-paper border border-rule-strong rounded-[3px] px-3 py-2 text-[13.5px] text-ink"
                >
                  <option value="comfortable">Comfortable (Generous spacing)</option>
                  <option value="compact">Compact (High data density)</option>
                </select>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <span className="text-[13px] text-leaf">{savedMsg}</span>
              <Button size="sm" variant="primary" onClick={handleSavePreferences}>
                Save Preferences
              </Button>
            </div>
          </Card>

          {/* Security PIN & Password */}
          <Card className="p-6 space-y-4">
            <h3 className="text-[15px] font-semibold text-ink pb-2 bahi-section-rule">
              Security PIN & Password
            </h3>

            {pinMessage && (
              <div
                className={`p-3 rounded-[3px] text-[13px] border ${pinMessage.tone === 'success'
                  ? 'bg-leaf-soft border-leaf/30 text-leaf'
                  : 'bg-madder-soft border-madder/30 text-madder'
                  }`}
              >
                {pinMessage.text}
              </div>
            )}

            <form onSubmit={handleUpdatePin} className="space-y-3">
              <div>
                <label className="block text-[13px] font-medium text-ink-2 mb-1.5">Current PIN / Password</label>
                <input
                  type="password"
                  required
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value)}
                  className="w-full bg-paper border border-rule-strong rounded-[3px] px-3 py-2 text-[14px] text-ink font-mono"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[13px] font-medium text-ink-2 mb-1.5">New 4–6 Digit PIN</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value)}
                    className="w-full bg-paper border border-rule-strong rounded-[3px] px-3 py-2 text-[14px] text-ink font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-ink-2 mb-1.5">Confirm New PIN</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value)}
                    className="w-full bg-paper border border-rule-strong rounded-[3px] px-3 py-2 text-[14px] text-ink font-mono"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <Button size="sm" variant="primary" type="submit" loading={savingPin}>
                  Update Security PIN
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
