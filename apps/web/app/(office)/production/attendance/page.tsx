'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Badge, Button, StatusPill, Dialog } from '@neo/ui';
import { type WorkerMasterRecord } from '../../../../src/lib/production-data';

export default function ProductionAttendancePage() {
  const [workers, setWorkers] = useState<WorkerMasterRecord[]>([]);
  const [workOrders, setWorkOrders] = useState<Array<{ id: string; woNo: string }>>([]);
  const [activeSiteId, setActiveSiteId] = useState('');
  const [logOpen, setLogOpen] = useState(false);
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const [selectedWoId, setSelectedWoId] = useState('');
  const [shift, setShift] = useState<'MORNING' | 'AFTERNOON' | 'NIGHT' | 'GENERAL'>('MORNING');
  const [hoursWorked, setHoursWorked] = useState('8');
  const [overtimeHours, setOvertimeHours] = useState('0');
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadWorkersAndWos = useCallback(async (siteIdFilter: string) => {
    const siteQuery = siteIdFilter ? `?siteId=${encodeURIComponent(siteIdFilter)}` : '';
    const [wrkRes, woRes] = await Promise.all([
      fetch(`/api/proxy/production/workers${siteQuery}`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/proxy/production/work-orders${siteQuery}`).then((r) => (r.ok ? r.json() : [])),
    ]);
    const rows = Array.isArray(wrkRes) ? wrkRes : Array.isArray(wrkRes?.data) ? wrkRes.data : [];
    setWorkers(rows);
    if (rows.length > 0 && !selectedWorkerId) {
      setSelectedWorkerId(String(rows[0].id));
    }
    const woRows = Array.isArray(woRes) ? woRes : Array.isArray(woRes?.data) ? woRes.data : [];
    setWorkOrders(woRows.map((w: any) => ({ id: String(w.id), woNo: String(w.woNo ?? w.woNumber ?? '') })));
  }, [selectedWorkerId]);

  useEffect(() => {
    const storedSite =
      typeof window !== 'undefined' ? localStorage.getItem('neobus_active_site_id') ?? '' : '';
    const effectiveSite = storedSite && storedSite !== 'all' ? storedSite : '';
    setActiveSiteId(effectiveSite);
    loadWorkersAndWos(effectiveSite).catch(() => {});
  }, [loadWorkersAndWos]);

  const togglePunch = async (worker: WorkerMasterRecord) => {
    const clockingOut = worker.status === 'IN';
    try {
      setBusy(true);
      const res = await fetch('/api/proxy/production/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: activeSiteId || undefined,
          workerId: worker.id,
          date: new Date().toISOString().slice(0, 10),
          shift: 'MORNING',
          hoursWorked: clockingOut ? 8 : 0,
          overtimeHours: 0,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || `HTTP ${res.status}`);
      }
      await loadWorkersAndWos(activeSiteId);
      setToast(`${worker.name} ${clockingOut ? 'clocked out (8h logged)' : 'clocked in'}.`);
    } catch (err) {
      setToast(`Failed to record attendance: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleLogAttendance = async () => {
    if (!selectedWorkerId) return;
    try {
      setBusy(true);
      const res = await fetch('/api/proxy/production/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: activeSiteId || undefined,
          workerId: selectedWorkerId,
          workOrderId: selectedWoId || undefined,
          date: new Date().toISOString().slice(0, 10),
          shift,
          hoursWorked: Number(hoursWorked || 0),
          overtimeHours: Number(overtimeHours || 0),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || `HTTP ${res.status}`);
      }
      await loadWorkersAndWos(activeSiteId);
      setLogOpen(false);
      setToast('Logged shift attendance.');
    } catch (err) {
      setToast(`Failed to log attendance: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-ink-3 mb-1">
            <Link href="/production" className="hover:text-ink">Production</Link>
            <span>/</span>
            <span className="text-orange-400">Attendance &amp; Labour</span>
          </div>
          <h1 className="text-2xl font-bold text-ink">Factory Attendance &amp; Worker Master</h1>
          <p className="text-sm text-ink-3">
            Daily In/Out register, assigned Work Orders, and monthly hours summary (G-M4-2).
          </p>
        </div>
        <Button variant="primary" onClick={() => setLogOpen(true)}>
          + Log Shift Attendance
        </Button>
      </div>

      {toast && (
        <div className="p-3 rounded-lg bg-leaf-soft border border-leaf/30 text-leaf text-sm">
          {toast}
        </div>
      )}

      <div className="bg-sheet border border-rule rounded-[3px] overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper border-b border-rule text-xs uppercase text-ink-3">
            <tr>
              <th className="p-3">Worker</th>
              <th className="p-3">Station &amp; Shift</th>
              <th className="p-3">Assigned WO</th>
              <th className="p-3 text-right">Today / Monthly Hrs</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Punch</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {workers.map((w) => (
              <tr key={w.id} className="hover:bg-sunken">
                <td className="p-3">
                  <div className="text-ink font-medium">{w.name}</div>
                  <div className="text-[11px] font-mono text-ink-3">{w.code}</div>
                </td>
                <td className="p-3 text-xs text-ink-2">
                  <div>{w.station}</div>
                  <Badge variant="default">{w.shift}</Badge>
                </td>
                <td className="p-3 font-mono text-xs text-orange-400">
                  {w.assignedWoNo || 'Unassigned'}
                </td>
                <td className="p-3 text-right font-mono text-xs text-ink">
                  {w.hoursToday}h / {w.monthlyHours}h
                </td>
                <td className="p-3">
                  <StatusPill
                    status={`${w.status} (${w.lastPunch})`}
                    tone={w.status === 'IN' ? 'emerald' : 'slate'}
                  />
                </td>
                <td className="p-3 text-right">
                  <button
                    disabled={busy}
                    onClick={() => togglePunch(w)}
                    className="text-xs text-orange-400 hover:text-orange-300 font-medium"
                  >
                    {w.status === 'IN' ? 'Clock Out' : 'Clock In'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={logOpen} onClose={() => setLogOpen(false)} title="Log Shift Attendance">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-ink-3 mb-1">Worker</label>
            <select
              value={selectedWorkerId}
              onChange={(e) => setSelectedWorkerId(e.target.value)}
              className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
            >
              {workers.map((w) => (
                <option key={w.id} value={w.id}>{w.name} ({w.station})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-3 mb-1">Shift</label>
              <select
                value={shift}
                onChange={(e) => setShift(e.target.value as any)}
                className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
              >
                <option value="MORNING">MORNING</option>
                <option value="AFTERNOON">AFTERNOON</option>
                <option value="NIGHT">NIGHT</option>
                <option value="GENERAL">GENERAL</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-ink-3 mb-1">Work Order (Optional)</label>
              <select
                value={selectedWoId}
                onChange={(e) => setSelectedWoId(e.target.value)}
                className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
              >
                <option value="">General Floor</option>
                {workOrders.map((wo) => (
                  <option key={wo.id} value={wo.id}>{wo.woNo}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-3 mb-1">Hours Worked</label>
              <input
                type="number"
                value={hoursWorked}
                onChange={(e) => setHoursWorked(e.target.value)}
                className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-3 mb-1">Overtime Hours</label>
              <input
                type="number"
                value={overtimeHours}
                onChange={(e) => setOvertimeHours(e.target.value)}
                className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setLogOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={busy} onClick={handleLogAttendance}>Save Attendance</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
