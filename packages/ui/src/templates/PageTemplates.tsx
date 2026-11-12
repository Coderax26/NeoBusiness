import React from 'react';
import { Button } from '../foundations/Button.js';
import { Stepper } from '../foundations/FeedbackStates.js';
import { StatusPill } from '../foundations/StatusPill.js';
import { Tabs } from '../foundations/Card.js';

export interface ListPageTemplateProps {
  title: string;
  count?: number;
  primaryAction?: { label: string; onClick: () => void };
  kpiStrip?: React.ReactNode;
  children: React.ReactNode;
}

export const ListPageTemplate: React.FC<ListPageTemplateProps> = ({
  title,
  count,
  primaryAction,
  kpiStrip,
  children,
}) => {
  return (
    <div className="w-full flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
          {count !== undefined && (
            <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
              {count} total
            </span>
          )}
        </div>
        {primaryAction && (
          <Button variant="primary" onClick={primaryAction.onClick}>
            {primaryAction.label}
          </Button>
        )}
      </div>

      {kpiStrip && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{kpiStrip}</div>}

      <div className="w-full">{children}</div>
    </div>
  );
};

export interface DetailPageTemplateProps {
  docNumber: string;
  entityType: string;
  status: string;
  lifecycleSteps?: { id: string; label: string }[];
  currentStepIndex?: number;
  tabs: { id: string; label: string }[];
  activeTabId: string;
  onTabChange: (id: string) => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export const DetailPageTemplate: React.FC<DetailPageTemplateProps> = ({
  docNumber,
  entityType,
  status,
  lifecycleSteps,
  currentStepIndex = 0,
  tabs,
  activeTabId,
  onTabChange,
  actions,
  children,
}) => {
  return (
    <div className="w-full flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold font-mono tracking-tight text-white">{docNumber}</h1>
          <StatusPill entity={entityType} status={status} />
        </div>
        {actions && <div className="flex items-center gap-2.5">{actions}</div>}
      </div>

      {lifecycleSteps && lifecycleSteps.length > 0 && (
        <div className="bg-zinc-900/40 p-4 rounded-xl border border-zinc-800">
          <Stepper steps={lifecycleSteps} currentStepIndex={currentStepIndex} />
        </div>
      )}

      <Tabs tabs={tabs} activeId={activeTabId} onChange={onTabChange} />

      <div className="mt-2">{children}</div>
    </div>
  );
};

export interface FormWizardTemplateProps {
  title: string;
  steps: { id: string; label: string }[];
  currentStepIndex: number;
  onBack?: () => void;
  onNext?: () => void;
  onSaveDraft?: () => void;
  isLastStep?: boolean;
  submitLabel?: string;
  loading?: boolean;
  children: React.ReactNode;
}

export const FormWizardTemplate: React.FC<FormWizardTemplateProps> = ({
  title,
  steps,
  currentStepIndex,
  onBack,
  onNext,
  onSaveDraft,
  isLastStep = false,
  submitLabel = 'Complete & Submit',
  loading = false,
  children,
}) => {
  return (
    <div className="w-full max-w-4xl mx-auto p-6 pb-24 flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>

      <div className="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800">
        <Stepper steps={steps} currentStepIndex={currentStepIndex} />
      </div>

      <div className="flex flex-col gap-6">{children}</div>

      {/* Sticky Bottom Bar (§4 U3) */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-zinc-900/95 backdrop-blur-md border-t border-zinc-800 z-40 flex items-center justify-between max-w-5xl mx-auto rounded-t-2xl shadow-2xl">
        <div>
          {onSaveDraft && (
            <Button variant="secondary" onClick={onSaveDraft} disabled={loading}>
              Save Draft
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {onBack && currentStepIndex > 0 && (
            <Button variant="secondary" onClick={onBack} disabled={loading}>
              Back
            </Button>
          )}
          {onNext && (
            <Button variant="primary" onClick={onNext} loading={loading}>
              {isLastStep ? submitLabel : 'Next Step →'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export const FloorScreenTemplate: React.FC<{
  title: string;
  shiftBadge?: string;
  offline?: boolean;
  children: React.ReactNode;
}> = ({ title, shiftBadge = 'Morning Shift', offline = false, children }) => {
  return (
    <div className="min-h-screen bg-black text-white p-5 flex flex-col select-none">
      <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-black tracking-tight">{title}</h1>
          <span className="text-xs font-bold px-2.5 py-1 rounded bg-zinc-800 text-zinc-300">
            {shiftBadge}
          </span>
        </div>
        {offline && (
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40">
            ● Offline Mode
          </span>
        )}
      </div>

      <div className="flex-1 mt-6">{children}</div>
    </div>
  );
};

