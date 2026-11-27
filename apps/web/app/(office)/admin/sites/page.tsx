'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { type SiteRecord } from '../../../../src/lib/admin-data';
import { SettingsPageHeader } from '../../../../src/components/settings/SettingsPageHeader';
import {
  SITE_TYPE_LABELS,
  SITE_TYPE_DESCRIPTIONS,
  LOCATION_TYPE_LABELS,
  getLocationTypeLabel,
} from '../../../../src/lib/settings-copy';

const SITE_TYPE_OPTIONS: Array<{ value: 'FACTORY' | 'WAREHOUSE' | 'OFFICE'; label: string }> = [
  { value: 'FACTORY', label: SITE_TYPE_LABELS.FACTORY },
  { value: 'WAREHOUSE', label: SITE_TYPE_LABELS.WAREHOUSE },
  { value: 'OFFICE', label: SITE_TYPE_LABELS.OFFICE },
];

const LOCATION_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'RAW_MATERIAL_STORE', label: LOCATION_TYPE_LABELS.RAW_MATERIAL_STORE },
  { value: 'FINISHED_GOODS_STORE', label: LOCATION_TYPE_LABELS.FINISHED_GOODS_STORE },
  { value: 'TRADING_WAREHOUSE', label: LOCATION_TYPE_LABELS.TRADING_WAREHOUSE },
  { value: 'QUARANTINE', label: LOCATION_TYPE_LABELS.QUARANTINE },
  { value: 'OFFICE', label: LOCATION_TYPE_LABELS.OFFICE },
];

function mapApiSite(s: any): SiteRecord {
  const siteType = (s.site_type ?? s.type ?? 'WAREHOUSE') as SiteRecord['siteType'];
  const rawLocs = Array.isArray(s.locations) ? s.locations : [];
  return {
    id: String(s.id),
    code: String(s.site_code ?? s.code ?? String(s.id).slice(0, 6).toUpperCase()),
    name: String(s.name ?? 'Site'),
    siteType,
    address: String(s.address ?? ''),
    gstin: String(s.gstin ?? ''),
    active: s.is_active !== false,
    isFulfillmentSite:
      s.is_fulfillment_site !== undefined
        ? Boolean(s.is_fulfillment_site)
        : siteType !== 'OFFICE',
    locations: rawLocs.map((l: any) => ({
      id: l.id ? String(l.id) : undefined,
      name: String(l.name ?? 'Storage Area'),
      type: (l.location_type ?? l.type ?? 'TRADING_WAREHOUSE') as any,
      active: l.is_active !== false,
    })),
  };
}

