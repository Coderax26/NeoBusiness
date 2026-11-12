import React, { useEffect, useState } from 'react';
import { Button } from './Button.js';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  width?: 'md' | 'lg' | 'xl';
}

export const Drawer: React.FC<DrawerProps> = ({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = 'lg',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const widthClasses = {
    md: 'max-w-md',
    lg: 'max-w-xl',
    xl: 'max-w-2xl',
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs flex justify-end">
      <div
        role="dialog"
        aria-modal="true"
        className={`w-full ${widthClasses[width]} h-full bg-zinc-900 border-l border-zinc-800 flex flex-col shadow-2xl animate-slide-left`}
      >
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">{title}</h3>
            {subtitle && <p className="text-xs text-zinc-400 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 focus:outline-none"
            aria-label="Close drawer"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
};

export interface ToastItem {
  id: string;
  message: string;
  tone?: 'success' | 'warning' | 'danger' | 'info';
  undoAction?: () => void; // U9: 10s Undo action
  durationMs?: number;
}

export const Toast: React.FC<{
  toast: ToastItem;
  onDismiss: (id: string) => void;
}> = ({ toast, onDismiss }) => {
  const [secondsRemaining, setSecondsRemaining] = useState(10);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsRemaining((s) => {
        if (s <= 1) {
          clearInterval(timer);
          onDismiss(toast.id);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [toast.id, onDismiss]);

  return (
    <div
      role="status"
      className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-700 shadow-2xl text-sm text-zinc-100 min-w-[320px] max-w-md animate-slide-up"
    >
      <div className="flex items-center gap-2">
        <span className="text-emerald-400 font-bold">✓</span>
        <span>{toast.message}</span>
      </div>

      <div className="flex items-center gap-2">
        {toast.undoAction && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              toast.undoAction?.();
              onDismiss(toast.id);
            }}
            className="text-xs text-teal-300 hover:text-teal-200 border-teal-500/40"
          >
            Undo ({secondsRemaining}s)
          </Button>
        )}
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className="text-zinc-500 hover:text-zinc-300 text-xs p-1"
          aria-label="Dismiss toast"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

