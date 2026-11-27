'use client';

import React, { useState, useEffect } from 'react';
import { SettingsPageHeader } from '../../../../src/components/settings/SettingsPageHeader';

export default function AdminCompanyPage() {
  const [legalName, setLegalName] = useState('');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [bankDetails, setBankDetails] = useState('');
  const [footer, setFooter] = useState('');
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; tone: 'success' | 'error' } | null>(null);

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
    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/proxy/admin/company-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ legalName, gstin, pan, bankDetails, footer }),
      });
      if (!res.ok) {
        setStatusMsg({ text: 'Could not save company details. Please try again.', tone: 'error' });
        return;
      }
      setStatusMsg({
        text: 'Saved! All new tax invoices, quotes, and customer statements will show these updated details.',
        tone: 'success',
      });
    } catch {
      setStatusMsg({ text: 'Network error while saving company details.', tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <SettingsPageHeader
        title="Company Details"
        subtitle="Your registered business name, tax numbers, bank account details, and invoice footer."
        whatIsThis="Information saved here is printed automatically at the top and bottom of every tax invoice, sales quote, purchase order, and customer statement."
      />

      {statusMsg && (
        <div
          className={`rounded-[3px] border px-4 py-2.5 text-sm font-medium ${
            statusMsg.tone === 'error'
              ? 'border-madder/30 bg-madder-soft text-madder'
              : 'border-leaf/30 bg-leaf-soft text-leaf'
          }`}
        >
          {statusMsg.text}
        </div>
      )}

      <form
        onSubmit={handleSave}
        className="rounded-[4px] border border-rule bg-sheet p-6 space-y-5 text-sm"
      >
        <div>
          <label className="block text-xs font-semibold text-ink-2">Registered Business Name</label>
          <input
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            placeholder="e.g. NeoAgro Dairy & Feeds Pvt. Ltd."
            className="mt-1 w-full rounded-[3px] border border-rule-strong bg-paper px-3 py-2 text-ink"
          />
          <p className="mt-1 text-xs text-ink-3">
            Full legal name as registered on your GST certificate (shown as the main heading on invoices).
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-ink-2">Main GST Number (GSTIN)</label>
            <input
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              placeholder="e.g. 27AAACN1234F1Z5"
              maxLength={15}
              className="mt-1 w-full rounded-[3px] border border-rule-strong bg-paper px-3 py-2 font-mono text-ink"
            />
            <p className="mt-1 text-xs text-ink-3">15-character GST number for your head office.</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-2">Company PAN Number</label>
            <input
              value={pan}
              onChange={(e) => setPan(e.target.value.toUpperCase())}
              placeholder="e.g. AAACN1234F"
              maxLength={10}
              className="mt-1 w-full rounded-[3px] border border-rule-strong bg-paper px-3 py-2 font-mono text-ink"
            />
            <p className="mt-1 text-xs text-ink-3">10-character PAN shown on tax bills and TDS records.</p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink-2">
            Bank Account Details (Printed on Customer Invoices)
          </label>
          <input
            value={bankDetails}
            onChange={(e) => setBankDetails(e.target.value)}
            placeholder="e.g. HDFC Bank, Baramati Branch · A/C 50200012345678 · IFSC HDFC0001234"
            className="mt-1 w-full rounded-[3px] border border-rule-strong bg-paper px-3 py-2 text-ink"
          />
          <p className="mt-1 text-xs text-ink-3">
            Include Bank Name, Account Number, IFSC Code, and Branch so customers know where to transfer NEFT/RTGS payments.
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink-2">
            Invoice Terms &amp; Footer Note
          </label>
          <textarea
            value={footer}
            onChange={(e) => setFooter(e.target.value)}
            rows={3}
            placeholder="e.g. Goods once sold will not be taken back. Subject to Pune jurisdiction."
            className="mt-1 w-full rounded-[3px] border border-rule-strong bg-paper px-3 py-2 text-ink"
          />
          <p className="mt-1 text-xs text-ink-3">
            Printed at the bottom of every customer invoice (payment terms, return policy, or thank-you note).
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-[3px] border border-rule bg-paper p-3.5 text-xs text-ink-2">
          <div>
            <div className="text-ink-3">Accounting Year</div>
            <div className="font-semibold text-ink mt-0.5">Apr 2026 – Mar 2027</div>
            <div className="text-[11px] text-ink-3 mt-0.5">Used for yearly invoice numbering &amp; tax summaries.</div>
          </div>
          <div>
            <div className="text-ink-3">Business Timezone</div>
            <div className="font-semibold text-ink mt-0.5">India Standard Time (IST)</div>
            <div className="text-[11px] text-ink-3 mt-0.5">Used for order timestamps, delivery slots &amp; daily closing.</div>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-[3px] bg-action px-5 py-2.5 text-sm font-semibold text-white hover:bg-action-hover disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save Company Details'}
        </button>
      </form>
    </div>
  );
}
