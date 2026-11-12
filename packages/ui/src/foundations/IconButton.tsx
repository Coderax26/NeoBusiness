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
    sm: 'w-9 h-9 min-h-[36px] min-w-[36px] text-xs',
    md: 'w-10 h-10 min-h-[40px] min-w-[40px] text-sm',
    floor: 'w-14 h-14 min-h-[56px] min-w-[56px] text-lg rounded-xl',
  };

  const variantClasses = {
    ghost: 'hover:bg-zinc-800 text-zinc-300 hover:text-white',
    secondary: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700',
    danger: 'hover:bg-rose-500/20 text-rose-400 hover:text-rose-300',
  };

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className={`inline-flex items-center justify-center rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-40 disabled:cursor-not-allowed ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

