import React from 'react';
import { Button } from './Button.js';

export interface BannerProps {
  title?: string;
  children: React.ReactNode;
  tone?: 'info' | 'warning' | 'danger' | 'success';
  action?: { label: string; onClick: () => void };
  className?: string;
}

export const Banner: React.FC<BannerProps> = ({
  title,
  children,
  tone = 'info',
  action,
  className = '',
}) => {
  const toneClasses = {
    info: 'bg-sky-950/40 border-sky-500/30 text-sky-200',
    warning: 'bg-amber-950/40 border-amber-500/30 text-amber-200',
    danger: 'bg-rose-950/40 border-rose-500/30 text-rose-200',
    success: 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200',
  };

  return (
    <div
      role="alert"
      className={`p-4 rounded-xl border flex items-center justify-between gap-4 text-xs ${toneClasses[tone]} ${className}`}
    >
      <div>
        {title && <div className="font-bold mb-0.5 text-sm">{title}</div>}
        <div className="leading-relaxed">{children}</div>
      </div>
      {action && (
        <Button size="sm" variant="secondary" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
};

export const Skeleton: React.FC<{
  variant?: 'text' | 'rect' | 'circle';
  width?: string | number;
  height?: string | number;
  className?: string;
}> = ({ variant = 'rect', width, height, className = '' }) => {
  const roundedClasses = {
    text: 'rounded',
    rect: 'rounded-xl',
    circle: 'rounded-full',
  };

  return (
    <div
      className={`animate-pulse bg-zinc-800/70 ${roundedClasses[variant]} ${className}`}
      style={{
        width: width ?? '100%',
        height: height ?? (variant === 'text' ? '1rem' : '4rem'),
      }}
    />
  );
};

export interface EmptyStateProps {
  title: string;
  description: string;
  icon?: string;
  action?: { label: string; onClick: () => void };
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon = '📭',
  action,
}) => {
  return (
    <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/20 max-w-lg mx-auto">
      <div className="text-4xl mb-3">{icon}</div>
      <h4 className="text-base font-bold text-white tracking-tight">{title}</h4>
      <p className="text-xs text-zinc-400 mt-1 mb-5 max-w-sm mx-auto leading-relaxed">
        {description}
      </p>
      {action && (
        <Button variant="primary" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
};

export interface ErrorStateProps {
  title?: string;
  message: string;
  resolutionHint?: string; // U12: Tells user how to fix
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something needs attention',
  message,
  resolutionHint,
  onRetry,
}) => {
  return (
    <div
      role="alert"
      className="p-6 rounded-2xl bg-rose-950/20 border border-rose-500/30 text-rose-200 text-center max-w-md mx-auto"
    >
      <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-300 font-bold flex items-center justify-center mx-auto mb-3">
        ✕
      </div>
      <h4 className="text-sm font-bold text-white">{title}</h4>
      <p className="text-xs text-rose-300 mt-1 mb-2 leading-relaxed">{message}</p>
      {resolutionHint && (
        <p className="text-[11px] text-zinc-400 mb-4 bg-zinc-900/60 p-2 rounded-lg border border-zinc-800">
          💡 <span className="font-semibold text-zinc-200">How to fix:</span> {resolutionHint}
        </p>
      )}
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Try Again
        </Button>
      )}
    </div>
  );
};

export interface StepperProps {
  steps: { id: string; label: string; description?: string }[];
  currentStepIndex: number;
}

export const Stepper: React.FC<StepperProps> = ({ steps, currentStepIndex }) => {
  return (
    <nav aria-label="Progress" className="my-4">
      <ol className="flex items-center justify-between w-full">
        {steps.map((step, idx) => {
          const isDone = idx < currentStepIndex;
          const isCurrent = idx === currentStepIndex;

          return (
            <li key={step.id} className="flex-1 flex items-center">
              <div className="flex items-center gap-2">
                <span
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    isDone
                      ? 'bg-teal-600 text-white'
                      : isCurrent
                      ? 'bg-teal-500/20 border-2 border-teal-400 text-teal-300'
                      : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                  }`}
                >
                  {isDone ? '✓' : idx + 1}
                </span>
                <span
                  className={`text-xs font-medium ${
                    isCurrent ? 'text-white font-bold' : isDone ? 'text-zinc-300' : 'text-zinc-500'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-3 ${
                    idx < currentStepIndex ? 'bg-teal-600' : 'bg-zinc-800'
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export const ProgressBar: React.FC<{
  value: number; // 0 to 100
  tone?: 'brand' | 'success' | 'warning' | 'danger';
  className?: string;
}> = ({ value, tone = 'brand', className = '' }) => {
  const toneClasses = {
    brand: 'bg-teal-500',
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    danger: 'bg-rose-500',
  };

  const clamped = Math.min(Math.max(value, 0), 100);

  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`w-full h-2 rounded-full bg-zinc-800 overflow-hidden ${className}`}
    >
      <div
        className={`h-full transition-all duration-300 ${toneClasses[tone]}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
};

export const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded bg-zinc-800 border border-zinc-700 text-zinc-300 shadow-xs">
      {children}
    </kbd>
  );
};
