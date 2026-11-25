import React from 'react';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand';

export interface BadgeProps {
  children: React.ReactNode;
  tone?: BadgeTone;
  variant?: BadgeTone | string;
  size?: 'sm' | 'md';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  tone,
  variant,
  size = 'md',
  className = '',
}) => {
  const resolvedTone: BadgeTone = (tone ?? variant ?? 'neutral') as BadgeTone;
  const toneClasses: Record<BadgeTone, string> = {
    brand: 'bg-action-soft text-action border-action/25',
    success: 'bg-leaf-soft text-leaf border-leaf/25',
    warning: 'bg-haldi-soft text-haldi border-haldi/25',
    danger: 'bg-madder-soft text-madder border-madder/25',
    info: 'bg-action-soft text-action border-action/25',
    neutral: 'bg-sunken text-ink-2 border-rule-strong',
  };

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[13px]',
    md: 'px-2.5 py-0.5 text-[13px]',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-[3px] border ${toneClasses[resolvedTone] ?? toneClasses.neutral} ${sizeClasses[size]} ${className}`}
    >
      {children}
    </span>
  );
};
