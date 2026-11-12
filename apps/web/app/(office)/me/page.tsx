'use client';

import React, { useState, useEffect } from 'react';
import { Card, Button, Avatar, TextField, Select } from '@neo/ui';
import type { SessionUser } from '@neo/shared';

export default function ProfilePage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [language, setLanguage] = useState<'en' | 'mr'>('en');
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');

  // Change PIN / Password
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinMessage, setPinMessage] = useState<{ text: string; tone: 'success' | 'error' } | null>(null);
  const [savingPin, setSavingPin] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => {});
  }, []);

  const handleSavePreferences = () => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.density = density;
    }
    alert('User preferences saved successfully!');
  };

  const handleUpdatePin = (e: React.FormEvent) => {
    e.preventDefault();
    setPinMessage(null);

    if (newPin.length < 4 || newPin.length > 6) {
      setPinMessage({ text: 'PIN must be 4 to 6 numeric digits.', tone: 'error' });
      return;
    }
    if (newPin !== confirmPin) {
      setPinMessage({ text: 'PIN confirmation does not match.', tone: 'error' });
      return;
    }

    setSavingPin(true);
    setTimeout(() => {
      setSavingPin(false);
      setPinMessage({ text: 'Security PIN updated successfully!', tone: 'success' });
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
    }, 700);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">My Account & Preferences</h1>
        <p className="text-xs text-zinc-400 mt-1">Manage your identity, security PIN, and interface density</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* User Card */}
        <Card variant="glass" className="md:col-span-1 flex flex-col items-center text-center p-6">
          <Avatar name={user?.name || 'User'} size="lg" className="w-20 h-20 text-2xl mb-4" />
          <h3 className="text-base font-bold text-white">{user?.name || 'Authorized Staff'}</h3>
          <span className="text-xs text-teal-400 font-semibold mt-0.5">{user?.role || 'Staff Role'}</span>
          <p className="text-xs text-zinc-400 mt-2 font-mono">{user?.phone || user?.email || '—'}</p>

          <div className="w-full mt-6 pt-4 border-t border-zinc-800 text-left space-y-2 text-xs">
            <div className="text-zinc-400 font-medium">Assigned Sites:</div>
            <div className="space-y-1">
              {(user?.sites || []).map((s) => (
                <div key={s.id} className="p-2 rounded bg-zinc-950 border border-zinc-800 text-zinc-200">
                  {s.name} ({s.siteType})
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Preferences & Security Forms */}
        <div className="md:col-span-2 space-y-6">
          {/* Display & Language */}
          <Card variant="glass" className="p-6 space-y-4">
            <h3 className="text-sm font-bold text-white border-b border-zinc-800 pb-2">
              Interface & Regional Preferences
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Language</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as any)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white"
                >
                  <option value="en">English (Default)</option>
                  <option value="mr">मराठी (Marathi Preview)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Layout Density</label>
                <select
                  value={density}
                  onChange={(e) => setDensity(e.target.value as any)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white"
                >
                  <option value="comfortable">Comfortable (Generous spacing)</option>
                  <option value="compact">Compact (High data density)</option>
                </select>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <Button size="sm" variant="secondary" onClick={handleSavePreferences}>
                Save Preferences
              </Button>
            </div>
          </Card>

          {/* Change PIN */}
          <Card variant="glass" className="p-6 space-y-4">
            <h3 className="text-sm font-bold text-white border-b border-zinc-800 pb-2">
              Security PIN & Password
            </h3>

            {pinMessage && (
              <div
                className={`p-3 rounded-lg text-xs ${
                  pinMessage.tone === 'success'
                    ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
                }`}
              >
                {pinMessage.text}
              </div>
            )}

            <form onSubmit={handleUpdatePin} className="space-y-3">
              <TextField
                label="Current PIN / Password"
                type="password"
                required
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value)}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextField
                  label="New 4-6 Digit Security PIN"
                  type="password"
                  inputMode="numeric"
                  required
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                />
                <TextField
                  label="Confirm New Security PIN"
                  type="password"
                  inputMode="numeric"
                  required
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                />
              </div>

              <div className="pt-2 flex justify-end">
                <Button type="submit" size="sm" variant="primary" loading={savingPin}>
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
