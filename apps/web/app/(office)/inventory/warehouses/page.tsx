'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Button, Card, Dialog, Badge } from '@neo/ui';

interface WarehouseRow {
  id: string;
  siteId: string;
  siteName: string;
  name: string;
  locationType: string;
  isActive: boolean;
}

interface BinRow {
  id: string;
  warehouseId: string;
  code: string;
  name: string;
  zone: string;
  capacityKg: number | null;
}

export default function WarehousesBinsPage() {
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedWh, setSelectedWh] = useState<WarehouseRow | null>(null);
  const [bins, setBins] = useState<BinRow[]>([]);
  const [storedBatches, setStoredBatches] = useState<any[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [binOpen, setBinOpen] = useState(false);
  const [newSiteId, setNewSiteId] = useState('');
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('TRADING_WAREHOUSE');
  const [binCode, setBinCode] = useState('');
  const [binName, setBinName] = useState('');
  const [binZone, setBinZone] = useState('CHILLER');
  const [binCapKg, setBinCapKg] = useState('2000');
  const [toast, setToast] = useState<{ msg: string; isError?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const loadWarehouses = useCallback(async () => {
    const [whRes, siteRes] = await Promise.all([
      fetch('/api/proxy/warehouses').then((r) => (r.ok ? r.json() : { data: [] })),
      fetch('/api/proxy/sites').then((r) => (r.ok ? r.json() : [])),
    ]);
    const list = Array.isArray(whRes) ? whRes : Array.isArray(whRes?.data) ? whRes.data : [];
    const mapped: WarehouseRow[] = list.map((w: any) => ({
      id: String(w.id),
      siteId: String(w.site_id ?? w.siteId ?? ''),
      siteName: String(w.site_name ?? w.siteName ?? 'Site'),
      name: String(w.name ?? ''),
      locationType: String(w.location_type ?? w.locationType ?? 'TRADING_WAREHOUSE'),
      isActive: w.is_active !== false,
    }));
    setWarehouses(mapped);
    setSelectedWh((prev) =>
      prev ? mapped.find((w) => w.id === prev.id) ?? mapped[0] ?? null : mapped[0] ?? null,
    );

    const sRows = Array.isArray(siteRes) ? siteRes : Array.isArray(siteRes?.data) ? siteRes.data : [];
    const mappedSites = sRows.map((s: any) => ({ id: String(s.id), name: String(s.name ?? 'Site') }));
    setSites(mappedSites);
    if (mappedSites.length > 0) setNewSiteId((p) => p || mappedSites[0].id);
  }, []);

  const loadBins = useCallback(async (whId: string) => {
    const res = await fetch(`/api/proxy/warehouses/${encodeURIComponent(whId)}/bins`).then((r) =>
      r.ok ? r.json() : null,
    );
    const data = res?.data ?? res;
    setBins(Array.isArray(data?.bins) ? data.bins : []);
    setStoredBatches(Array.isArray(data?.storedBatches) ? data.storedBatches : []);
  }, []);

  useEffect(() => {
    loadWarehouses().catch(() => {});
  }, [loadWarehouses]);

  useEffect(() => {
    if (selectedWh?.id) {
      loadBins(selectedWh.id).catch(() => {});
    }
  }, [selectedWh?.id, loadBins]);

  const handleCreateWarehouse = async () => {
    if (!newSiteId || !newName.trim()) {
      setToast({ msg: 'Site and storage name are required.', isError: true });
      return;
    }
    try {
      setBusy(true);
      const res = await fetch('/api/proxy/warehouses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: newSiteId, name: newName.trim(), locationType: newType }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.message || `HTTP ${res.status}`);
      await loadWarehouses();
      setCreateOpen(false);
      setNewName('');
      setToast({ msg: `Added storage location "${newName.trim()}".` });
    } catch (err) {
      setToast({ msg: `Failed to create location: ${(err as Error).message}`, isError: true });
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (wh: WarehouseRow) => {
    try {
      setBusy(true);
      const res = await fetch(`/api/proxy/warehouses/${encodeURIComponent(wh.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !wh.isActive }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadWarehouses();
      setToast({ msg: `Updated "${wh.name}".` });
    } catch (err) {
      setToast({ msg: `Failed to update warehouse: ${(err as Error).message}`, isError: true });
    } finally {
      setBusy(false);
    }
  };

  const handleCreateBin = async () => {
    if (!selectedWh || !binCode.trim()) return;
    try {
      setBusy(true);
      const res = await fetch(`/api/proxy/warehouses/${encodeURIComponent(selectedWh.id)}/bins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: binCode.trim().toUpperCase(),
          name: binName.trim() || binCode.trim(),
          zone: binZone,
          capacityKg: Number(binCapKg) || undefined,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.message || `HTTP ${res.status}`);
      await loadBins(selectedWh.id);
      setBinOpen(false);
      setBinCode('');
      setBinName('');
      setToast({ msg: `Added bin ${binCode.trim().toUpperCase()} to ${selectedWh.name}.` });
    } catch (err) {
      setToast({ msg: `Failed to add bin: ${(err as Error).message}`, isError: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-ink-3 mb-1">
            <Link href="/inventory/stock" className="hover:text-ink">Inventory</Link>
            <span>/</span>
            <span className="text-haldi">Warehouses &amp; Storage Bins</span>
          </div>
          <h1 className="text-2xl font-bold text-ink">Warehouses, Stores &amp; Bins</h1>
          <p className="text-sm text-ink-3">
            Organize cold rooms, dry stores, quarantine areas, and rack bins at each site.
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          + Add Storage Area
        </Button>
      </div>

      {toast && (
        <div
          className={`p-3 rounded-lg border text-sm ${
            toast.isError
              ? 'bg-madder-soft border-madder/30 text-madder'
              : 'bg-leaf-soft border-leaf/30 text-leaf'
          }`}
        >
          {toast.msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-2.5">
          {warehouses.map((wh) => (
            <div
              key={wh.id}
              onClick={() => setSelectedWh(wh)}
              className={`p-4 rounded-[3px] border cursor-pointer ${
                selectedWh?.id === wh.id
                  ? 'bg-haldi-soft border-haldi'
                  : 'bg-sheet border-rule hover:border-rule-strong'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm text-ink">{wh.name}</span>
                <Badge variant={wh.isActive ? 'success' : 'danger'}>
                  {wh.isActive ? 'ACTIVE' : 'INACTIVE'}
                </Badge>
              </div>
              <div className="text-xs text-ink-3 mt-1">
                {wh.siteName} · {wh.locationType.replace(/_/g, ' ')}
              </div>
              <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                <button
                  disabled={busy}
                  onClick={() => toggleActive(wh)}
                  className="text-xs text-action hover:underline"
                >
                  {wh.isActive ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="lg:col-span-2 space-y-4">
          <Card className="p-5 bg-sheet border-rule space-y-4">
            <div className="flex items-center justify-between border-b border-rule pb-3">
              <div>
                <h2 className="text-lg font-bold text-ink">
                  {selectedWh ? `Bins in ${selectedWh.name}` : 'Select a storage area'}
                </h2>
                <p className="text-xs text-ink-3">
                  {storedBatches.length} active stock batch(es) currently assigned here.
                </p>
              </div>
              {selectedWh && (
                <Button variant="secondary" onClick={() => setBinOpen(true)}>
                  + Add Bin / Rack
                </Button>
              )}
            </div>

            {bins.length === 0 ? (
              <p className="text-sm text-ink-3">No bins configured in this storage area yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {bins.map((b) => (
                  <div key={b.id} className="p-3 rounded-lg bg-paper border border-rule text-xs space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="font-mono font-bold text-haldi">{b.code}</span>
                      <Badge variant="info">{b.zone}</Badge>
                    </div>
                    <div className="text-ink font-medium">{b.name}</div>
                    {b.capacityKg && (
                      <div className="text-ink-3 font-mono">Capacity: {b.capacityKg} kg</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Add Warehouse / Storage Area">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-ink-3 mb-1">Site</label>
            <select
              value={newSiteId}
              onChange={(e) => setNewSiteId(e.target.value)}
              className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-ink-3 mb-1">Storage Area Name</label>
            <input
              type="text"
              placeholder="e.g. Cold Room B / Dry RM Store"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
            />
          </div>
          <div>
            <label className="block text-xs text-ink-3 mb-1">Storage Type</label>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
            >
              <option value="TRADING_WAREHOUSE">Trading Warehouse</option>
              <option value="RAW_MATERIAL_STORE">Raw Material Store</option>
              <option value="FINISHED_GOODS_STORE">Finished Goods Store</option>
              <option value="QUARANTINE">Quarantine / Hold Area</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={busy} onClick={handleCreateWarehouse}>Create</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={binOpen} onClose={() => setBinOpen(false)} title={`Add Bin — ${selectedWh?.name ?? ''}`}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-3 mb-1">Bin Code</label>
              <input
                type="text"
                placeholder="e.g. RACK-A1"
                value={binCode}
                onChange={(e) => setBinCode(e.target.value)}
                className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm font-mono text-ink"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-3 mb-1">Zone</label>
              <select
                value={binZone}
                onChange={(e) => setBinZone(e.target.value)}
                className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
              >
                <option value="CHILLER">Chiller / Cold</option>
                <option value="AMBIENT">Ambient / Dry</option>
                <option value="QUARANTINE">Quarantine</option>
                <option value="DISPATCH_BAY">Dispatch Bay</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-3 mb-1">Display Name</label>
              <input
                type="text"
                value={binName}
                onChange={(e) => setBinName(e.target.value)}
                className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm text-ink"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-3 mb-1">Capacity (kg)</label>
              <input
                type="number"
                value={binCapKg}
                onChange={(e) => setBinCapKg(e.target.value)}
                className="w-full bg-paper border border-rule-strong rounded-lg p-2.5 text-sm font-mono text-ink"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setBinOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={busy} onClick={handleCreateBin}>Add Bin</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
