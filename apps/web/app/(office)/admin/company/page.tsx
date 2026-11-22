'use client';

import React, { useState, useEffect } from 'react';

export default function AdminCompanyPage() {
  const [legalName, setLegalName] = useState('');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [bankDetails, setBankDetails] = useState('');
  const [footer, setFooter] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/proxy/admin/company-profile')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (!active || !res) return;
        const d = res.data || res;
        if (d.legalName || d.legal_name) setLegalName(String(d.legalName || d.legal_name));
        if (d.gstin) setGstin(String(d.gstin));
        if (d.pan) setPan(String(d.pan));
        if (d.bankDetails || d.bank_details) setBankDetails(String(d.bankDetails || d.bank_details));
        if (d.footer || d.invoice_footer) setFooter(String(d.footer || d.invoice_footer));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await fetch('/api/proxy/admin/company-profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legalName, gstin, pan, bankDetails, footer }),
    }).catch(() => {});
    setSaved(true);
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Company Profile</h1>
        <p className="text-sm text-zinc-400">
          Legal entity, GSTIN/PAN, bank details for tax invoices, and fixed Asia/Kolkata timezone.
        </p>
      </div>

      {saved && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-300">
          ✓ Company profile updated for all printed invoices &amp; statements.
        </div>
      )}

      <form
        onSubmit={handleSave}
        className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 space-y-4 text-sm"
      >
        <div>
          <label className="block text-xs font-semibold text-zinc-400">Legal Company Name</label>
          <input
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-zinc-400">Primary GSTIN</label>
            <input
              value={gstin}
              onChange={(e) => setGstin(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-zinc-100"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-400">PAN</label>
            <input
              value={pan}
              onChange={(e) => setPan(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-zinc-100"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-zinc-400">Bank Details (Printed on Invoices)</label>
          <input
            value={bankDetails}
            onChange={(e) => setBankDetails(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-zinc-400">Invoice Terms &amp; Footer</label>
          <textarea
            value={footer}
            onChange={(e) => setFooter(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100"
          />
        </div>
        <div className="grid grid-cols-2 gap-4 rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-400">
          <div>Financial Year: <strong className="text-zinc-200">Apr 2026 – Mar 2027</strong></div>
          <div>Timezone: <strong className="text-zinc-200">Asia/Kolkata (IST, Fixed)</strong></div>
        </div>
        <button type="submit" className="rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-purple-700">
          Save Company Profile
        </button>
      </form>
    </div>
  );
}
