'use client';

import React, { useEffect, useState } from 'react';
import { canAccessAdminRoute, type UserRole } from '@neo/shared';
import { type AdminUserRecord, type SiteRecord } from '../../../../src/lib/admin-data';

const ROLES: UserRole[] = ['OWNER', 'OPS_COORD', 'PROD_MGR', 'STOREKEEPER', 'DRIVER', 'COLLECTOR'];

const PIN_REGEX = /^\d{4,6}$/;

function generateRandomPin(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export default function AdminUsersPage() {
  const [viewerRole, setViewerRole] = useState<UserRole>('OWNER');
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('OPS_COORD');
  const [newSites, setNewSites] = useState<string[]>([]);
  const [newPin, setNewPin] = useState('');
  const [showNewPin, setShowNewPin] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [pinModalUser, setPinModalUser] = useState<AdminUserRecord | null>(null);
  const [resetPinValue, setResetPinValue] = useState('');
  const [confirmPinValue, setConfirmPinValue] = useState('');
  const [showResetPin, setShowResetPin] = useState(false);
  const [revokeOnReset, setRevokeOnReset] = useState(true);
  const [savingPin, setSavingPin] = useState(false);
  const [pinModalError, setPinModalError] = useState<string | null>(null);

  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.user?.role) setViewerRole(d.user.role as UserRole);
      })
      .catch(() => {});

    fetch('/api/proxy/admin/sites')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        const mapped: SiteRecord[] = list.map((s: any) => ({
          id: s.id,
          code: s.code ?? s.site_code ?? '',
          name: s.name ?? 'Site',
          siteType: s.site_type ?? 'DEPOT',
          address: s.address ?? '',
          gstin: s.gstin ?? '',
          active: s.is_active !== false,
          locations: [],
        }));
        setSites(mapped);
        if (mapped.length > 0) setNewSites([mapped[0].id]);
      })
      .catch(() => setSites([]));

    fetch('/api/proxy/admin/users')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        setUsers(
          list.map((u: any) => ({
            id: u.id,
            name: u.full_name ?? u.fullName ?? u.name ?? 'User',
            phone: u.phone ?? '',
            role: (u.role ?? 'OPS_COORD') as UserRole,
            siteIds: u.assigned_site_id ? [u.assigned_site_id] : [],
            language: 'en',
            status: u.is_active === false ? 'DISABLED' : 'ACTIVE',
            lastLogin: u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'Never',
            devicesCount: 0,
            hasPin: u.has_pin !== undefined ? Boolean(u.has_pin) : undefined,
          })),
        );
      })
      .catch(() => setUsers([]));
  }, []);

  if (!canAccessAdminRoute(viewerRole)) {
    return (
      <div className="rounded-[4px] border border-madder/30 bg-madder-soft p-8 text-center space-y-3">
        <h1 className="text-xl font-bold text-madder">Access Denied (403 — Owner Only)</h1>
        <p className="text-sm text-madder">Role {viewerRole} cannot access /admin/* routes.</p>
      </div>
    );
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    const trimmedName = newName.trim();
    const trimmedPhone = newPhone.trim();
    const trimmedPin = newPin.trim();
    if (!trimmedName || !trimmedPhone) {
      setCreateError('Full name and phone number are required.');
      return;
    }
    if (!PIN_REGEX.test(trimmedPin)) {
      setCreateError('Login PIN must be 4 to 6 digits.');
      return;
    }

    setCreating(true);
    try {
      const res = await fetch('/api/proxy/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: trimmedName,
          phone: trimmedPhone,
          role: newRole,
          assignedSiteId: newSites[0] || sites[0]?.id,
          pin: trimmedPin,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          payload?.error?.message ||
          (Array.isArray(payload?.message) ? payload.message.join(', ') : payload?.message) ||
          `Failed to create user (HTTP ${res.status})`;
        setCreateError(String(msg));
        return;
      }

      const created = payload?.data ?? payload;
      setUsers((prev) => [
        {
          id: created?.id ?? `u-${Date.now()}`,
          name: trimmedName,
          phone: trimmedPhone,
          role: newRole,
          siteIds: newSites.length ? newSites : sites.slice(0, 1).map((s) => s.id),
          language: 'en',
          status: 'ACTIVE',
          lastLogin: 'Never',
          devicesCount: 0,
          hasPin: true,
        },
        ...prev,
      ]);
      setShowCreate(false);
      setNewName('');
      setNewPhone('');
      setNewPin('');
      setShowNewPin(false);
      setCreateError(null);
      setToast(
        `Created ${trimmedName} (${newRole}) with initial PIN configured. Share the PIN with the user securely.`,
      );
    } catch {
      setCreateError('Unable to reach server to create user.');
    } finally {
      setCreating(false);
    }
  }

  function openPinModal(user: AdminUserRecord) {
    setPinModalUser(user);
    setResetPinValue('');
    setConfirmPinValue('');
    setShowResetPin(false);
    setRevokeOnReset(true);
    setPinModalError(null);
  }

  async function submitResetPin(e: React.FormEvent) {
    e.preventDefault();
    if (!pinModalUser) return;
    setPinModalError(null);

    const trimmedPin = resetPinValue.trim();
    if (!PIN_REGEX.test(trimmedPin)) {
      setPinModalError('PIN must be 4 to 6 digits.');
      return;
    }
    if (trimmedPin !== confirmPinValue.trim()) {
      setPinModalError('PIN and confirmation do not match.');
      return;
    }

    setSavingPin(true);
    try {
      const res = await fetch(`/api/proxy/admin/users/${pinModalUser.id}/reset-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: trimmedPin }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          payload?.error?.message ||
          (Array.isArray(payload?.message) ? payload.message.join(', ') : payload?.message) ||
          `Failed to reset PIN (HTTP ${res.status})`;
        setPinModalError(String(msg));
        return;
      }

      if (revokeOnReset) {
        await fetch(`/api/proxy/admin/users/${pinModalUser.id}/revoke-sessions`, {
          method: 'POST',
        }).catch(() => {});
      }

      setUsers((prev) =>
        prev.map((u) => (u.id === pinModalUser.id ? { ...u, hasPin: true } : u)),
      );
      const userName = pinModalUser.name;
      setPinModalUser(null);
      setResetPinValue('');
      setConfirmPinValue('');
      setToast(
        `Updated login PIN for ${userName}${revokeOnReset ? ' and revoked active sessions' : ''}. Share the new PIN securely.`,
      );
    } catch {
      setPinModalError('Unable to reach server to reset PIN.');
    } finally {
      setSavingPin(false);
    }
  }

  async function revokeSessionsOnly(user: AdminUserRecord) {
    try {
      const res = await fetch(`/api/proxy/admin/users/${user.id}/revoke-sessions`, {
        method: 'POST',
      });
      if (!res.ok) {
        setToast(`Failed to revoke sessions for ${user.name} (HTTP ${res.status}).`);
        return;
      }
      setToast(`Revoked all active sessions for ${user.name}.`);
    } catch {
      setToast(`Unable to revoke sessions for ${user.name}.`);
    }
  }

  async function toggleStatus(id: string) {
    const target = users.find((u) => u.id === id);
    const nextActive = target?.status !== 'ACTIVE';
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, status: nextActive ? 'ACTIVE' : 'DISABLED' } : u)),
    );
    await fetch(`/api/proxy/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: nextActive }),
    }).catch(() => {});
    setToast('Updated user status & revoked active sessions.');
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Users &amp; Multi-Site Access</h1>
          <p className="text-sm text-ink-3">
            Invite staff, assign multiple sites (OD-007), set/reset login PINs, and revoke registered devices.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreateError(null);
            setShowCreate(true);
          }}
          className="rounded-[3px] bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-action-hover"
        >
          + Invite User
        </button>
      </div>

      {toast && (
        <div className="rounded-[3px] border border-action/30 bg-action-soft px-4 py-2.5 text-sm font-medium text-ink flex items-center justify-between gap-3">
          <span>{toast}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-xs text-ink-3 hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-[3px] border border-rule bg-sheet">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper text-xs uppercase text-ink-3">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Assigned Sites</th>
              <th className="px-4 py-3">Devices / Last Login</th>
              <th className="px-4 py-3">Status &amp; PIN</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3">
                  <div className="font-semibold text-ink">{u.name}</div>
                  <div className="font-mono text-xs text-ink-3">{u.phone} · {u.language.toUpperCase()}</div>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded bg-action-soft px-2 py-0.5 text-xs font-bold text-action">{u.role}</span>
                </td>
                <td className="px-4 py-3 text-xs text-ink-2">
                  {u.siteIds.map((sid) => sites.find((s) => s.id === sid)?.name ?? sid).join(', ') || 'All / Unassigned'}
                </td>
                <td className="px-4 py-3 text-xs text-ink-3">
                  {u.devicesCount} device(s) · {u.lastLogin}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        u.status === 'ACTIVE' ? 'bg-leaf-soft text-leaf' : 'bg-madder-soft text-madder'
                      }`}
                    >
                      {u.status}
                    </span>
                    {u.hasPin === true && (
                      <span className="rounded-full bg-leaf-soft px-2 py-0.5 text-[11px] font-semibold text-leaf">
                        PIN Set
                      </span>
                    )}
                    {u.hasPin === false && (
                      <span className="rounded-full bg-haldi-soft px-2 py-0.5 text-[11px] font-semibold text-haldi">
                        No PIN
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex flex-wrap justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => openPinModal(u)}
                      className="rounded border border-action/30 bg-action-soft px-2.5 py-1 text-xs font-semibold text-action hover:opacity-90"
                    >
                      {u.hasPin === false ? 'Set PIN' : 'Reset PIN'}
                    </button>
                    <button
                      type="button"
                      onClick={() => revokeSessionsOnly(u)}
                      className="rounded border border-rule-strong bg-paper px-2.5 py-1 text-xs font-semibold text-ink hover:bg-sunken"
                    >
                      Revoke Sessions
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleStatus(u.id)}
                      className="rounded border border-madder/30 bg-madder-soft px-2.5 py-1 text-xs font-semibold text-madder"
                    >
                      {u.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <form onSubmit={createUser} className="w-full max-w-md rounded-[4px] border border-rule bg-sheet p-6 shadow-xl space-y-3">
            <h2 className="text-lg font-bold text-ink">Invite Staff User</h2>
            <p className="text-xs text-ink-3">
              PINs are stored securely encrypted and cannot be viewed later—note or copy the PIN before saving.
            </p>
            {createError && (
              <div className="rounded-[3px] border border-madder/30 bg-madder-soft px-3 py-2 text-xs text-madder">
                {createError}
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1">Full Name *</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Full Name"
                className="w-full rounded-[3px] border border-rule-strong bg-paper px-3 py-2 text-sm text-ink"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1">Phone Number *</label>
              <input
                type="text"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="+919876543210"
                className="w-full rounded-[3px] border border-rule-strong bg-paper px-3 py-2 text-sm text-ink font-mono"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1">Role</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as UserRole)}
                className="w-full rounded-[3px] border border-rule-strong bg-paper px-3 py-2 text-sm text-ink"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-ink-2">Initial Login PIN (4–6 digits) *</label>
                <button
                  type="button"
                  onClick={() => {
                    setNewPin(generateRandomPin());
                    setShowNewPin(true);
                  }}
                  className="text-xs font-semibold text-action hover:underline"
                >
                  Generate PIN
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type={showNewPin ? 'text' : 'password'}
                  inputMode="numeric"
                  pattern="\d{4,6}"
                  minLength={4}
                  maxLength={6}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="4–6 digit PIN (e.g. 123456)"
                  className="flex-1 rounded-[3px] border border-rule-strong bg-paper px-3 py-2 text-sm text-ink font-mono"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPin((v) => !v)}
                  className="rounded-[3px] border border-rule-strong bg-paper px-3 py-2 text-xs font-semibold text-ink-2 hover:bg-sunken"
                >
                  {showNewPin ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <div className="space-y-1 text-xs text-ink-2">
              <div className="font-semibold text-ink-3">Assigned Sites (OD-007)</div>
              {sites.map((s) => (
                <label key={s.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newSites.includes(s.id)}
                    onChange={() =>
                      setNewSites((prev) =>
                        prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id],
                      )
                    }
                  />
                  {s.name}
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={creating}
                onClick={() => {
                  setShowCreate(false);
                  setCreateError(null);
                }}
                className="rounded-[3px] border border-rule-strong px-4 py-2 text-sm text-ink-2"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="rounded-[3px] bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-action-hover disabled:opacity-60"
              >
                {creating ? 'Creating...' : 'Create & Set PIN'}
              </button>
            </div>
          </form>
        </div>
      )}

      {pinModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <form onSubmit={submitResetPin} className="w-full max-w-md rounded-[4px] border border-rule bg-sheet p-6 shadow-xl space-y-3">
            <div>
              <h2 className="text-lg font-bold text-ink">
                {pinModalUser.hasPin === false ? 'Set Login PIN' : 'Reset Login PIN'}
              </h2>
              <p className="text-xs text-ink-3 mt-0.5">
                {pinModalUser.name} ({pinModalUser.phone}) · Existing PINs cannot be viewed; setting a new PIN overwrites it.
              </p>
            </div>

            {pinModalError && (
              <div className="rounded-[3px] border border-madder/30 bg-madder-soft px-3 py-2 text-xs text-madder">
                {pinModalError}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-ink-2">New PIN (4–6 digits) *</label>
                <button
                  type="button"
                  onClick={() => {
                    const generated = generateRandomPin();
                    setResetPinValue(generated);
                    setConfirmPinValue(generated);
                    setShowResetPin(true);
                  }}
                  className="text-xs font-semibold text-action hover:underline"
                >
                  Generate PIN
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type={showResetPin ? 'text' : 'password'}
                  inputMode="numeric"
                  pattern="\d{4,6}"
                  minLength={4}
                  maxLength={6}
                  value={resetPinValue}
                  onChange={(e) => setResetPinValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter 4–6 digit PIN"
                  className="flex-1 rounded-[3px] border border-rule-strong bg-paper px-3 py-2 text-sm text-ink font-mono"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowResetPin((v) => !v)}
                  className="rounded-[3px] border border-rule-strong bg-paper px-3 py-2 text-xs font-semibold text-ink-2 hover:bg-sunken"
                >
                  {showResetPin ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1">Confirm New PIN *</label>
              <input
                type={showResetPin ? 'text' : 'password'}
                inputMode="numeric"
                pattern="\d{4,6}"
                minLength={4}
                maxLength={6}
                value={confirmPinValue}
                onChange={(e) => setConfirmPinValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Re-enter PIN"
                className="w-full rounded-[3px] border border-rule-strong bg-paper px-3 py-2 text-sm text-ink font-mono"
                required
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-ink-2 pt-1">
              <input
                type="checkbox"
                checked={revokeOnReset}
                onChange={(e) => setRevokeOnReset(e.target.checked)}
              />
              Also revoke active sessions on all devices
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={savingPin}
                onClick={() => setPinModalUser(null)}
                className="rounded-[3px] border border-rule-strong px-4 py-2 text-sm text-ink-2"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingPin}
                className="rounded-[3px] bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-action-hover disabled:opacity-60"
              >
                {savingPin ? 'Saving...' : 'Save PIN'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

