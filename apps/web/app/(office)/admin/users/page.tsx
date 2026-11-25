'use client';

import React, { useEffect, useState } from 'react';
import { canAccessAdminRoute, type UserRole } from '@neo/shared';
import { type AdminUserRecord, type SiteRecord } from '../../../../src/lib/admin-data';

const ROLES: UserRole[] = ['OWNER', 'OPS_COORD', 'PROD_MGR', 'STOREKEEPER', 'DRIVER', 'COLLECTOR'];

export default function AdminUsersPage() {
  const [viewerRole, setViewerRole] = useState<UserRole>('OWNER');
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('OPS_COORD');
  const [newSites, setNewSites] = useState<string[]>([]);
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
    if (!newName.trim() || !newPhone.trim()) return;
    const res = await fetch('/api/proxy/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: newName.trim(),
        phone: newPhone.trim(),
        role: newRole,
        assignedSiteId: newSites[0] || sites[0]?.id,
      }),
    });
    const created = res.ok ? await res.json() : null;
    setUsers((prev) => [
      {
        id: created?.id ?? `u-${Date.now()}`,
        name: newName,
        phone: newPhone,
        role: newRole,
        siteIds: newSites.length ? newSites : sites.slice(0, 1).map((s) => s.id),
        language: 'en',
        status: 'ACTIVE',
        lastLogin: 'Invited',
        devicesCount: 0,
      },
      ...prev,
    ]);
    setShowCreate(false);
    setNewName('');
    setNewPhone('');
    setToast(`Invited ${newName} (${newRole}) with ${newSites.length} site(s).`);
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
            Invite staff, assign multiple sites (OD-007), reset PINs, and revoke registered devices.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-ink hover:bg-purple-500"
        >
          + Invite User
        </button>
      </div>

      {toast && (
        <div className="rounded-[3px] border border-purple-500/40 bg-purple-950/30 px-4 py-2.5 text-sm font-medium text-purple-200">
          {toast}
        </div>
      )}

      <div className="overflow-hidden rounded-[3px] border border-rule bg-sheet">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper text-xs uppercase text-ink-3">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Assigned Sites</th>
              <th className="px-4 py-3">Devices / Last Login</th>
              <th className="px-4 py-3">Status</th>
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
                  <span className="rounded bg-purple-500/20 px-2 py-0.5 text-xs font-bold text-purple-300">{u.role}</span>
                </td>
                <td className="px-4 py-3 text-xs text-ink-2">
                  {u.siteIds.map((sid) => sites.find((s) => s.id === sid)?.name ?? sid).join(', ') || 'All / Unassigned'}
                </td>
                <td className="px-4 py-3 text-xs text-ink-3">
                  {u.devicesCount} device(s) · {u.lastLogin}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold${
                      u.status === 'ACTIVE' ? 'bg-leaf-soft text-leaf' : 'bg-madder-soft text-madder'
                    }`}
                  >
                    {u.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        fetch(`/api/proxy/admin/users/${u.id}/revoke-sessions`, { method: 'POST' }).catch(() => {});
                        setToast(`Revoked sessions & triggered PIN reset for ${u.name}.`);
                      }}
                      className="rounded border border-rule-strong bg-paper px-2.5 py-1 text-xs font-semibold text-ink hover:bg-sunken"
                    >
                      Revoke / PIN
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
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Full Name"
              className="w-full rounded-lg border border-rule-strong bg-paper px-3 py-2 text-sm text-ink"
              required
            />
            <input
              type="text"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="+91 98..."
              className="w-full rounded-lg border border-rule-strong bg-paper px-3 py-2 text-sm text-ink"
              required
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as UserRole)}
              className="w-full rounded-lg border border-rule-strong bg-paper px-3 py-2 text-sm text-ink"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
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
              <button type="button" onClick={() => setShowCreate(false)} className="rounded-lg border border-rule-strong px-4 py-2 text-sm text-ink-2">
                Cancel
              </button>
              <button type="submit" className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-ink">
                Create &amp; Send PIN
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

