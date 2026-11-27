'use client';

import React, { useEffect, useState } from 'react';
import { type WorkerMasterRecord } from '../../../../src/lib/production-data';
import { useFloorOutbox } from '../../../../src/lib/floor-outbox';

export default function FloorAttendancePage() {
  const { enqueueOrSend } = useFloorOutbox();
  const [workers, setWorkers] = useState<WorkerMasterRecord[]>([]);
  const [banner, setBanner] = useState<{ text: string; isError?: boolean } | null>(null);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    Promise.all([
      fetch('/api/proxy/production/workers').then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/proxy/production/attendance?date=${today}`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([res, attRes]) => {
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        const attRows = Array.isArray(attRes?.data)
          ? attRes.data
          : Array.isArray(attRes)
            ? attRes
            : [];
        const attByWorker = new Map<string, any>();
        for (const a of attRows) {
          const wId = String(a.worker_id ?? a.workerId ?? '');
          if (wId && !attByWorker.has(wId)) attByWorker.set(wId, a);
        }
        setWorkers(
          list.map((w: any) => {
            const log = attByWorker.get(String(w.id));
            const derivedStatus =
              log != null ? (Number(log.hours_worked ?? log.hoursWorked ?? 0) > 0 ? 'OUT' : 'IN') : w.status === 'IN' ? 'IN' : 'OUT';
            return {
              id: w.id,
              code: w.code ?? 'WRK',
              name: w.fullName ?? w.full_name ?? w.name ?? 'Worker',
              station: w.station ?? w.role ?? 'Floor',
              shift: w.shift ?? 'SHIFT_1',
              status: derivedStatus as 'IN' | 'OUT',
              lastPunch: w.lastPunch ?? '--:--',
              hoursToday: Number(log?.hours_worked ?? w.hoursToday ?? 0),
              monthlyHours: Number(w.monthlyHours ?? 0),
              assignedWoNo: w.assignedWoNo,
            };
          }),
        );
      })
      .catch(() => setWorkers([]));
  }, []);

  const handleTap = async (worker: WorkerMasterRecord) => {
    const nextStatus = worker.status === 'IN' ? 'OUT' : 'IN';
    const res = await enqueueOrSend({
      type: 'ATTENDANCE_LOG',
      endpoint: '/api/proxy/production/attendance',
      payload: {
        workerId: worker.id,
        date: new Date().toISOString().slice(0, 10),
        shift: 'MORNING',
        hoursWorked: nextStatus === 'OUT' ? 8 : 0,
        overtimeHours: 0,
      },
    });
    if (!res.ok && !res.queued) {
      setBanner({ text: `Attendance failed for ${worker.name}: ${res.message}`, isError: true });
      return;
    }
    setWorkers((prev) =>
      prev.map((w) =>
        w.id === worker.id
          ? {
              ...w,
              status: nextStatus,
              lastPunch: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            }
          : w,
      ),
    );
    setBanner({ text: `${worker.name} clocked ${nextStatus}. ${res.message}` });
  };

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <h1 className="text-2xl font-bold text-white">Shift Worker Attendance</h1>
        <p className="text-base text-zinc-400">
          Tap any worker tile to punch In / Out and assign to active batches.
        </p>
      </div>

      {banner && (
        <div
          className={`p-4 rounded-xl border font-semibold ${
            banner.isError
              ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
              : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
          }`}
        >
          {banner.text}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {workers.map((w) => (
          <button
            key={w.id}
            type="button"
            onClick={() => handleTap(w)}
            className={`min-h-[96px] p-5 rounded-2xl border text-left flex items-center justify-between gap-4 ${
              w.status === 'IN'
                ? 'bg-emerald-950/25 border-emerald-500/50'
                : 'bg-zinc-900 border-zinc-800'
            }`}
          >
            <div>
              <div className="text-xl font-bold text-white">{w.name}</div>
              <div className="text-sm text-zinc-400">
                {w.station} · {w.assignedWoNo || 'General'}
              </div>
            </div>
            <div
              className={`min-h-[48px] px-4 rounded-xl flex items-center font-black text-base ${
                w.status === 'IN'
                  ? 'bg-emerald-500 text-zinc-950'
                  : 'bg-zinc-800 text-zinc-300'
              }`}
            >
              {w.status} · {w.lastPunch}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

