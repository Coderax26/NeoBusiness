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
    info: 'bg-action-soft border-action/40 text-ink',
    warning: 'bg-haldi-soft border-haldi/40 text-ink',
    danger: 'bg-madder-soft border-madder/40 text-ink',
    success: 'bg-leaf-soft border-leaf/40 text-ink',
  };

  return (
    <div
      role="alert"
      className={`p-4 rounded-[3px] border-l-4 border ${toneClasses[tone]} flex items-center justify-between gap-4 text-[13.5px] ${className}`}
    >
      <div>
        {title && <div className="font-semibold mb-0.5 text-[14px]">{title}</div>}
        <div className="leading-relaxed text-ink-2">{children}</div>
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
    text: 'rounded-[3px]',
    rect: 'rounded-[4px]',
    circle: 'rounded-full',
  };

  return (
    <div
      className={`animate-pulse bg-sunken ${roundedClasses[variant]} ${className}`}
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
  action,
}) => {
  return (
    <div className="text-center py-10 px-6 rounded-[4px] border border-dashed border-rule-strong bg-paper/50 max-w-lg mx-auto">
      <div className="w-10 h-10 rounded-full border border-rule-strong bg-sheet text-ink-3 flex items-center justify-center mx-auto mb-3 text-sm font-mono">
        —
      </div>
      <h4 className="text-[16px] font-serif font-medium text-ink">{title}</h4>
      <p className="text-[13.5px] text-ink-2 mt-1 mb-5 max-w-sm mx-auto leading-relaxed">
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
      className="p-6 rounded-[4px] bg-madder-soft border border-madder/30 text-ink text-center max-w-md mx-auto"
    >
      <div className="w-9 h-9 rounded-full bg-madder text-white font-bold flex items-center justify-center mx-auto mb-3 text-sm">
        !
      </div>
      <h4 className="text-[15px] font-semibold text-ink">{title}</h4>
      <p className="text-[13.5px] text-madder mt-1 mb-3 leading-relaxed">{message}</p>
      {resolutionHint && (
        <p className="text-[13px] text-ink-2 mb-4 bg-sheet p-2.5 rounded-[3px] border border-rule">
          <span className="font-semibold text-ink">How to fix:</span> {resolutionHint}
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
    <nav aria-label="Progress" className="my-3">
      <ol className="flex items-center justify-between w-full">
        {steps.map((step, idx) => {
          const isDone = idx < currentStepIndex;
          const isCurrent = idx === currentStepIndex;

          return (
            <li key={step.id} className="flex-1 flex items-center">
              <div className="flex items-center gap-2">
                <span
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-semibold transition-colors ${
                    isDone
                      ? 'bg-leaf text-white'
                      : isCurrent
                      ? 'bg-sheet border-2 border-action text-action'
                      : 'bg-paper text-ink-3 border border-rule-strong'
                  }`}
                >
                  {isDone ? '✓' : idx + 1}
                </span>
                <span
                  className={`text-[13px] ${
                    isCurrent ? 'text-action font-semibold' : isDone ? 'text-ink font-medium' : 'text-ink-3'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <div
                  className={`flex-1 h-px mx-3 ${
                    idx < currentStepIndex ? 'bg-leaf' : 'bg-rule-strong'
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
    brand: 'bg-action',
    success: 'bg-leaf',
    warning: 'bg-haldi',
    danger: 'bg-madder',
  };

  const clamped = Math.min(Math.max(value, 0), 100);

  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`w-full h-2 rounded-[2px] bg-sunken overflow-hidden ${className}`}
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
    <kbd className="px-1.5 py-0.5 text-[12px] font-mono font-medium rounded-[3px] bg-sheet border border-rule-strong border-b-2 text-ink-3">
      {children}
    </kbd>
  );
};
