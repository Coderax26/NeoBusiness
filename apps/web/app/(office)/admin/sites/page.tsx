'use client';

import React, { useState } from 'react';
import { INITIAL_SITES, type SiteRecord } from '../../../../src/lib/admin-data';

export default function AdminSitesPage() {
  const [sites, setSites] = useState<SiteRecord[]>(INITIAL_SITES);

  function toggleSite(id: string) {
    setSites((prev) => prev.map((s) => (s.id === id ? { ...s, active: !s.active } : s)));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Sites &amp; Storage Locations</h1>
        <p className="text-sm text-slate-500">
          Manage factory plants, depots, GSTIN per site, and storage bays (Dry, Cold, Dispatch).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {sites.map((s) => (
          <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-purple-700">{s.code}</span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{s.siteType}</span>
                </div>
                <h2 className="mt-1 text-lg font-bold text-slate-900">{s.name}</h2>
                <p className="text-xs text-slate-500">{s.address}</p>
                <p className="mt-0.5 font-mono text-xs text-slate-600">GSTIN: {s.gstin}</p>
              </div>
              <button
                type="button"
                onClick={() => toggleSite(s.id)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  s.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                }`}
              >
                {s.active ? 'Active' : 'Inactive'}
              </button>
            </div>
            <div className="border-t border-slate-100 pt-3">
              <div className="text-xs font-semibold text-slate-600">Locations</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {s.locations.map((loc) => (
                  <span key={loc.name} className="rounded-lg bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-800">
                    {loc.name} ({loc.type})
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

