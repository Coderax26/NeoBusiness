'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ROLE_MATRIX, type AdminUserRecord } from '../../../../src/lib/admin-data';

export default function AdminRolesPage() {
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');

  useEffect(() => {
    fetch('/api/proxy/admin/users')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        const mapped: AdminUserRecord[] = list.map((u: any) => ({
          id: u.id,
          name: u.full_name ?? u.fullName ?? u.name ?? 'User',
          phone: u.phone ?? '',
          role: u.role ?? 'OPS_COORD',
          siteIds: u.assigned_site_id ? [u.assigned_site_id] : [],
          language: 'en',
          status: u.is_active === false ? 'DISABLED' : 'ACTIVE',
          lastLogin: u.last_login_at ?? '-',
          devicesCount: 0,
        }));
        setUsers(mapped);
        if (mapped.length > 0) setSelectedUserId(mapped[0].id);
      })
      .catch(() => setUsers([]));
  }, []);

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) ?? users[0],
    [users, selectedUserId],
  );

  const userRoleSpec = useMemo(
    () => ROLE_MATRIX.find((r) => r.role === selectedUser?.role) ?? ROLE_MATRIX[0],
    [selectedUser],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Roles &amp; Access Matrix</h1>
        <p className="text-sm text-ink-3">
          Seeded 6-role RBAC permissions with plain descriptions and a &ldquo;What can this person see?&rdquo; preview.
        </p>
      </div>

      {/* View As Preview */}
      <div className="rounded-[3px] border border-purple-500/30 bg-purple-950/20 p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-bold text-purple-200">What can this person see?</div>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="rounded-lg border border-rule-strong bg-paper px-3 py-1.5 text-sm font-semibold text-ink"
          >
            {users.length === 0 && <option value="">No users loaded</option>}
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.role})
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-ink-2">{userRoleSpec.summary}</p>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="font-semibold text-leaf">Allowed:</span>
          {userRoleSpec.permissions.map((p) => (
            <span key={p} className="rounded bg-leaf-soft px-2 py-0.5 font-mono text-leaf">{p}</span>
          ))}
        </div>
        {userRoleSpec.maskedFields.length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="font-semibold text-madder">Masked / Hidden:</span>
            {userRoleSpec.maskedFields.map((m) => (
              <span key={m} className="rounded bg-madder-soft px-2 py-0.5 font-mono text-madder">{m}</span>
            ))}
          </div>
        )}
      </div>

      {/* Matrix Table */}
      <div className="overflow-hidden rounded-[3px] border border-rule bg-sheet">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper text-xs uppercase text-ink-3">
            <tr>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Plain Description</th>
              <th className="px-4 py-3">Masked Fields</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {ROLE_MATRIX.map((r) => (
              <tr key={r.role}>
                <td className="px-4 py-3 font-mono font-bold text-purple-300">{r.role}</td>
                <td className="px-4 py-3 text-ink-2">{r.summary}</td>
                <td className="px-4 py-3 font-mono text-xs text-madder">
                  {r.maskedFields.length ? r.maskedFields.join(', ') : 'None (Full Visibility)'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

