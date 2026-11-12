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
    'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 disabled:opacity-50 disabled:cursor-not-allowed select-none';

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs min-h-[36px]',
    md: 'px-4 py-2 text-sm min-h-[40px]', // Desktop min 40px (§4 U16)
    lg: 'px-5 py-2.5 text-base min-h-[48px]',
    floor: 'px-6 py-4 text-lg font-bold min-h-[56px] min-w-[56px] rounded-xl', // Floor Mode 56px (§4 U16)
  };

  const variantClasses = {
    primary:
      'bg-teal-600 hover:bg-teal-500 text-white shadow-md shadow-teal-950/40 border border-teal-500/40',
    brand:
      'bg-teal-600 hover:bg-teal-500 text-white shadow-md shadow-teal-950/40 border border-teal-500/40',
    secondary:
      'bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700',
    danger:
      'bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-950/40 border border-rose-500/40',
    ghost:
      'bg-transparent hover:bg-zinc-800/60 text-zinc-300 border border-transparent',
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
          Loading...
        </span>
      ) : (
        children
      )}
    </button>
  );
};

