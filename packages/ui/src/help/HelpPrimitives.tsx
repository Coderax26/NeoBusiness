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
        {/* Quick Video Pill */}
        <div className="p-4 bg-teal-950/30 border border-teal-500/30 rounded-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-full bg-teal-500/20 text-teal-300 flex items-center justify-center font-bold text-lg">
              ▶
            </span>
            <div>
              <div className="text-xs font-bold text-white">Watch {videoDurationSec}s Walkthrough</div>
              <div className="text-[11px] text-zinc-400">Quick video explanation for this screen</div>
            </div>
          </div>
          <Button size="sm" variant="secondary" onClick={() => window.open(videoUrl || '#', '_blank')}>
            Play
          </Button>
        </div>

        {/* 3-Step Guide */}
        <div className="space-y-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">3-Step Workflow</h4>
          {steps.map((st) => (
            <div key={st.step} className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl flex gap-3.5">
              <span className="w-7 h-7 rounded-full bg-teal-600/30 border border-teal-500/40 text-teal-300 font-bold text-xs flex items-center justify-center shrink-0">
                {st.step}
              </span>
              <div>
                <div className="text-xs font-bold text-white">{st.title}</div>
                <p className="text-xs text-zinc-300 mt-1 leading-relaxed">{st.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-zinc-800 flex justify-end">
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
      <div className="bg-zinc-900/95 border border-teal-500/50 rounded-2xl p-5 shadow-2xl max-w-sm w-full pointer-events-auto backdrop-blur-md animate-fade-in">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-bold text-teal-400 uppercase tracking-wider">
            Step {currentIdx + 1} of {steps.length}
          </span>
          <button
            type="button"
            onClick={onComplete}
            className="text-xs text-zinc-400 hover:text-white"
          >
            Skip Tour
          </button>
        </div>
        <h4 className="text-sm font-bold text-white mb-1.5">{currentStep.title}</h4>
        <p className="text-xs text-zinc-300 leading-relaxed mb-4">{currentStep.content}</p>
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

