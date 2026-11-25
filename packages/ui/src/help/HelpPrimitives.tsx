import React, { useState } from 'react';
import { Drawer } from '../foundations/Drawer.js';
import { Button } from '../foundations/Button.js';

export interface GuideStep {
  step: number;
  title: string;
  description: string;
}

export interface HowItWorksDrawerProps {
  open: boolean;
  onClose: () => void;
  pageTitle: string;
  videoDurationSec?: number;
  videoUrl?: string;
  steps: GuideStep[];
}

export const HowItWorksDrawer: React.FC<HowItWorksDrawerProps> = ({
  open,
  onClose,
  pageTitle,
  videoDurationSec = 60,
  videoUrl,
  steps,
}) => {
  return (
    <Drawer open={open} onClose={onClose} title={`How ${pageTitle} Works`} subtitle="Simple 3-step guide">
      <div className="flex flex-col gap-6">
        <div className="p-4 bg-paper border border-rule rounded-[4px] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-full bg-action text-white flex items-center justify-center font-semibold text-sm">
              ▶
            </span>
            <div>
              <div className="text-[14px] font-semibold text-ink">Watch {videoDurationSec}s Walkthrough</div>
              <div className="text-[13px] text-ink-3">Quick video explanation for this screen</div>
            </div>
          </div>
          <Button size="sm" variant="secondary" onClick={() => window.open(videoUrl || '#', '_blank')}>
            Play
          </Button>
        </div>

        <div className="space-y-3">
          <h4 className="text-[13px] font-semibold text-ink pb-1.5 border-b border-ink">3-Step Workflow</h4>
          {steps.map((st) => (
            <div key={st.step} className="p-4 bg-sheet border border-rule rounded-[4px] flex gap-3.5">
              <span className="w-7 h-7 rounded-full bg-action-soft border border-action/30 text-action font-semibold text-[13px] flex items-center justify-center shrink-0">
                {st.step}
              </span>
              <div>
                <div className="text-[14px] font-semibold text-ink">{st.title}</div>
                <p className="text-[13.5px] text-ink-2 mt-1 leading-relaxed">{st.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-rule flex justify-end">
          <Button variant="primary" size="sm" onClick={onClose}>
            Got it, let&apos;s start
          </Button>
        </div>
      </div>
    </Drawer>
  );
};

export interface TourStep {
  targetElementId: string;
  title: string;
  content: string;
}

export const TourEngine: React.FC<{
  steps: TourStep[];
  active: boolean;
  onComplete: () => void;
}> = ({ steps, active, onComplete }) => {
  const [currentIdx, setCurrentIdx] = useState(0);

  if (!active || steps.length === 0) return null;

  const currentStep = steps[currentIdx];
  const isLast = currentIdx === steps.length - 1;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center p-4">
      <div className="bg-sheet border border-rule-strong rounded-[4px] p-5 shadow-2xl max-w-sm w-full pointer-events-auto">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[13px] font-semibold text-action">
            Step {currentIdx + 1} of {steps.length}
          </span>
          <button
            type="button"
            onClick={onComplete}
            className="text-[13px] text-ink-3 hover:text-ink"
          >
            Skip Tour
          </button>
        </div>
        <h4 className="text-[16px] font-serif font-medium text-ink mb-1.5">{currentStep.title}</h4>
        <p className="text-[13.5px] text-ink-2 leading-relaxed mb-4">{currentStep.content}</p>
        <div className="flex justify-between items-center">
          <Button
            size="sm"
            variant="ghost"
            disabled={currentIdx === 0}
            onClick={() => setCurrentIdx((i) => i - 1)}
          >
            Back
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              if (isLast) onComplete();
              else setCurrentIdx((i) => i + 1);
            }}
          >
            {isLast ? 'Finish Tour' : 'Next →'}
          </Button>
        </div>
      </div>
    </div>
  );
};
