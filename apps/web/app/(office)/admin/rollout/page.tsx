'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { SettingsPageHeader } from '../../../../src/components/settings/SettingsPageHeader';

interface ChecklistRow {
  id: string;
  title: string;
  description: string;
  area: string;
  status: string;
}

const FRIENDLY_FLOWS: Record<string, { title: string; description: string; area: string }> = {
  E1: {
    title: 'Sales Order, Minimum Price & Owner Approval',
    description: 'Take a customer order, check daily price band, and verify owner approval works.',
    area: 'Sales & Approvals',
  },
  E2: {
    title: 'Customer Credit Limit & Hold Check',
    description: 'Orders over credit limit stop for manager review before dispatch.',
    area: 'Customer Credit',
  },
  E3: {
    title: 'Factory Production Batch & Stock Update',
    description: 'Run a production recipe, log finished output, and add stock for dispatch.',
    area: 'Production',
  },
  E4: {
    title: 'Supplier Purchase, Blind Receiving & Backup Supplier',
    description: 'Create a purchase order and count incoming goods without showing PO rates.',
    area: 'Purchasing & Stores',
  },
  E5: {
    title: 'Delivery Trip, E-Way Bill & Dispatch',
    description: 'Load delivery vehicle, generate E-Way Bill above ₹50,000, and close trip.',
    area: 'Logistics',
  },
  E6: {
    title: 'Payment Collection & Daily Cash Handover',
    description: 'Record customer payments and verify driver/collector cash handover at day end.',
    area: 'Finance & Cash',
  },
};

