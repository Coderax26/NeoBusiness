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
          className="block text-[13px] font-medium text-ink-2 mb-1.5 select-none"
        >
          {label}
          {required && <span className="text-madder ml-1" aria-hidden="true">*</span>}
        </label>
        <input
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
          required={required}
          className={`w-full bg-sheet border rounded-[3px] px-3.5 py-2 text-[14.5px] text-ink placeholder-ink-3 focus:outline-none focus:ring-2 focus:ring-action/25 min-h-[40px] transition-colors ${
            error ? 'border-madder bg-madder-soft' : 'border-rule-strong focus:border-action'
          } ${className}`}
          {...props}
        />
        {error ? (
          <p id={`${inputId}-error`} role="alert" className="text-[13px] text-madder mt-1 font-medium">
            {error}
          </p>
        ) : helperText ? (
          <p id={`${inputId}-helper`} className="text-[13px] text-ink-3 mt-1">
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
          className="block text-[13px] font-medium text-ink-2 mb-1.5 select-none"
        >
          {label}
          {required && <span className="text-madder ml-1" aria-hidden="true">*</span>}
        </label>
        <textarea
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error)}
          required={required}
          rows={props.rows || 3}
          className={`w-full bg-sheet border rounded-[3px] px-3.5 py-2 text-[14.5px] text-ink placeholder-ink-3 focus:outline-none focus:ring-2 focus:ring-action/25 transition-colors ${
            error ? 'border-madder bg-madder-soft' : 'border-rule-strong focus:border-action'
          } ${className}`}
          {...props}
        />
        {error ? (
          <p role="alert" className="text-[13px] text-madder mt-1 font-medium">
            {error}
          </p>
        ) : helperText ? (
          <p className="text-[13px] text-ink-3 mt-1">{helperText}</p>
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
          className="block text-[13px] font-medium text-ink-2 mb-1.5 select-none"
        >
          {label}
          {required && <span className="text-madder ml-1" aria-hidden="true">*</span>}
        </label>
        <select
          ref={ref}
          id={inputId}
          required={required}
          className={`w-full bg-sheet border rounded-[3px] px-3.5 py-2 text-[14.5px] text-ink focus:outline-none focus:ring-2 focus:ring-action/25 min-h-[40px] transition-colors ${
            error ? 'border-madder' : 'border-rule-strong focus:border-action'
          } ${className}`}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-sheet text-ink">
              {opt.label} {opt.hint ? `(${opt.hint})` : ''}
            </option>
          ))}
        </select>
        {error ? (
          <p role="alert" className="text-[13px] text-madder mt-1 font-medium">
            {error}
          </p>
        ) : helperText ? (
          <p className="text-[13px] text-ink-3 mt-1">{helperText}</p>
        ) : null}
      </div>
    );
  },
);
Select.displayName = 'Select';