export default function AdminSitesPage() {
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<'all' | 'fulfillment' | 'inactive'>('all');
  const [toast, setToast] = useState<{ text: string; tone: 'success' | 'error' } | null>(null);

  // Add / Edit Site modal state
  const [siteModalOpen, setSiteModalOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<SiteRecord | null>(null);
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formType, setFormType] = useState<'FACTORY' | 'WAREHOUSE' | 'OFFICE'>('WAREHOUSE');
  const [formAddress, setFormAddress] = useState('');
  const [formGstin, setFormGstin] = useState('');
  const [formFulfillment, setFormFulfillment] = useState(true);
  const [formActive, setFormActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [savingSite, setSavingSite] = useState(false);

  // Add / Edit Storage Location modal state
  const [locSite, setLocSite] = useState<SiteRecord | null>(null);
  const [editingLocId, setEditingLocId] = useState<string | null>(null);
  const [locName, setLocName] = useState('');
  const [locType, setLocType] = useState('FINISHED_GOODS_STORE');
  const [locError, setLocError] = useState<string | null>(null);
  const [savingLoc, setSavingLoc] = useState(false);

  const loadSites = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/proxy/admin/sites?includeInactive=true&includeLocations=true');
      if (!res.ok) {
        setToast({ text: 'Unable to load sites. Please refresh or check permissions.', tone: 'error' });
        setSites([]);
        return;
      }
      const data = await res.json();
      const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      setSites(list.map(mapApiSite));
    } catch {
      setToast({ text: 'Unable to reach server to load sites.', tone: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSites();
  }, [loadSites]);

  const notifyShellSitesUpdated = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('neobus-sites-updated'));
    }
  };

  const openCreateModal = () => {
    setEditingSite(null);
    setFormName('');
    setFormCode('');
    setFormType('WAREHOUSE');
    setFormAddress('');
    setFormGstin('');
    setFormFulfillment(true);
    setFormActive(true);
    setFormError(null);
    setSiteModalOpen(true);
  };

  const openEditModal = (site: SiteRecord) => {
    setEditingSite(site);
    setFormName(site.name);
    setFormCode(site.code);
    setFormType(site.siteType === 'DEPOT' ? 'WAREHOUSE' : site.siteType);
    setFormAddress(site.address);
    setFormGstin(site.gstin);
    setFormFulfillment(Boolean(site.isFulfillmentSite));
    setFormActive(site.active);
    setFormError(null);
    setSiteModalOpen(true);
  };

  const handleSaveSite = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const trimmedName = formName.trim();
    if (!trimmedName) {
      setFormError('Please enter a location name.');
      return;
    }

    setSavingSite(true);
    try {
      const url = editingSite
        ? `/api/proxy/admin/sites/${encodeURIComponent(editingSite.id)}`
        : '/api/proxy/admin/sites';
      const method = editingSite ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          siteType: formType,
          siteCode: formCode.trim().toUpperCase() || undefined,
          gstin: formGstin.trim().toUpperCase() || undefined,
          address: formAddress.trim() || undefined,
          isFulfillmentSite: formFulfillment,
          ...(editingSite ? { isActive: formActive } : {}),
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          payload?.error?.message ||
          (Array.isArray(payload?.message) ? payload.message.join(', ') : payload?.message) ||
          'Could not save site details.';
        setFormError(String(msg));
        return;
      }

      setSiteModalOpen(false);
      await loadSites();
      notifyShellSitesUpdated();
      setToast({
        text: editingSite
          ? `Updated "${trimmedName}" successfully.`
          : `Added new site "${trimmedName}".`,
        tone: 'success',
      });
    } catch {
      setFormError('Network error while saving site.');
    } finally {
      setSavingSite(false);
    }
  };

  const toggleSiteField = async (
    site: SiteRecord,
    patch: { isActive?: boolean; isFulfillmentSite?: boolean },
    successMsg: string,
  ) => {
    setToast(null);
    try {
      const res = await fetch(`/api/proxy/admin/sites/${encodeURIComponent(site.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setToast({
          text: String(err?.message || err?.error?.message || `Could not update ${site.name}.`),
          tone: 'error',
        });
        return;
      }
      await loadSites();
      notifyShellSitesUpdated();
      setToast({ text: successMsg, tone: 'success' });
    } catch {
      setToast({ text: `Network error updating ${site.name}.`, tone: 'error' });
    }
  };

  const openAddLocation = (site: SiteRecord) => {
    setLocSite(site);
    setEditingLocId(null);
    setLocName('');
    setLocType('FINISHED_GOODS_STORE');
    setLocError(null);
  };

  const openEditLocation = (site: SiteRecord, loc: SiteRecord['locations'][number]) => {
    if (!loc.id) return;
    setLocSite(site);
    setEditingLocId(loc.id);
    setLocName(loc.name);
    setLocType(loc.type);
    setLocError(null);
  };

  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locSite) return;
    const trimmed = locName.trim();
    if (!trimmed) {
      setLocError('Please enter a storage area name.');
      return;
    }
    setSavingLoc(true);
    setLocError(null);
    try {
      const url = editingLocId
        ? `/api/proxy/admin/sites/${encodeURIComponent(locSite.id)}/locations/${encodeURIComponent(editingLocId)}`
        : `/api/proxy/admin/sites/${encodeURIComponent(locSite.id)}/locations`;
      const method = editingLocId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, locationType: locType }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setLocError(String(payload?.message || payload?.error?.message || 'Could not save storage area.'));
        return;
      }
      setLocSite(null);
      await loadSites();
      setToast({
        text: editingLocId ? `Updated storage area "${trimmed}".` : `Added storage area "${trimmed}".`,
        tone: 'success',
      });
    } catch {
      setLocError('Network error while saving storage area.');
    } finally {
      setSavingLoc(false);
    }
  };

  const handleDeactivateLocation = async (siteId: string, locId: string, name: string) => {
    try {
      const res = await fetch(
        `/api/proxy/admin/sites/${encodeURIComponent(siteId)}/locations/${encodeURIComponent(locId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive: false }),
        },
      );
      if (!res.ok) {
        setToast({ text: `Could not remove storage area "${name}".`, tone: 'error' });
        return;
      }
      await loadSites();
      setToast({ text: `Marked storage area "${name}" as inactive.`, tone: 'success' });
    } catch {
      setToast({ text: `Network error removing storage area.`, tone: 'error' });
    }
  };

  const fulfillmentCount = useMemo(
    () => sites.filter((s) => s.active && s.isFulfillmentSite).length,
    [sites],
  );
  const inactiveCount = useMemo(() => sites.filter((s) => !s.active).length, [sites]);

  const filteredSites = useMemo(() => {
    if (filterTab === 'fulfillment') return sites.filter((s) => s.active && s.isFulfillmentSite);
    if (filterTab === 'inactive') return sites.filter((s) => !s.active);
    return sites;
  }, [sites, filterTab]);

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        title="Business Locations & Fulfillment Sites"
        subtitle="Add or edit your factories, warehouses, and offices, and choose which locations can pack and ship customer orders."
        whatIsThis="Each site represents a physical place where your business operates. Turn on 'Fulfillment Site' for factories or warehouses that store finished stock and dispatch customer orders — those locations will appear in Customer defaults and Sales Order dispatch selectors."
        actions={
          <button
            type="button"
            onClick={openCreateModal}
            className="rounded-[3px] bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-action-hover"
          >
            + Add Site
          </button>
        }
      />

      {toast && (
        <div
          className={`rounded-[3px] border px-4 py-2.5 text-sm font-medium flex items-center justify-between gap-3 ${
            toast.tone === 'error'
              ? 'border-madder/30 bg-madder-soft text-madder'
              : 'border-leaf/30 bg-leaf-soft text-leaf'
          }`}
        >
          <span>{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} className="text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-rule pb-3">
        {[
          { id: 'all', label: `All Sites (${sites.length})` },
          { id: 'fulfillment', label: `Fulfillment Sites (${fulfillmentCount})` },
          { id: 'inactive', label: `Inactive (${inactiveCount})` },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilterTab(tab.id as any)}
            className={`rounded-[3px] px-3 py-1.5 text-xs font-semibold transition-colors ${
              filterTab === tab.id
                ? 'bg-action text-white'
                : 'bg-paper border border-rule text-ink-2 hover:text-ink'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-[3px] border border-rule bg-sheet p-6 text-sm text-ink-3">
          Loading business locations...
        </div>
      ) : filteredSites.length === 0 ? (
        <div className="rounded-[3px] border border-rule bg-sheet p-6 text-sm text-ink-3">
          {filterTab === 'fulfillment'
            ? 'No active fulfillment sites yet. Edit a factory or warehouse and enable "Can Fulfill Customer Orders".'
            : filterTab === 'inactive'
              ? 'No inactive sites.'
              : 'No sites found. Click "+ Add Site" to set up your first location.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {filteredSites.map((s) => {
            const activeLocs = s.locations.filter((l) => l.active !== false);
            return (
              <div
                key={s.id}
                className={`rounded-[4px] border bg-sheet p-5 space-y-4 ${
                  s.active ? 'border-rule' : 'border-rule opacity-80 bg-paper'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {s.code && (
                        <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-paper border border-rule text-ink-2">
                          {s.code}
                        </span>
                      )}
                      <span className="rounded bg-sunken px-2 py-0.5 text-xs font-semibold text-ink-2">
                        {SITE_TYPE_LABELS[s.siteType] || s.siteType}
                      </span>
                      {s.isFulfillmentSite && (
                        <span className="rounded bg-action-soft px-2 py-0.5 text-xs font-semibold text-action">
                          Fulfillment Site
                        </span>
                      )}
                    </div>
                    <h2 className="mt-1.5 text-lg font-bold text-ink">{s.name}</h2>
                    {s.address && <p className="text-xs text-ink-2 mt-0.5">{s.address}</p>}
                    <p className="mt-1 text-xs text-ink-3">
                      Site GST Number: <span className="font-mono">{s.gstin || 'Uses main company GSTIN'}</span>
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditModal(s)}
                      className="rounded-[3px] border border-rule-strong bg-paper px-3 py-1 text-xs font-semibold text-ink hover:bg-sunken"
                    >
                      Edit Site
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void toggleSiteField(
                          s,
                          { isActive: !s.active },
                          `${s.name} is now ${!s.active ? 'active' : 'inactive'}.`,
                        )
                      }
                      title="Active sites appear in daily operations; inactive sites are hidden from new orders."
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        s.active ? 'bg-leaf-soft text-leaf' : 'bg-sunken text-ink-3'
                      }`}
                    >
                      {s.active ? 'Active' : 'Inactive'}
                    </button>
                  </div>
                </div>

                {/* Fulfillment Site Quick Toggle */}
                <div className="flex items-center justify-between rounded-[3px] bg-paper border border-rule px-3 py-2 text-xs">
                  <div>
                    <div className="font-semibold text-ink">Order Fulfillment &amp; Dispatch</div>
                    <div className="text-ink-3">
                      {s.isFulfillmentSite
                        ? 'Customers and sales orders can select this site for dispatch.'
                        : 'Not used for shipping customer orders (office or internal site only).'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      void toggleSiteField(
                        s,
                        { isFulfillmentSite: !s.isFulfillmentSite },
                        `${s.name} ${
                          !s.isFulfillmentSite
                            ? 'enabled as a fulfillment site.'
                            : 'removed from fulfillment sites.'
                        }`,
                      )
                    }
                    className={`ml-3 shrink-0 rounded-[3px] px-2.5 py-1 font-semibold border ${
                      s.isFulfillmentSite
                        ? 'border-leaf/30 bg-leaf-soft text-leaf'
                        : 'border-rule-strong bg-sheet text-ink-2 hover:text-ink'
                    }`}
                  >
                    {s.isFulfillmentSite ? 'Enabled ✓' : 'Enable'}
                  </button>
                </div>

                {/* Storage Areas inside Site */}
                <div className="border-t border-rule pt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-ink">Storage Areas &amp; Bays</div>
                      <div className="text-[11px] text-ink-3">
                        Rooms or yards at this site where raw materials or finished stock are kept.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openAddLocation(s)}
                      className="rounded-[3px] border border-action/30 bg-action-soft px-2.5 py-1 text-xs font-semibold text-action hover:opacity-90 shrink-0"
                    >
                      + Add Storage Area
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    {activeLocs.length === 0 ? (
                      <span className="text-xs text-ink-3">
                        No storage areas added yet. Click &ldquo;+ Add Storage Area&rdquo; to add one.
                      </span>
                    ) : (
                      activeLocs.map((loc) => (
                        <div
                          key={loc.id || loc.name}
                          className="inline-flex items-center gap-2 rounded-[3px] bg-paper border border-rule px-2.5 py-1.5 text-xs text-ink"
                        >
                          <span className="font-medium">{loc.name}</span>
                          <span className="text-ink-3">({getLocationTypeLabel(loc.type)})</span>
                          {loc.id && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditLocation(s, loc)}
                                className="text-action hover:underline font-medium"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeactivateLocation(s.id, loc.id!, loc.name)}
                                className="text-madder hover:underline"
                                title="Remove storage area"
                              >
                                ×
                              </button>
                            </>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Site Modal */}
      {siteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <form
            onSubmit={handleSaveSite}
            className="w-full max-w-lg rounded-[4px] border border-rule bg-sheet p-6 shadow-xl space-y-4"
          >
            <div>
              <h2 className="text-lg font-bold text-ink">
                {editingSite ? `Edit Site: ${editingSite.name}` : 'Add New Business Site'}
              </h2>
              <p className="text-xs text-ink-3 mt-0.5">
                Set up a factory, warehouse, or office location for your team.
              </p>
            </div>

            {formError && (
              <div className="rounded-[3px] border border-madder/30 bg-madder-soft px-3 py-2 text-xs text-madder">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-ink-2 mb-1">Site Name *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Pune Distribution Warehouse"
                  className="w-full rounded-[3px] border border-rule-strong bg-paper px-3 py-2 text-sm text-ink"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-2 mb-1">Short Code</label>
                <input
                  type="text"
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                  placeholder="e.g. PUN-01"
                  maxLength={16}
                  className="w-full rounded-[3px] border border-rule-strong bg-paper px-3 py-2 text-sm font-mono text-ink"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1">Location Type *</label>
              <select
                value={formType}
                onChange={(e) => {
                  const nextType = e.target.value as 'FACTORY' | 'WAREHOUSE' | 'OFFICE';
                  setFormType(nextType);
                  if (!editingSite) {
                    setFormFulfillment(nextType !== 'OFFICE');
                  }
                }}
                className="w-full rounded-[3px] border border-rule-strong bg-paper px-3 py-2 text-sm text-ink"
              >
                {SITE_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-ink-3 mt-1">{SITE_TYPE_DESCRIPTIONS[formType]}</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1">Full Address</label>
              <input
                type="text"
                value={formAddress}
                onChange={(e) => setFormAddress(e.target.value)}
                placeholder="Street, industrial area, city & PIN code"
                className="w-full rounded-[3px] border border-rule-strong bg-paper px-3 py-2 text-sm text-ink"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1">
                Site GST Number (Optional)
              </label>
              <input
                type="text"
                value={formGstin}
                onChange={(e) => setFormGstin(e.target.value.toUpperCase())}
                placeholder="Leave blank to use main Company GSTIN"
                maxLength={15}
                className="w-full rounded-[3px] border border-rule-strong bg-paper px-3 py-2 text-sm font-mono text-ink"
              />
            </div>

            <label className="flex items-start gap-2.5 rounded-[3px] border border-rule bg-paper p-3 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={formFulfillment}
                onChange={(e) => setFormFulfillment(e.target.checked)}
                className="mt-0.5"
              />
              <div>
                <div className="font-semibold text-ink">Can Fulfill &amp; Dispatch Customer Orders</div>
                <div className="text-ink-3 mt-0.5">
                  Check this if goods can be packed and shipped to customers from this location.
                </div>
              </div>
            </label>

            {editingSite && (
              <label className="flex items-center gap-2 text-xs text-ink-2">
                <input
                  type="checkbox"
                  checked={formActive}
                  onChange={(e) => setFormActive(e.target.checked)}
                />
                Site is active and available for daily operations
              </label>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={savingSite}
                onClick={() => setSiteModalOpen(false)}
                className="rounded-[3px] border border-rule-strong px-4 py-2 text-sm text-ink-2"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingSite}
                className="rounded-[3px] bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-action-hover disabled:opacity-60"
              >
                {savingSite ? 'Saving...' : editingSite ? 'Save Changes' : 'Create Site'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add / Edit Storage Area Modal */}
      {locSite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <form
            onSubmit={handleSaveLocation}
            className="w-full max-w-md rounded-[4px] border border-rule bg-sheet p-6 shadow-xl space-y-4"
          >
            <div>
              <h2 className="text-lg font-bold text-ink">
                {editingLocId ? 'Edit Storage Area' : 'Add Storage Area'}
              </h2>
              <p className="text-xs text-ink-3 mt-0.5">Site: {locSite.name}</p>
            </div>

            {locError && (
              <div className="rounded-[3px] border border-madder/30 bg-madder-soft px-3 py-2 text-xs text-madder">
                {locError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1">
                Storage Area Name *
              </label>
              <input
                type="text"
                value={locName}
                onChange={(e) => setLocName(e.target.value)}
                placeholder="e.g. Cold Room A, Finished Goods Bay 1"
                className="w-full rounded-[3px] border border-rule-strong bg-paper px-3 py-2 text-sm text-ink"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1">
                What Is Stored Here? *
              </label>
              <select
                value={locType}
                onChange={(e) => setLocType(e.target.value)}
                className="w-full rounded-[3px] border border-rule-strong bg-paper px-3 py-2 text-sm text-ink"
              >
                {LOCATION_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={savingLoc}
                onClick={() => setLocSite(null)}
                className="rounded-[3px] border border-rule-strong px-4 py-2 text-sm text-ink-2"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingLoc}
                className="rounded-[3px] bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-action-hover disabled:opacity-60"
              >
                {savingLoc ? 'Saving...' : editingLocId ? 'Save Area' : 'Add Area'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