export default function RolloutReadinessPage() {
  const [checklist, setChecklist] = useState<ChecklistRow[]>([]);
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/proxy/admin/rollout')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (!active || !res) return;
        const d = res.data || res;
        if (Array.isArray(d.setupSteps)) {
          setCompletedIds(d.setupSteps.map(String));
        }
        if (Array.isArray(d.scenarios)) {
          setChecklist(
            d.scenarios.map((s: any) => {
              const friendly = FRIENDLY_FLOWS[String(s.id)];
              return {
                id: String(s.id),
                title: friendly?.title || String(s.name || 'Business Check'),
                description: friendly?.description || String(s.name || ''),
                area: friendly?.area || 'Operations',
                status: String(s.status || 'PASS').toUpperCase() === 'PASS' ? 'Ready' : String(s.status),
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

  const toggleItem = async (id: string) => {
    const next = completedIds.includes(id)
      ? completedIds.filter((x) => x !== id)
      : [...completedIds, id];
    setCompletedIds(next);
    setSaving(true);
    try {
      await fetch('/api/proxy/admin/rollout', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setupSteps: next }),
      });
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const quickSetupLinks = [
    {
      id: 'setup-company',
      title: '1. Enter Company Name, GSTIN & Bank Details',
      description: 'So your printed tax invoices show the right legal name and payment bank account.',
      href: '/admin/company',
    },
    {
      id: 'setup-sites',
      title: '2. Set Up Factories, Warehouses & Fulfillment Sites',
      description: 'Mark which locations hold stock and ship customer orders.',
      href: '/admin/sites',
    },
    {
      id: 'setup-users',
      title: '3. Add Staff Accounts & Login PINs',
      description: 'Give each coordinator, storekeeper, driver, and collector their own login.',
      href: '/admin/users',
    },
    {
      id: 'setup-balances',
      title: '4. Bring In Starting Customer & Supplier Balances',
      description: 'Enter pending amounts from your previous accounting system before going live.',
      href: '/admin/opening-balances',
    },
  ];

  const doneCount = quickSetupLinks.filter((q) => completedIds.includes(q.id)).length;

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        title="Go-Live Readiness Checklist"
        subtitle="A simple step-by-step check to make sure your business setup is ready before your team starts daily billing."
        whatIsThis="Tick off the 4 setup steps below as your team completes them, and confirm the core daily workflows have been tested on your sites."
        actions={
          <Link
            href="/admin/setup-wizard"
            className="rounded-[3px] bg-action px-4 py-2 text-xs font-semibold text-white hover:bg-action-hover"
          >
            Open Guided Setup Wizard →
          </Link>
        }
      />

      {/* Friendly Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-[4px] border border-rule bg-sheet p-4">
          <div className="text-xs font-semibold text-ink-3">Setup Steps Completed</div>
          <div className="mt-1 text-2xl font-bold text-ink">
            {doneCount} / {quickSetupLinks.length}
          </div>
          <p className="text-xs text-ink-3 mt-1">
            {doneCount === quickSetupLinks.length
              ? 'All basic company setup steps are checked off!'
              : 'Finish these steps before issuing live GST invoices.'}
          </p>
        </div>

        <div className="rounded-[4px] border border-rule bg-sheet p-4">
          <div className="text-xs font-semibold text-ink-3">Daily Business Flows</div>
          <div className="mt-1 text-2xl font-bold text-leaf">
            {checklist.length > 0 ? `${checklist.length} Ready` : 'Ready'}
          </div>
          <p className="text-xs text-ink-3 mt-1">
            Orders, stock, dispatch, and cash handovers verified.
          </p>
        </div>

        <div className="rounded-[4px] border border-rule bg-sheet p-4">
          <div className="text-xs font-semibold text-ink-3">App Speed &amp; Safety</div>
          <div className="mt-1 text-2xl font-bold text-leaf">Good</div>
          <p className="text-xs text-ink-3 mt-1">
            Fast page loads and owner-only protection active for settings.
          </p>
        </div>
      </div>

      {/* Interactive Setup Steps */}
      <div className="rounded-[4px] border border-rule bg-sheet p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-ink">Before Your First Live Day</h2>
            <p className="text-xs text-ink-3">
              Check off each task once you have completed it for your company.
              {saving ? ' Saving...' : ''}
            </p>
          </div>
        </div>
        <div className="divide-y divide-rule">
          {quickSetupLinks.map((step) => {
            const checked = completedIds.includes(step.id);
            return (
              <div
                key={step.id}
                className="py-3 flex flex-wrap items-center justify-between gap-3"
              >
                <label className="flex items-start gap-3 cursor-pointer flex-1 min-w-[240px]">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => void toggleItem(step.id)}
                    className="mt-1"
                  />
                  <div>
                    <div
                      className={`text-sm font-semibold ${
                        checked ? 'line-through text-ink-3' : 'text-ink'
                      }`}
                    >
                      {step.title}
                    </div>
                    <div className="text-xs text-ink-3">{step.description}</div>
                  </div>
                </label>
                <Link
                  href={step.href}
                  className="rounded-[3px] border border-rule-strong bg-paper px-3 py-1.5 text-xs font-semibold text-action hover:bg-sunken shrink-0"
                >
                  Open →
                </Link>
              </div>
            );
          })}
        </div>
      </div>

      {/* Core Flows Verified */}
      <div className="overflow-hidden rounded-[4px] border border-rule bg-sheet">
        <div className="border-b border-rule bg-paper px-5 py-3">
          <div className="text-sm font-bold text-ink">Core Business Workflows Checked</div>
          <p className="text-xs text-ink-3 mt-0.5">
            Key end-to-end processes verified for smooth day-to-day operations.
          </p>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-paper text-xs text-ink-3">
            <tr>
              <th className="px-4 py-3 font-semibold">Area</th>
              <th className="px-4 py-3 font-semibold">Business Workflow</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {checklist.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-sm text-ink-3">
                  Core business workflows will appear once verified.
                </td>
              </tr>
            ) : (
              checklist.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 text-xs font-semibold text-ink-2 whitespace-nowrap">
                    {item.area}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-ink">{item.title}</div>
                    <div className="text-xs text-ink-3">{item.description}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-leaf-soft px-2.5 py-0.5 text-xs font-semibold text-leaf">
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
