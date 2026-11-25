import React, { useEffect } from 'react';
import { Button } from './Button.js';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}

export const Dialog: React.FC<DialogProps> = ({
  open,
  onClose,
  title,
  description,
  children,
  maxWidth = 'md',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className={`w-full ${maxWidthClasses[maxWidth]} bg-sheet border border-rule-strong rounded-[4px] p-6 shadow-xl text-ink`}
      >
        <div className="flex items-start justify-between pb-3 mb-4 border-b border-rule">
          <div>
            <h3 id="dialog-title" className="text-[20px] font-serif font-medium text-ink tracking-tight">
              {title}
            </h3>
            {description && <p className="text-[13px] text-ink-2 mt-1">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-3 hover:text-ink p-1.5 text-sm rounded-[3px] hover:bg-paper focus:outline-none focus:ring-2 focus:ring-action"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
};

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  consequences: string; // U7: Explicit statement of business consequence
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  consequences,
  confirmLabel = 'Confirm Action',
  cancelLabel = 'Cancel',
  tone = 'primary',
  loading = false,
  onConfirm,
  onCancel,
}) => {
  return (
    <Dialog open={open} onClose={onCancel} title={title}>
      <div className="my-3 p-4 rounded-[3px] bg-haldi-soft border-l-4 border-haldi text-ink text-[14px]">
        <div className="font-semibold flex items-center gap-2 mb-1 text-haldi text-[13px]">
          <span>What will happen</span>
        </div>
        <p className="leading-relaxed text-[13.5px] text-ink-2">{consequences}</p>
      </div>

      <div className="flex justify-end gap-2.5 mt-6">
        <Button variant="secondary" onClick={onCancel} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button
          variant={tone === 'danger' ? 'danger' : 'primary'}
          onClick={onConfirm}
          loading={loading}
        >
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
};
