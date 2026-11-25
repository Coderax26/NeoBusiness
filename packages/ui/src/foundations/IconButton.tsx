import React from 'react';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string; // Required for WCAG 2.1 AA accessibility
  size?: 'sm' | 'md' | 'floor';
  variant?: 'ghost' | 'secondary' | 'danger';
}

export const IconButton: React.FC<IconButtonProps> = ({
  children,
  size = 'md',
  variant = 'ghost',
  className = '',
  'aria-label': ariaLabel,
  ...props
}) => {
  const sizeClasses = {
    sm: 'w-9 h-9 min-h-[36px] min-w-[36px] text-[13px]',
    md: 'w-10 h-10 min-h-[40px] min-w-[40px] text-[14px]',
    floor: 'w-14 h-14 min-h-[56px] min-w-[56px] text-lg rounded-[6px]',
  };

  const variantClasses = {
    ghost: 'hover:bg-paper text-ink-2 hover:text-ink',
    secondary: 'bg-sheet hover:bg-paper text-ink border border-rule-strong',
    danger: 'hover:bg-madder-soft text-madder',
  };

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className={`inline-flex items-center justify-center rounded-[3px] transition-colors focus:outline-none focus:ring-2 focus:ring-action disabled:opacity-40 disabled:cursor-not-allowed ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
