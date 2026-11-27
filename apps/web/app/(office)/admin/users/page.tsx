'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { canAccessAdminRoute, type UserRole } from '@neo/shared';
import { type AdminUserRecord, type SiteRecord } from '../../../../src/lib/admin-data';
import { SettingsPageHeader } from '../../../../src/components/settings/SettingsPageHeader';
import {
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  getRoleLabel,
} from '../../../../src/lib/settings-copy';

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
  const [newLanguage, setNewLanguage] = useState<'en' | 'mr'>('en');
  const [newPin, setNewPin] = useState('');
  const [showNewPin, setShowNewPin] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit user modal state
  const [editUser, setEditUser] = useState<AdminUserRecord | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('OPS_COORD');
  const [editSites, setEditSites] = useState<string[]>([]);
  const [editLanguage, setEditLanguage] = useState<'en' | 'mr'>('en');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // PIN reset modal state
  const [pinModalUser, setPinModalUser] = useState<AdminUserRecord | null>(null);
  const [resetPinValue, setResetPinValue] = useState('');
  const [confirmPinValue, setConfirmPinValue] = useState('');
  const [showResetPin, setShowResetPin] = useState(false);
  const [revokeOnReset, setRevokeOnReset] = useState(true);
  const [savingPin, setSavingPin] = useState(false);
  const [pinModalError, setPinModalError] = useState<string | null>(null);

  const [toast, setToast] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/admin/users');
      if (!res.ok) return;
      const payload = await res.json();
      const list = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
      setUsers(
        list.map((u: any) => {
          const siteIds: string[] = Array.isArray(u.site_ids)
            ? u.site_ids.map(String)
            : u.assigned_site_id
              ? [String(u.assigned_site_id)]
              : [];
          return {
            id: u.id,
            name: u.full_name ?? u.fullName ?? u.name ?? 'User',
            phone: u.phone ?? '',
            role: (u.role ?? 'OPS_COORD') as UserRole,
            siteIds,
            language: u.preferred_language === 'mr' ? 'mr' : 'en',
            status: u.is_active === false ? 'DISABLED' : 'ACTIVE',
            lastLogin: u.last_login_at
              ? new Date(u.last_login_at).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : 'Never logged in',
            devicesCount: 0,
            hasPin: u.has_pin !== undefined ? Boolean(u.has_pin) : undefined,
          };
        }),
      );
    } catch {
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.user?.role) setViewerRole(d.user.role as UserRole);
      })
      .catch(() => {});

    fetch('/api/proxy/admin/sites?includeInactive=false')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        const mapped: SiteRecord[] = list.map((s: any) => ({
          id: s.id,
          code: s.code ?? s.site_code ?? '',
          name: s.name ?? 'Site',
          siteType: s.site_type ?? 'WAREHOUSE',
          address: s.address ?? '',
          gstin: s.gstin ?? '',
          active: s.is_active !== false,
          locations: [],
        }));
        setSites(mapped);
        if (mapped.length > 0) setNewSites([mapped[0].id]);
      })
      .catch(() => setSites([]));

    void loadUsers();
  }, [loadUsers]);

  if (!canAccessAdminRoute(viewerRole)) {
    return (
      <div className="rounded-[4px] border border-madder/30 bg-madder-soft p-8 text-center space-y-2">
        <h1 className="text-xl font-bold text-madder">Owner Access Required</h1>
        <p className="text-sm text-madder">
          Your role ({getRoleLabel(viewerRole)}) does not have permission to manage staff accounts. Ask your Business Owner for help.
        </p>
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

    const selectedSiteIds = newSites.length > 0 ? newSites : sites.slice(0, 1).map((s) => s.id);
    setCreating(true);
    try {
      const res = await fetch('/api/proxy/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: trimmedName,
          phone: trimmedPhone,
          role: newRole,
          assignedSiteId: selectedSiteIds[0],
          siteIds: selectedSiteIds,
          preferredLanguage: newLanguage,
          pin: trimmedPin,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          payload?.error?.message ||
          (Array.isArray(payload?.message) ? payload.message.join(', ') : payload?.message) ||
          'Could not create staff account.';
        setCreateError(String(msg));
        return;
      }

      await loadUsers();
      setShowCreate(false);
      setNewName('');
      setNewPhone('');
      setNewPin('');
      setShowNewPin(false);
      setCreateError(null);
      setToast(
        `Added ${trimmedName} as ${getRoleLabel(newRole)}. Share their login PIN privately so they can sign in.`,
      );
    } catch {
      setCreateError('Unable to reach server to create account.');
    } finally {
      setCreating(false);
    }
  }

  function openEditModal(user: AdminUserRecord) {
    setEditUser(user);
    setEditName(user.name);
    setEditRole(user.role);
    setEditSites(user.siteIds);
    setEditLanguage(user.language);
    setEditError(null);
  }

  async function submitEditUser(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    setEditError(null);
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setEditError('Full name is required.');
      return;
    }
    if (editSites.length === 0 && sites.length > 0) {
      setEditError('Please assign at least one business site.');
      return;
    }

    setSavingEdit(true);
    try {
      const res = await fetch(`/api/proxy/admin/users/${encodeURIComponent(editUser.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: trimmedName,
          role: editRole,
          assignedSiteId: editSites[0] || undefined,
          siteIds: editSites,
          preferredLanguage: editLanguage,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setEditError(
          String(
            payload?.error?.message ||
              (Array.isArray(payload?.message) ? payload.message.join(', ') : payload?.message) ||
              'Could not save user details.',
          ),
        );
        return;
      }
      await loadUsers();
      setEditUser(null);
      setToast(`Updated ${trimmedName}'s profile and site access.`);
    } catch {
      setEditError('Unable to reach server to save changes.');
    } finally {
      setSavingEdit(false);
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
      setPinModalError('Both PIN fields must match.');
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
          'Could not reset PIN.';
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
        `Updated login PIN for ${userName}${revokeOnReset ? ' and signed them out of old devices' : ''}. Share the new PIN privately.`,
      );
    } catch {
      setPinModalError('Unable to reach server to reset PIN.');
    } finally {
      setSavingPin(false);
    }
  }

  async function signOutAllDevices(user: AdminUserRecord) {
    try {
      const res = await fetch(`/api/proxy/admin/users/${user.id}/revoke-sessions`, {
        method: 'POST',
      });
      if (!res.ok) {
        setToast(`Could not sign out devices for ${user.name}.`);
        return;
      }
      setToast(`Signed ${user.name} out of all phones and browsers.`);
    } catch {
      setToast(`Unable to sign out devices for ${user.name}.`);
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
    setToast(
      nextActive
        ? `Re-enabled ${target?.name}'s account.`
        : `Disabled ${target?.name}'s account and signed them out of all devices.`,
    );
  }

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        title="Staff & Site Access"
        subtitle="Add team members, choose which locations they can work in, and manage their login PINs."
        whatIsThis="Create an account for each person on your team. Assign their job role (which controls what screens they see) and pick which factories, warehouses, or offices they can access. Use 'Sign Out Devices' if a staff phone is lost."
        actions={
          <button
            type="button"
            onClick={() => {
              setCreateError(null);
              setShowCreate(true);
            }}
            className="rounded-[3px] bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-action-hover"
          >
            + Add Staff Member
          </button>
        }
      />

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

      <div className="overflow-x-auto rounded-[4px] border border-rule bg-sheet">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper text-xs text-ink-3">
            <tr>
              <th className="px-4 py-3 font-semibold">Staff Member</th>
              <th className="px-4 py-3 font-semibold">Job Role</th>
              <th className="px-4 py-3 font-semibold">Assigned Locations</th>
              <th className="px-4 py-3 font-semibold">Last Sign-In</th>
              <th className="px-4 py-3 font-semibold">Account Status</th>
              <th className="px-4 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3">
                  <div className="font-semibold text-ink">{u.name}</div>
                  <div className="font-mono text-xs text-ink-3">
                    {u.phone} · {u.language === 'mr' ? 'Marathi' : 'English'}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded bg-action-soft px-2 py-0.5 text-xs font-semibold text-action">
                    {getRoleLabel(u.role)}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-ink-2">
                  {u.siteIds.map((sid) => sites.find((s) => s.id === sid)?.name ?? sid).join(', ') ||
                    (u.role === 'OWNER' ? 'All Locations' : 'Not assigned')}
                </td>
                <td className="px-4 py-3 text-xs text-ink-3">{u.lastLogin}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        u.status === 'ACTIVE'
                          ? 'bg-leaf-soft text-leaf'
                          : 'bg-madder-soft text-madder'
                      }`}
                    >
                      {u.status === 'ACTIVE' ? 'Active' : 'Disabled'}
                    </span>
                    {u.hasPin === true && (
                      <span className="rounded-full bg-leaf-soft px-2 py-0.5 text-[11px] font-semibold text-leaf">
                        PIN Set
                      </span>
                    )}
                    {u.hasPin === false && (
                      <span className="rounded-full bg-haldi-soft px-2 py-0.5 text-[11px] font-semibold text-haldi">
                        Needs PIN
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex flex-wrap justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEditModal(u)}
                      className="rounded border border-rule-strong bg-paper px-2.5 py-1 text-xs font-semibold text-ink hover:bg-sunken"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => openPinModal(u)}
                      className="rounded border border-action/30 bg-action-soft px-2.5 py-1 text-xs font-semibold text-action hover:opacity-90"
                    >
                      {u.hasPin === false ? 'Set PIN' : 'Reset PIN'}
                    </button>
                    <button
                      type="button"
                      onClick={() => signOutAllDevices(u)}
                      title="Force this user to log in again on all phones and computers"
                      className="rounded border border-rule-strong bg-paper px-2.5 py-1 text-xs font-semibold text-ink hover:bg-sunken"
                    >
                      Sign Out Devices
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

      {/* Add Staff Member Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <form
            onSubmit={createUser}
            className="w-full max-w-md rounded-[4px] border border-rule bg-sheet p-6 shadow-xl space-y-3"
          >
            <h2 className="text-lg font-bold text-ink">Add Staff Member</h2>
            <p className="text-xs text-ink-3">
              For security, PINs cannot be viewed after saving—share the PIN with your team member now.
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
                placeholder="e.g. Suresh Patil"
                className="w-full rounded-[3px] border border-rule-strong bg-paper px-3 py-2 text-sm text-ink"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1">Mobile Number *</label>
              <input
                type="text"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="+919876543210"
                className="w-full rounded-[3px] border border-rule-strong bg-paper px-3 py-2 text-sm text-ink font-mono"
                required
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-ink-2 mb-1">Job Role</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                  className="w-full rounded-[3px] border border-rule-strong bg-paper px-3 py-2 text-sm text-ink"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r] || r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-2 mb-1">App Language</label>
                <select
                  value={newLanguage}
                  onChange={(e) => setNewLanguage(e.target.value as 'en' | 'mr')}
                  className="w-full rounded-[3px] border border-rule-strong bg-paper px-3 py-2 text-sm text-ink"
                >
                  <option value="en">English</option>
                  <option value="mr">Marathi (मराठी)</option>
                </select>
              </div>
            </div>
            <p className="text-[11px] text-ink-3">{ROLE_DESCRIPTIONS[newRole]}</p>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-ink-2">
                  Initial Login PIN (4–6 digits) *
                </label>
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
            <div className="space-y-1.5 text-xs text-ink-2">
              <div className="font-semibold text-ink-2">Locations This Person Can Access</div>
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
                {creating ? 'Creating...' : 'Create Account'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Staff Member Modal */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <form
            onSubmit={submitEditUser}
            className="w-full max-w-md rounded-[4px] border border-rule bg-sheet p-6 shadow-xl space-y-3"
          >
            <div>
              <h2 className="text-lg font-bold text-ink">Edit Staff Member</h2>
              <p className="text-xs text-ink-3 mt-0.5">
                {editUser.phone} · Update name, job role, or which sites they can work in.
              </p>
            </div>

            {editError && (
              <div className="rounded-[3px] border border-madder/30 bg-madder-soft px-3 py-2 text-xs text-madder">
                {editError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1">Full Name *</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-[3px] border border-rule-strong bg-paper px-3 py-2 text-sm text-ink"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-ink-2 mb-1">Job Role</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as UserRole)}
                  className="w-full rounded-[3px] border border-rule-strong bg-paper px-3 py-2 text-sm text-ink"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r] || r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-2 mb-1">App Language</label>
                <select
                  value={editLanguage}
                  onChange={(e) => setEditLanguage(e.target.value as 'en' | 'mr')}
                  className="w-full rounded-[3px] border border-rule-strong bg-paper px-3 py-2 text-sm text-ink"
                >
                  <option value="en">English</option>
                  <option value="mr">Marathi (मराठी)</option>
                </select>
              </div>
            </div>
            <p className="text-[11px] text-ink-3">{ROLE_DESCRIPTIONS[editRole]}</p>

            <div className="space-y-1.5 text-xs text-ink-2">
              <div className="font-semibold text-ink-2">Assigned Locations</div>
              <p className="text-[11px] text-ink-3">
                Changing assigned sites signs this person out so new permissions take effect immediately.
              </p>
              {sites.map((s) => (
                <label key={s.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editSites.includes(s.id)}
                    onChange={() =>
                      setEditSites((prev) =>
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
                disabled={savingEdit}
                onClick={() => setEditUser(null)}
                className="rounded-[3px] border border-rule-strong px-4 py-2 text-sm text-ink-2"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingEdit}
                className="rounded-[3px] bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-action-hover disabled:opacity-60"
              >
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reset PIN Modal */}
      {pinModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <form
            onSubmit={submitResetPin}
            className="w-full max-w-md rounded-[4px] border border-rule bg-sheet p-6 shadow-xl space-y-3"
          >
            <div>
              <h2 className="text-lg font-bold text-ink">
                {pinModalUser.hasPin === false ? 'Set Login PIN' : 'Reset Login PIN'}
              </h2>
              <p className="text-xs text-ink-3 mt-0.5">
                {pinModalUser.name} ({pinModalUser.phone}) · Setting a new PIN replaces the old one.
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
              <label className="block text-xs font-semibold text-ink-2 mb-1">
                Confirm New PIN *
              </label>
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
              Sign out from all active phones &amp; computers
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
