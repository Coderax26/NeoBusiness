'use client';

import React, { useMemo, useState } from 'react';
import { INITIAL_ADMIN_USERS, ROLE_MATRIX } from '../../../../src/lib/admin-data';

export default function AdminRolesPage() {
  const [selectedUserId, setSelectedUserId] = useState(INITIAL_ADMIN_USERS[2].id);

  const selectedUser = useMemo(
    () => INITIAL_ADMIN_USERS.find((u) => u.id === selectedUserId) ?? INITIAL_ADMIN_USERS[0],
    [selectedUserId],
  );

  const userRoleSpec = useMemo(
    () => ROLE_MATRIX.find((r) => r.role === selectedUser.role) ?? ROLE_MATRIX[0],
    [selectedUser],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Roles &amp; Access Matrix</h1>
        <p className="text-sm text-slate-500">
          Seeded 6-role RBAC permissions with plain descriptions and a &ldquo;What can this person see?&rdquo; preview.
        </p>
      </div>

      {/* View As Preview */}
      <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-bold text-purple-900">What can this person see?</div>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="rounded-lg border border-purple-200 bg-white px-3 py-1.5 text-sm font-semibold"
          >
            {INITIAL_ADMIN_USERS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.role})
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-slate-700">{userRoleSpec.summary}</p>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="font-semibold text-emerald-700">Allowed:</span>
          {userRoleSpec.permissions.map((p) => (
            <span key={p} className="rounded bg-emerald-100 px-2 py-0.5 font-mono text-emerald-800">{p}</span>
          ))}
        </div>
        {userRoleSpec.maskedFields.length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="font-semibold text-rose-700">Masked / Hidden:</span>
            {userRoleSpec.maskedFields.map((m) => (
              <span key={m} className="rounded bg-rose-100 px-2 py-0.5 font-mono text-rose-800">{m}</span>
            ))}
          </div>
        )}
      </div>

      {/* Matrix Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Plain Description</th>
              <th className="px-4 py-3">Masked Fields</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ROLE_MATRIX.map((r) => (
              <tr key={r.role}>
                <td className="px-4 py-3 font-mono font-bold text-purple-800">{r.role}</td>
                <td className="px-4 py-3 text-slate-700">{r.summary}</td>
                <td className="px-4 py-3 font-mono text-xs text-rose-700">
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

