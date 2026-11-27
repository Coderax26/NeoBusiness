'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ROLE_MATRIX, type AdminUserRecord } from '../../../../src/lib/admin-data';
import { SettingsPageHeader } from '../../../../src/components/settings/SettingsPageHeader';
import {
  getRoleLabel,
  ROLE_DESCRIPTIONS,
  PERMISSION_LABELS,
  MASKED_FIELD_LABELS,
} from '../../../../src/lib/settings-copy';

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
      <SettingsPageHeader
        title="Staff Roles & Permissions"
        subtitle="Understand what each job role can view, approve, or edit — and which sensitive numbers stay hidden."
        whatIsThis="Every staff member is given one of 6 job roles. Roles keep daily work fast and protect sensitive business information (like profit margins, supplier costs, and company settings) by hiding them from floor and field screens."
      />

      {/* Interactive Preview */}
      <div className="rounded-[4px] border border-action/30 bg-action-soft/40 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-ink">Check What a Staff Member Can See</div>
            <p className="text-xs text-ink-3">Pick any team member to preview their screen access.</p>
          </div>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="rounded-[3px] border border-rule-strong bg-sheet px-3 py-1.5 text-sm font-semibold text-ink"
          >
            {users.length === 0 && <option value="">Sample Roles Preview</option>}
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} — {getRoleLabel(u.role)}
              </option>
            ))}
          </select>
        </div>

        <p className="text-sm text-ink">
          {ROLE_DESCRIPTIONS[userRoleSpec.role] || userRoleSpec.summary}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-[3px] border border-leaf/30 bg-sheet p-3.5 space-y-2">
            <div className="text-xs font-bold text-leaf">What They Can Do</div>
            <ul className="space-y-1 text-xs text-ink-2 list-disc list-inside">
              {userRoleSpec.permissions.map((p) => (
                <li key={p}>{PERMISSION_LABELS[p] || p.replace(/[._]/g, ' ')}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-[3px] border border-rule bg-sheet p-3.5 space-y-2">
            <div className="text-xs font-bold text-ink">Hidden for Privacy &amp; Control</div>
            {userRoleSpec.maskedFields.length === 0 ? (
              <p className="text-xs text-ink-3">
                Nothing is hidden — Business Owners have full visibility across the whole company.
              </p>
            ) : (
              <ul className="space-y-1 text-xs text-madder list-disc list-inside">
                {userRoleSpec.maskedFields.map((m) => (
                  <li key={m}>{MASKED_FIELD_LABELS[m] || m}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Role Summary Table */}
      <div className="overflow-hidden rounded-[4px] border border-rule bg-sheet">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper text-xs text-ink-3">
            <tr>
              <th className="px-4 py-3 font-semibold">Job Role</th>
              <th className="px-4 py-3 font-semibold">Responsibilities</th>
              <th className="px-4 py-3 font-semibold">Kept Private / Hidden</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {ROLE_MATRIX.map((r) => (
              <tr key={r.role}>
                <td className="px-4 py-3 font-semibold text-ink whitespace-nowrap">
                  {getRoleLabel(r.role)}
                </td>
                <td className="px-4 py-3 text-ink-2">
                  {ROLE_DESCRIPTIONS[r.role] || r.summary}
                </td>
                <td className="px-4 py-3 text-xs text-ink-2">
                  {r.maskedFields.length
                    ? r.maskedFields.map((m) => MASKED_FIELD_LABELS[m] || m).join(' · ')
                    : 'None (Full visibility)'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
