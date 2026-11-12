import React, { forwardRef } from 'react';

export interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  helperText?: string;
  error?: string;
  required?: boolean;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, helperText, error, required, className = '', id, ...props }, ref) => {
    const inputId = id || `input-${label.replace(/\s+/g, '-').toLowerCase()}`;

    return (
      <div className="w-full">
        <label
          htmlFor={inputId}
          className="block text-xs font-semibold text-zinc-300 mb-1.5 select-none"
        >
          {label}
          {required && <span className="text-rose-400 ml-1" aria-hidden="true">*</span>}
        </label>
        <input
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
          required={required}
          className={`w-full bg-zinc-900 border rounded-lg px-3.5 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500 min-h-[40px] transition-colors ${
            error ? 'border-rose-500/80 bg-rose-950/10' : 'border-zinc-800 focus:border-teal-500'
          } ${className}`}
          {...props}
        />
        {error ? (
          <p id={`${inputId}-error`} role="alert" className="text-xs text-rose-400 mt-1 font-medium">
            {error}
          </p>
        ) : helperText ? (
          <p id={`${inputId}-helper`} className="text-xs text-zinc-400 mt-1">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  },
);
TextField.displayName = 'TextField';

export interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  helperText?: string;
  error?: string;
  required?: boolean;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ label, helperText, error, required, className = '', id, ...props }, ref) => {
    const inputId = id || `textarea-${label.replace(/\s+/g, '-').toLowerCase()}`;

    return (
      <div className="w-full">
        <label
          htmlFor={inputId}
          className="block text-xs font-semibold text-zinc-300 mb-1.5 select-none"
        >
          {label}
          {required && <span className="text-rose-400 ml-1" aria-hidden="true">*</span>}
        </label>
        <textarea
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error)}
          required={required}
          rows={props.rows || 3}
          className={`w-full bg-zinc-900 border rounded-lg px-3.5 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-colors ${
            error ? 'border-rose-500/80 bg-rose-950/10' : 'border-zinc-800 focus:border-teal-500'
          } ${className}`}
          {...props}
        />
        {error ? (
          <p role="alert" className="text-xs text-rose-400 mt-1 font-medium">
            {error}
          </p>
        ) : helperText ? (
          <p className="text-xs text-zinc-400 mt-1">{helperText}</p>
        ) : null}
      </div>
    );
  },
);
TextArea.displayName = 'TextArea';

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: SelectOption[];
  helperText?: string;
  error?: string;
  required?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, helperText, error, required, className = '', id, ...props }, ref) => {
    const inputId = id || `select-${label.replace(/\s+/g, '-').toLowerCase()}`;

    return (
      <div className="w-full">
        <label
          htmlFor={inputId}
          className="block text-xs font-semibold text-zinc-300 mb-1.5 select-none"
        >
          {label}
          {required && <span className="text-rose-400 ml-1" aria-hidden="true">*</span>}
        </label>
        <select
          ref={ref}
          id={inputId}
          required={required}
          className={`w-full bg-zinc-900 border rounded-lg px-3.5 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-500 min-h-[40px] transition-colors ${
            error ? 'border-rose-500/80' : 'border-zinc-800 focus:border-teal-500'
          } ${className}`}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-zinc-900 text-zinc-100">
              {opt.label} {opt.hint ? `(${opt.hint})` : ''}
            </option>
          ))}
        </select>
        {error ? (
          <p role="alert" className="text-xs text-rose-400 mt-1 font-medium">
            {error}
          </p>
        ) : helperText ? (
          <p className="text-xs text-zinc-400 mt-1">{helperText}</p>
        ) : null}
      </div>
    );
  },
);
Select.displayName = 'Select';
