'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Badge, Button, StatusPill, Dialog } from '@neo/ui';
import { type WorkerMasterRecord } from '../../../../src/lib/production-data';

export default function ProductionAttendancePage() {
  const [workers, setWorkers] = useState<WorkerMasterRecord[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newStation, setNewStation] = useState('Pelletizer Line A');

  useEffect(() => {
    let active = true;
    fetch('/api/proxy/production/workers')
      .then((r) => (r.ok ? r.json() : []))
      .then((res) => {
        if (!active) return;
        const rows = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
        setWorkers(rows);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const togglePunch = (id: string) => {
    setWorkers((prev) =>
      prev.map((w) =>
        w.id === id
          ? {
              ...w,
              status: w.status === 'IN' ? 'OUT' : 'IN',
              lastPunch: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            }
          : w,
      ),
    );
  };

  const handleAddWorker = () => {
    if (!newName.trim()) return;
    const created: WorkerMasterRecord = {
      id: `wrk-${Date.now()}`,
      code: `WRK-0${workers.length + 1}`,
      name: newName,
      station: newStation,
      shift: 'SHIFT_1',
      status: 'IN',
      lastPunch: 'Just now',
      hoursToday: 0,
      monthlyHours: 0,
    };
    setWorkers((prev) => [...prev, created]);
    setNewName('');
    setAddOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-zinc-400 mb-1">
            <Link href="/production" className="hover:text-white">Production</Link>
            <span>/</span>
            <span className="text-orange-400">Attendance &amp; Labour</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Factory Attendance &amp; Worker Master</h1>
          <p className="text-sm text-zinc-400">
            Daily In/Out register, assigned Work Orders, and monthly hours summary (G-M4-2).
          </p>
        </div>
        <Button variant="primary" onClick={() => setAddOpen(true)}>
          + Add Worker
        </Button>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-950/80 border-b border-zinc-800 text-xs uppercase text-zinc-400">
            <tr>
              <th className="p-3">Worker</th>
              <th className="p-3">Station &amp; Shift</th>
              <th className="p-3">Assigned WO</th>
              <th className="p-3 text-right">Today / Monthly Hrs</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Punch</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/70">
            {workers.map((w) => (
              <tr key={w.id} className="hover:bg-zinc-800/40">
                <td className="p-3">
                  <div className="text-white font-medium">{w.name}</div>
                  <div className="text-[11px] font-mono text-zinc-500">{w.code}</div>
                </td>
                <td className="p-3 text-xs text-zinc-300">
                  <div>{w.station}</div>
                  <Badge variant="default">{w.shift}</Badge>
                </td>
                <td className="p-3 font-mono text-xs text-orange-400">
                  {w.assignedWoNo || 'Unassigned'}
                </td>
                <td className="p-3 text-right font-mono text-xs text-zinc-200">
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
                    onClick={() => togglePunch(w.id)}
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

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title="Add Factory Worker">
        <div className="space-y-4">
          <input
            type="text"
            placeholder="Worker full name..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-sm text-white"
          />
          <input
            type="text"
            placeholder="Station"
            value={newStation}
            onChange={(e) => setNewStation(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-sm text-white"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleAddWorker}>Save Worker</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

