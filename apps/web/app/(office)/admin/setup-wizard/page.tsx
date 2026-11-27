'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button, Card, ProgressBar, Badge } from '@neo/ui';
import { validateGSTIN, SETUP_STEPS_CONFIG, calculateSetupProgress } from '@neo/shared';

export interface SetupStep {
  id: number;
  key: string;
  title: string;
  subtitle: string;
  description: string;
  routeHint?: string;
  status: 'PENDING' | 'COMPLETED' | 'SKIPPED';
}

export default function SetupWizardPage() {
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [steps, setSteps] = useState<SetupStep[]>(() =>
    SETUP_STEPS_CONFIG.map((s, idx) => ({
      ...s,
      status: idx < 3 ? 'COMPLETED' : idx === 3 ? 'PENDING' : 'PENDING',
    })),
  );

  const [companyName, setCompanyName] = useState('');
  const [gstin, setGstin] = useState('');
  const [gstinError, setGstinError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      fetch('/api/proxy/admin/company-profile').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/proxy/admin/rollout').then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([compRes, rollRes]) => {
        if (!active) return;
        if (compRes.status === 'fulfilled' && compRes.value) {
          const c = compRes.value.data || compRes.value;
          if (c.legalName) setCompanyName(String(c.legalName));
          if (c.gstin) setGstin(String(c.gstin));
        }
        if (rollRes.status === 'fulfilled' && rollRes.value) {
          const r = rollRes.value.data || rollRes.value;
          if (Array.isArray(r.setupSteps) && r.setupSteps.length > 0) {
            setSteps(r.setupSteps);
          }
        }
      })
      .catch(() => { });
    return () => {
      active = false;
    };
  }, []);

  const saveProgress = (updated: SetupStep[]) => {
    setSteps(updated);
    try {
      localStorage.setItem('neobus_setup_wizard_progress', JSON.stringify(updated));
    } catch { }
    fetch('/api/proxy/admin/rollout', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setupSteps: updated }),
    }).catch(() => { });
  };

  const completedCount = steps.filter((s) => s.status === 'COMPLETED').length;
  const progressPercent = Math.round((completedCount / steps.length) * 100);

  const markComplete = (idx: number) => {
    if (idx === 0) {
      const gstinVal = validateGSTIN(gstin);
      if (!gstinVal.valid) {
        setGstinError(gstinVal.error || 'Invalid GSTIN');
        return;
      }
      setGstinError(null);
    }
    const updated = [...steps];
    updated[idx].status = 'COMPLETED';
    saveProgress(updated);
    if (idx < steps.length - 1) {
      setCurrentStepIdx(idx + 1);
    }
  };

  const skipStep = (idx: number) => {
    const updated = [...steps];
    updated[idx].status = 'SKIPPED';
    saveProgress(updated);
    if (idx < steps.length - 1) {
      setCurrentStepIdx(idx + 1);
    }
  };

  const activeStep = steps[currentStepIdx];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Top Banner / Progress */}
      <div className="bg-sheet border border-rule rounded-[4px] p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-rule">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-action/15 text-action border border-action/30 mb-2">
              <span>🚀 First-Time Business Setup</span>
            </div>
            <h1 className="text-2xl font-semibold text-ink">Owner Setup Wizard</h1>
            <p className="text-xs text-ink-3 mt-1">
              Complete these 8 essential setup steps to prepare your system for live sales, inventory, and billing.
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs font-bold text-ink-3 uppercase tracking-wider">Overall Progress</div>
            <div className="text-2xl font-semibold text-action mt-0.5">{progressPercent}% Set Up</div>
            <div className="text-xs text-ink-3">{completedCount} of {steps.length} steps completed</div>
          </div>
        </div>

        <div className="mt-4">
          <ProgressBar value={progressPercent} tone={progressPercent === 100 ? 'success' : 'brand'} />
        </div>
      </div>

      {/* Grid: Step Navigator (Left) + Active Step Content (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Step list sidebar */}
        <div className="lg:col-span-4 space-y-2">
          {steps.map((s, idx) => {
            const isActive = idx === currentStepIdx;
            return (
              <button
                key={s.id}
                onClick={() => setCurrentStepIdx(idx)}
                className={`w-full text-left p-3.5 rounded-[4px] border transition-all flex items-start gap-3 ${isActive
                  ? 'bg-sunken border-action/30 shadow-md ring-1 ring-teal-500/40'
                  : 'bg-sheet border-rule hover:bg-sunken'
                  }`}
              >
                <div className="mt-0.5">
                  {s.status === 'COMPLETED' ? (
                    <span className="w-5 h-5 rounded-full bg-leaf-soft text-leaf flex items-center justify-center text-xs font-bold border border-leaf/30">
                      ✓
                    </span>
                  ) : s.status === 'SKIPPED' ? (
                    <span className="w-5 h-5 rounded-full bg-haldi-soft text-haldi flex items-center justify-center text-xs font-bold border border-haldi/30">
                      ⏭
                    </span>
                  ) : (
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold border ${isActive ? 'bg-action/20 text-action border-action/30' : 'bg-sunken text-ink-3 border-rule-strong'
                      }`}>
                      {s.id}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold truncate ${isActive ? 'text-white' : 'text-ink-2'}`}>
                      {s.title}
                    </span>
                  </div>
                  <p className="text-[11px] text-ink-3 truncate mt-0.5">{s.subtitle}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Active Step Panel */}
        <div className="lg:col-span-8">
          <Card className="p-6 space-y-6">
            <div className="border-b border-rule pb-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-action uppercase tracking-wider">
                  Step {activeStep.id} of {steps.length}
                </span>
                <Badge
                  tone={
                    activeStep.status === 'COMPLETED'
                      ? 'success'
                      : activeStep.status === 'SKIPPED'
                        ? 'warning'
                        : 'neutral'
                  }
                >
                  {activeStep.status}
                </Badge>
              </div>
              <h2 className="text-xl font-bold text-ink mt-1">{activeStep.title}</h2>
              <p className="text-xs text-ink-2 mt-1">{activeStep.description}</p>
            </div>

            {/* Step Content / Previews */}
            {activeStep.id === 1 && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-ink-2 mb-1">Company Registered Name</label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-sm text-ink focus:outline-none focus:border-action/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-2 mb-1">GSTIN (15 characters)</label>
                  <input
                    type="text"
                    value={gstin}
                    onChange={(e) => {
                      setGstin(e.target.value.toUpperCase());
                      setGstinError(null);
                    }}
                    placeholder="e.g. 27ABCDE1234F1Z5"
                    className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-sm text-ink font-mono uppercase focus:outline-none focus:border-action/30"
                  />
                  {gstinError && <p className="text-xs text-madder mt-1">{gstinError}</p>}
                </div>
                <div className="p-3 bg-paper rounded-[3px] border border-rule text-xs text-ink-3">
                  💡 Your GSTIN determines the default home state (e.g. <strong>27</strong> = Maharashtra) for IGST vs CGST/SGST determination on invoices.
                </div>
              </div>
            )}

            {activeStep.id >= 2 && activeStep.id <= 7 && (
              <div className="p-6 bg-paper border border-rule rounded-[4px] text-center space-y-4">
                <div className="text-3xl">📁</div>
                <div>
                  <h3 className="text-sm font-bold text-ink">Dedicated Master Workspace Available</h3>
                  <p className="text-xs text-ink-3 max-w-md mx-auto mt-1">
                    You can add records one by one through the interactive form or bulk-upload using our standard Excel/CSV templates.
                  </p>
                </div>
                {activeStep.routeHint && (
                  <Link href={activeStep.routeHint}>
                    <Button variant="secondary" size="sm">
                      Open {activeStep.title.replace(/^[0-9.]+\s*/, '')} Workspace ↗
                    </Button>
                  </Link>
                )}
              </div>
            )}

            {activeStep.id === 8 && (
              <div className="p-6 bg-action-soft border border-action/30 rounded-[4px] space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">⚖️</span>
                  <div>
                    <h3 className="text-sm font-bold text-ink">Opening Balances Sign-Off (OD-023)</h3>
                    <p className="text-xs text-ink-2">
                      Upload customer receivable ledgers and initial stock counts signed by the business owner.
                    </p>
                  </div>
                </div>
                <p className="text-xs text-ink-3">
                  Once opening balances are imported, opening ledger entries are locked and subsequent adjustments require approval.
                </p>
              </div>
            )}

            {/* Actions Footer */}
            <div className="pt-4 border-t border-rule flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                disabled={currentStepIdx === 0}
                onClick={() => setCurrentStepIdx((i) => Math.max(0, i - 1))}
              >
                ← Previous
              </Button>

              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={() => skipStep(currentStepIdx)}>
                  Skip for now
                </Button>
                <Button variant="primary" size="sm" onClick={() => markComplete(currentStepIdx)}>
                  {currentStepIdx === steps.length - 1 ? 'Finish Setup ✓' : 'Mark Done & Next →'}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
