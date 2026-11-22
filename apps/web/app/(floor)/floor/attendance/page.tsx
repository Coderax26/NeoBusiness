'use client';

import React, { useEffect, useState } from 'react';
import { type WorkerMasterRecord } from '../../../../src/lib/production-data';
import { useFloorOutbox } from '../../../../src/lib/floor-outbox';

export default function FloorAttendancePage() {
  const { enqueueOrSend } = useFloorOutbox();
  const [workers, setWorkers] = useState<WorkerMasterRecord[]>([]);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/proxy/production/workers')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        setWorkers(
          list.map((w: any) => ({
            id: w.id,
            name: w.fullName ?? w.full_name ?? w.name ?? 'Worker',
            station: w.role ?? w.station ?? 'Floor',
            status: 'OUT',
            lastPunch: '--:--',
            assignedWoNo: w.assignedWoNo,
          })),
        );
      })
      .catch(() => setWorkers([]));
  }, []);

  const handleTap = async (worker: WorkerMasterRecord) => {
    const nextStatus = worker.status === 'IN' ? 'OUT' : 'IN';
    const res = await enqueueOrSend({
      type: 'ATTENDANCE_LOG',
      endpoint: '/api/bff/production/attendance',
      payload: {
        workerId: worker.id,
        action: nextStatus,
        assignedWoNo: worker.assignedWoNo || 'WO-2026-088',
      },
    });
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
    setBanner(`${worker.name} clocked ${nextStatus}. ${res.message}`);
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
        <div className="p-4 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-semibold">
          {banner}
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

