'use client';

import React, { useState } from 'react';
import { Dialog, Button, Kbd } from '@neo/ui';

export interface HelpModalProps {
  open: boolean;
  onClose: () => void;
  onStartTour?: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ open, onClose, onStartTour }) => {
  const [tab, setTab] = useState<'shortcuts' | 'tour' | 'support'>('shortcuts');

  const shortcuts = [
    { key: 'Ctrl + K', description: 'Open universal command palette & search' },
    { key: 'N', description: 'Create new record (in current screen context)' },
    { key: '/', description: 'Focus search input on any table' },
    { key: 'G then O', description: 'Quick jump to Sales Orders' },
    { key: 'G then I', description: 'Quick jump to Invoices' },
    { key: 'Esc', description: 'Close any active modal, drawer or palette' },
    { key: '?', description: 'Open this help & shortcuts dialog' },
  ];

  return (
    <Dialog open={open} onClose={onClose} title="Help, Shortcuts & Guidance" maxWidth="lg">
      <div className="flex border-b border-zinc-800 gap-4 mb-4">
        <button
          type="button"
          onClick={() => setTab('shortcuts')}
          className={`pb-2.5 text-xs font-semibold border-b-2 ${
            tab === 'shortcuts'
              ? 'border-teal-400 text-teal-300'
              : 'border-transparent text-zinc-400 hover:text-white'
          }`}
        >
          Keyboard Shortcuts (⚡)
        </button>
        <button
          type="button"
          onClick={() => setTab('tour')}
          className={`pb-2.5 text-xs font-semibold border-b-2 ${
            tab === 'tour'
              ? 'border-teal-400 text-teal-300'
              : 'border-transparent text-zinc-400 hover:text-white'
          }`}
        >
          Product Tours (🎓)
        </button>
        <button
          type="button"
          onClick={() => setTab('support')}
          className={`pb-2.5 text-xs font-semibold border-b-2 ${
            tab === 'support'
              ? 'border-teal-400 text-teal-300'
              : 'border-transparent text-zinc-400 hover:text-white'
          }`}
        >
          Support & Contact (💬)
        </button>
      </div>

      {tab === 'shortcuts' && (
        <div className="space-y-2.5">
          <p className="text-xs text-zinc-400 mb-3">
            Power user shortcuts to navigate NeoBus without using your mouse:
          </p>
          <div className="divide-y divide-zinc-800 border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950/40">
            {shortcuts.map((sc, idx) => (
              <div key={idx} className="p-3 flex items-center justify-between text-xs">
                <span className="text-zinc-300">{sc.description}</span>
                <Kbd>{sc.key}</Kbd>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'tour' && (
        <div className="space-y-4 text-xs text-zinc-300">
          <p>
            Learn how your role workspace functions with interactive step-by-step guidance.
          </p>
          <div className="p-4 bg-teal-950/20 border border-teal-500/30 rounded-xl flex items-center justify-between">
            <div>
              <div className="font-bold text-white text-sm">Interactive Workspace Tour</div>
              <p className="text-zinc-400 text-[11px] mt-0.5">
                Takes ~90 seconds. Highlights topbar, navigation, site switching, and approvals.
              </p>
            </div>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                onClose();
                onStartTour?.();
              }}
            >
              Start Tour ▶
            </Button>
          </div>
        </div>
      )}

      {tab === 'support' && (
        <div className="space-y-4 text-xs text-zinc-300">
          <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
            <div className="font-bold text-white text-sm">Need immediate technical assistance?</div>
            <p className="text-zinc-400">
              For system help, hardware questions, or report customization:
            </p>
            <div className="pt-2 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span>💬 WhatsApp Support:</span>
                <strong className="text-teal-300 font-mono">+91 98230 00000</strong>
              </div>
              <div className="flex items-center gap-2">
                <span>📧 Operations Email:</span>
                <strong className="text-teal-300">support@neobus.in</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <Button size="sm" variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </Dialog>
  );
};

