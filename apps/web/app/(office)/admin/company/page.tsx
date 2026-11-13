'use client';

import React, { useState } from 'react';

export default function AdminCompanyPage() {
  const [legalName, setLegalName] = useState('NeoAgro Dairy & Feeds Pvt. Ltd.');
  const [gstin, setGstin] = useState('27AAACN1234F1Z5');
  const [pan, setPan] = useState('AAACN1234F');
  const [bankDetails, setBankDetails] = useState('SBI Baramati · A/C 30981122334 · IFSC SBIN0000321');
  const [footer, setFooter] = useState('Subject to Baramati Jurisdiction. Goods once sold will not be taken back.');
  const [saved, setSaved] = useState(false);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Company Profile</h1>
        <p className="text-sm text-slate-500">
          Legal entity, GSTIN/PAN, bank details for tax invoices, and fixed Asia/Kolkata timezone.
        </p>
      </div>

      {saved && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800">
          ✓ Company profile updated for all printed invoices &amp; statements.
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSaved(true);
        }}
        className="rounded-xl border border-slate-200 bg-white p-6 space-y-4 text-sm"
      >
        <div>
          <label className="block text-xs font-semibold text-slate-600">Legal Company Name</label>
          <input value={legalName} onChange={(e) => setLegalName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-slate-600">Primary GSTIN</label>
            <input value={gstin} onChange={(e) => setGstin(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600">PAN</label>
            <input value={pan} onChange={(e) => setPan(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600">Bank Details (Printed on Invoices)</label>
          <input value={bankDetails} onChange={(e) => setBankDetails(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600">Invoice Terms &amp; Footer</label>
          <textarea value={footer} onChange={(e) => setFooter(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" />
        </div>
        <div className="grid grid-cols-2 gap-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <div>Financial Year: <strong>Apr 2026 – Mar 2027</strong></div>
          <div>Timezone: <strong>Asia/Kolkata (IST, Fixed)</strong></div>
        </div>
        <button type="submit" className="rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-purple-700">
          Save Company Profile
        </button>
      </form>
    </div>
  );
}

