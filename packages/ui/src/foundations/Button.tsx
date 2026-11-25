import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'brand';
  size?: 'sm' | 'md' | 'lg' | 'floor';
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  className = '',
  disabled,
  ...props
}) => {
  const baseClasses =
    'inline-flex items-center justify-center gap-1.5 font-medium rounded-[3px] transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-action disabled:opacity-50 disabled:cursor-not-allowed select-none whitespace-nowrap';

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-[13px] min-h-[34px]',
    md: 'px-4 py-2 text-[14px] min-h-[40px]', // Desktop min 40px (§4 U16)
    lg: 'px-5 py-2.5 text-[15px] min-h-[48px]',
    floor: 'px-6 py-4 text-lg font-bold min-h-[56px] min-w-[56px] rounded-[6px]', // Floor Mode 56px (§4 U16)
  };

  const variantClasses = {
    primary:
      'bg-action hover:bg-action-hover text-white border border-action',
    brand:
      'bg-action hover:bg-action-hover text-white border border-action',
    secondary:
      'bg-sheet hover:bg-paper text-ink border border-rule-strong',
    danger:
      'bg-madder hover:opacity-90 text-white border border-madder',
    ghost:
      'bg-transparent hover:bg-paper text-ink-2 hover:text-ink border border-transparent',
  };

  return (
    <button
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <svg className="animate-spin h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          Working...
        </span>
      ) : (
        children
      )}
    </button>
  );
};
