'use client';

import React, { useEffect, useState } from 'react';
import { type SiteRecord } from '../../../../src/lib/admin-data';

export default function AdminSitesPage() {
  const [sites, setSites] = useState<SiteRecord[]>([]);

  useEffect(() => {
    fetch('/api/proxy/admin/sites')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        setSites(
          list.map((s: any) => ({
            id: s.id,
            code: s.code ?? s.site_code ?? s.id.slice(0, 6),
            name: s.name ?? 'Site',
            siteType: s.site_type ?? s.type ?? 'DEPOT',
            address: s.address ?? '',
            gstin: s.gstin ?? '-',
            active: s.is_active !== false,
            locations: Array.isArray(s.locations) ? s.locations : [],
          })),
        );
      })
      .catch(() => setSites([]));
  }, []);

  async function toggleSite(id: string) {
    const target = sites.find((s) => s.id === id);
    const nextActive = !(target?.active ?? true);
    setSites((prev) => prev.map((s) => (s.id === id ? { ...s, active: nextActive } : s)));
    await fetch(`/api/proxy/admin/sites/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: nextActive }),
    }).catch(() => {});
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Sites &amp; Storage Locations</h1>
        <p className="text-sm text-ink-3">
          Manage factory plants, depots, GSTIN per site, and storage bays (Dry, Cold, Dispatch).
        </p>
      </div>

      {sites.length === 0 && (
        <div className="rounded-[3px] border border-rule bg-sheet p-6 text-sm text-ink-3">
          No sites found.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {sites.map((s) => (
          <div key={s.id} className="rounded-[3px] border border-rule bg-sheet p-5 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-purple-300">{s.code}</span>
                  <span className="rounded bg-sunken px-2 py-0.5 text-xs font-semibold text-ink-2">{s.siteType}</span>
                </div>
                <h2 className="mt-1 text-lg font-bold text-ink">{s.name}</h2>
                <p className="text-xs text-ink-3">{s.address}</p>
                <p className="mt-0.5 font-mono text-xs text-ink-3">GSTIN: {s.gstin}</p>
              </div>
              <button
                type="button"
                onClick={() => toggleSite(s.id)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  s.active ? 'bg-leaf-soft text-leaf' : 'bg-sunken text-ink-3'
                }`}
              >
                {s.active ? 'Active' : 'Inactive'}
              </button>
            </div>
            <div className="border-t border-rule pt-3">
              <div className="text-xs font-semibold text-ink-3">Locations</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {s.locations.length === 0 && (
                  <span className="text-xs text-ink-3">Default warehouse bay</span>
                )}
                {s.locations.map((loc) => (
                  <span key={loc.name} className="rounded-lg bg-paper border border-rule px-3 py-1.5 text-xs font-medium text-ink">
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

