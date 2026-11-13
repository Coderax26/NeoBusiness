'use client';

import React, { useState } from 'react';
import { canAccessAdminRoute, type UserRole } from '@neo/shared';
import { INITIAL_ADMIN_USERS, INITIAL_SITES, type AdminUserRecord } from '../../../../src/lib/admin-data';

const ROLES: UserRole[] = ['OWNER', 'OPS_COORD', 'PROD_MGR', 'STOREKEEPER', 'DRIVER', 'COLLECTOR'];

export default function AdminUsersPage() {
  const [viewerRole, setViewerRole] = useState<UserRole>('OWNER');
  const [users, setUsers] = useState<AdminUserRecord[]>(INITIAL_ADMIN_USERS);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('OPS_COORD');
  const [newSites, setNewSites] = useState<string[]>(['site-baramati', 'site-pune']);
  const [toast, setToast] = useState<string | null>(null);

  if (!canAccessAdminRoute(viewerRole)) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center space-y-3">
        <h1 className="text-xl font-bold text-rose-900">Access Denied (403 — Owner Only)</h1>
        <p className="text-sm text-rose-800">Role {viewerRole} cannot access /admin/* routes.</p>
        <button type="button" onClick={() => setViewerRole('OWNER')} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white">
          Switch to OWNER
        </button>
      </div>
    );
  }

  function createUser(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim()) return;
    setUsers((prev) => [
      {
        id: `u-${Date.now()}`,
        name: newName,
        phone: newPhone,
        role: newRole,
        siteIds: newSites.length ? newSites : ['site-baramati'],
        language: 'en',
        status: 'ACTIVE',
        lastLogin: 'Invited (PIN sent via SMS)',
        devicesCount: 0,
      },
      ...prev,
    ]);
    setShowCreate(false);
    setNewName('');
    setNewPhone('');
    setToast(`Invited ${newName} (${newRole}) with ${newSites.length} site(s). Temporary PIN SMS sent.`);
  }

  function toggleStatus(id: string) {
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, status: u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' } : u)),
    );
    setToast('Updated user status & revoked active sessions.');
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Users &amp; Multi-Site Access</h1>
          <p className="text-sm text-slate-500">
            Invite staff, assign multiple sites (OD-007), reset PINs, and revoke registered devices.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700"
        >
          + Invite User
        </button>
      </div>

      {toast && (
        <div className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-2.5 text-sm font-medium text-purple-900">
          {toast}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Assigned Sites</th>
              <th className="px-4 py-3">Devices / Last Login</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3">
                  <div className="font-semibold text-slate-900">{u.name}</div>
                  <div className="font-mono text-xs text-slate-500">{u.phone} · {u.language.toUpperCase()}</div>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded bg-purple-50 px-2 py-0.5 text-xs font-bold text-purple-800">{u.role}</span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-700">
                  {u.siteIds.map((sid) => INITIAL_SITES.find((s) => s.id === sid)?.name ?? sid).join(', ')}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {u.devicesCount} device(s) · {u.lastLogin}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      u.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    {u.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setToast(`Sent PIN reset SMS to ${u.name}.`)}
                      className="rounded border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700"
                    >
                      Reset PIN
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleStatus(u.id)}
                      className="rounded border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form onSubmit={createUser} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-3">
            <h2 className="text-lg font-bold text-slate-900">Invite Staff User</h2>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Full Name"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              required
            />
            <input
              type="text"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="+91 98..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              required
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as UserRole)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <div className="space-y-1 text-xs">
              <div className="font-semibold text-slate-600">Assigned Sites (OD-007)</div>
              {INITIAL_SITES.map((s) => (
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
              <button type="button" onClick={() => setShowCreate(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">
                Cancel
              </button>
              <button type="submit" className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white">
                Create &amp; Send PIN
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

