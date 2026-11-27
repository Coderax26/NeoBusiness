'use client';

import React, { useEffect, useState } from 'react';
import { SettingsPageHeader } from '../../../../src/components/settings/SettingsPageHeader';

interface TemplateItem {
  id: string;
  title: string;
  channel: string;
  body: string;
  templateRef: string;
  whenSent: string;
}

interface SeriesItem {
  docType: string;
  prefix: string;
  nextNumber: string;
  sample: string;
  description: string;
}

const TEMPLATE_META: Record<string, { title: string; whenSent: string }> = {
  ORDER_CONFIRM_WA: {
    title: 'Order Confirmation Message',
    whenSent: 'Sent automatically to the customer on WhatsApp when their order is confirmed.',
  },
  OTP_LOGIN_SMS: {
    title: 'Staff Login Code (OTP)',
    whenSent: 'Sent by SMS when a driver or field staff member requests a one-time login code.',
  },
  PAYMENT_REMINDER_WA: {
    title: 'Payment Due Reminder',
    whenSent: 'Sent to customers with overdue invoices as a polite reminder.',
  },
};

const DOC_TYPE_LABELS: Record<string, { label: string; description: string }> = {
  SALES_ORDER: { label: 'Sales Order', description: 'Customer orders booked in the office or app' },
  INVOICE: { label: 'Tax Invoice', description: 'GST tax bills raised on dispatch or delivery' },
  QUOTE: { label: 'Price Quote', description: 'Price estimates shared with customers' },
  PURCHASE_ORDER: { label: 'Purchase Order', description: 'Orders placed with raw material suppliers' },
  GRN: { label: 'Goods Receipt (GRN)', description: 'Incoming stock count receipts at the gate' },
  TRIP: { label: 'Delivery Trip', description: 'Vehicle dispatch sheets & challans' },
  CUSTOMER: { label: 'Customer Code', description: 'Unique customer account IDs' },
  SUPPLIER: { label: 'Supplier Code', description: 'Unique supplier account IDs' },
};

function renderFriendlyPreview(body: string): string {
  return body
    .replace(/\{\{customer\}\}/gi, 'Sahyadri Dairy')
    .replace(/\{\{order_no\}\}|\{\{orderNo\}\}/gi, 'SO-2611-0053')
    .replace(/\{\{amount\}\}/gi, '24,500')
    .replace(/\{\{invoiceNo\}\}|\{\{invoice_no\}\}/gi, 'INV-2026-0106')
    .replace(/\{\{balance\}\}/gi, '18,200')
    .replace(/\{\{otp\}\}/gi, '482910');
}

export default function AdminTemplatesAndSeriesPage() {
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [series, setSeries] = useState<SeriesItem[]>([]);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      fetch('/api/proxy/admin/notification-templates').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/proxy/admin/doc-sequences').then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([tplRes, seqRes]) => {
        if (!active) return;
        if (tplRes.status === 'fulfilled') {
          const rows = Array.isArray(tplRes.value)
            ? tplRes.value
            : Array.isArray(tplRes.value?.data)
              ? tplRes.value.data
              : [];
          setTemplates(
            rows.map((t: any) => {
              const code = String(t.code || '');
              const meta = TEMPLATE_META[code];
              return {
                id: String(t.id || code),
                title: meta?.title || String(t.title || code.replace(/_/g, ' ')),
                channel: String(t.channel || 'WHATSAPP').toUpperCase() === 'SMS' ? 'SMS' : 'WhatsApp',
                body: String(t.body ?? t.preview ?? ''),
                templateRef: String(t.wa_template_id ?? t.providerId ?? ''),
                whenSent:
                  meta?.whenSent ||
                  'Sent automatically when this business event occurs.',
              };
            }),
          );
        }
        if (seqRes.status === 'fulfilled') {
          const rows = Array.isArray(seqRes.value)
            ? seqRes.value
            : Array.isArray(seqRes.value?.data)
              ? seqRes.value.data
              : [];
          setSeries(
            rows.map((n: any) => {
              const rawType = String(n.doc_type ?? n.docType ?? '');
              const meta = DOC_TYPE_LABELS[rawType.toUpperCase()];
              const prefix = String(n.prefix ?? '');
              const period = n.period ? `${n.period}-` : '';
              const nextNumNum = Number(n.nextNumber ?? (Number(n.last_no ?? 0) + 1));
              const padded = String(nextNumNum).padStart(4, '0');
              return {
                docType: meta?.label || rawType.replace(/_/g, ' '),
                prefix: `${prefix}${period}`,
                nextNumber: padded,
                sample: String(n.sample || `${prefix}${period}${padded}`),
                description: meta?.description || 'Sequential business document numbering',
              };
            }),
          );
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        title="Customer Messages & Document Numbering"
        subtitle="Preview automatic WhatsApp/SMS messages sent by NeoBus and check how invoice & order numbers are generated."
        whatIsThis="Automatic messages save your staff time by notifying customers when orders confirm and sending login codes safely. Document numbers increase sequentially so your tax invoices always follow GST compliance rules without gaps or duplicates."
      />

      <div className="rounded-[4px] border border-rule bg-sheet p-5 space-y-4">
        <div>
          <h2 className="text-base font-bold text-ink">Automatic WhatsApp &amp; SMS Messages</h2>
          <p className="text-xs text-ink-3 mt-0.5">
            Sample customer names, order numbers, and amounts are filled in automatically when each message is sent.
          </p>
        </div>
        {templates.length === 0 ? (
          <p className="text-xs text-ink-3">No automatic message templates loaded yet.</p>
        ) : (
          <div className="space-y-3">
            {templates.map((t) => (
              <div key={t.id} className="rounded-[3px] border border-rule bg-paper p-4 space-y-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-ink">{t.title}</span>
                    <span className="rounded bg-action-soft px-2 py-0.5 text-xs font-semibold text-action">
                      {t.channel}
                    </span>
                  </div>
                  {t.templateRef && (
                    <span className="text-xs text-ink-3">Approved Template Ref: {t.templateRef}</span>
                  )}
                </div>
                <p className="text-xs text-ink-3">{t.whenSent}</p>
                <div className="rounded-[3px] border border-rule bg-sheet px-3 py-2 text-xs text-ink">
                  <span className="font-semibold text-ink-3">Sample message: </span>
                  &ldquo;{renderFriendlyPreview(t.body)}&rdquo;
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-[4px] border border-rule bg-sheet">
        <div className="border-b border-rule bg-paper px-5 py-3.5">
          <div className="text-sm font-bold text-ink">Invoice &amp; Document Number Formats</div>
          <p className="text-xs text-ink-3 mt-0.5">
            Numbers advance automatically in sequence to keep your GST records clean and audit-ready.
          </p>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-paper text-xs text-ink-3">
            <tr>
              <th className="px-4 py-3 font-semibold">Document</th>
              <th className="px-4 py-3 font-semibold">Starting Prefix</th>
              <th className="px-4 py-3 font-semibold">Next Number</th>
              <th className="px-4 py-3 font-semibold">Example Next Document</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {series.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-ink-3">
                  Document number series will appear once the first documents are created.
                </td>
              </tr>
            ) : (
              series.map((n) => (
                <tr key={n.docType + n.prefix}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-ink">{n.docType}</div>
                    <div className="text-xs text-ink-3">{n.description}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-2">{n.prefix || '—'}</td>
                  <td className="px-4 py-3 font-mono text-ink">{n.nextNumber}</td>
                  <td className="px-4 py-3 font-mono font-semibold text-action">{n.sample}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
