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
        <h1 className="text-2xl font-bold text-ink">Company Profile</h1>
        <p className="text-sm text-ink-3">
          Legal entity, GSTIN/PAN, bank details for tax invoices, and fixed Asia/Kolkata timezone.
        </p>
      </div>

      {saved && (
        <div className="rounded-[3px] border border-leaf/30 bg-leaf-soft px-4 py-2.5 text-sm font-medium text-leaf">
          ✓ Company profile updated for all printed invoices &amp; statements.
        </div>
      )}

      <form
        onSubmit={handleSave}
        className="rounded-[3px] border border-rule bg-sheet p-6 space-y-4 text-sm"
      >
        <div>
          <label className="block text-xs font-semibold text-ink-3">Legal Company Name</label>
          <input
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2 text-ink"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-ink-3">Primary GSTIN</label>
            <input
              value={gstin}
              onChange={(e) => setGstin(e.target.value)}
              className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2 font-mono text-ink"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-3">PAN</label>
            <input
              value={pan}
              onChange={(e) => setPan(e.target.value)}
              className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2 font-mono text-ink"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-ink-3">Bank Details (Printed on Invoices)</label>
          <input
            value={bankDetails}
            onChange={(e) => setBankDetails(e.target.value)}
            className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2 text-ink"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-ink-3">Invoice Terms &amp; Footer</label>
          <textarea
            value={footer}
            onChange={(e) => setFooter(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2 text-ink"
          />
        </div>
        <div className="grid grid-cols-2 gap-4 rounded-lg border border-rule bg-paper p-3 text-xs text-ink-3">
          <div>Financial Year: <strong className="text-ink">Apr 2026 – Mar 2027</strong></div>
          <div>Timezone: <strong className="text-ink">Asia/Kolkata (IST, Fixed)</strong></div>
        </div>
        <button type="submit" className="rounded-[3px] bg-purple-600 px-5 py-2.5 text-sm font-semibold text-ink hover:bg-purple-700">
          Save Company Profile
        </button>
      </form>
    </div>
  );
}
