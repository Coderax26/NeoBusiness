'use client';

import React, { useState } from 'react';
import { Dialog, Button, Kbd } from '@neo/ui';
import { Phone, Mail, Play } from 'lucide-react';

export interface HelpModalProps {
  open: boolean;
  onClose: () => void;
  onStartTour?: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ open, onClose, onStartTour }) => {
  const [tab, setTab] = useState<'shortcuts' | 'tour' | 'support'>('shortcuts');

  const shortcuts = [
    { key: 'Ctrl + K', description: 'Search orders, customers, items, suppliers, trips' },
    { key: 'N', description: 'Open the New menu to create a record' },
    { key: '/', description: 'Focus search input on any table' },
    { key: 'G then O', description: 'Quick jump to Sales Orders' },
    { key: 'G then I', description: 'Quick jump to Invoices' },
    { key: 'Esc', description: 'Close any open modal, drawer or search palette' },
    { key: '?', description: 'Open this help & shortcuts dialog' },
  ];

  return (
    <Dialog open={open} onClose={onClose} title="Help & Shortcuts" maxWidth="lg">
      <div className="flex border-b border-rule gap-6 mb-4">
        <button
          type="button"
          onClick={() => setTab('shortcuts')}
          className={`pb-2.5 text-[13.5px] border-b-2 transition-colors ${
            tab === 'shortcuts'
              ? 'border-ink text-ink font-semibold'
              : 'border-transparent text-ink-2 hover:text-ink font-medium'
          }`}
        >
          Keyboard Shortcuts
        </button>
        <button
          type="button"
          onClick={() => setTab('tour')}
          className={`pb-2.5 text-[13.5px] border-b-2 transition-colors ${
            tab === 'tour'
              ? 'border-ink text-ink font-semibold'
              : 'border-transparent text-ink-2 hover:text-ink font-medium'
          }`}
        >
          Product Tours
        </button>
        <button
          type="button"
          onClick={() => setTab('support')}
          className={`pb-2.5 text-[13.5px] border-b-2 transition-colors ${
            tab === 'support'
              ? 'border-ink text-ink font-semibold'
              : 'border-transparent text-ink-2 hover:text-ink font-medium'
          }`}
        >
          Support & Contact
        </button>
      </div>

      {tab === 'shortcuts' && (
        <div className="space-y-2.5">
          <p className="text-[13px] text-ink-3 mb-3">
            Use these keyboard shortcuts to move quickly without touching the mouse:
          </p>
          <div className="divide-y divide-rule border border-rule rounded-[3px] overflow-hidden bg-paper">
            {shortcuts.map((sc, idx) => (
              <div key={idx} className="p-3 flex items-center justify-between text-[13.5px]">
                <span className="text-ink-2">{sc.description}</span>
                <Kbd>{sc.key}</Kbd>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'tour' && (
        <div className="space-y-4 text-[13.5px] text-ink-2">
          <p>
            Learn how your workspace is organized with a short guided walkthrough.
          </p>
          <div className="p-4 bg-paper border border-rule rounded-[4px] flex items-center justify-between gap-4">
            <div>
              <div className="font-semibold text-ink text-[15px]">Interactive Workspace Tour</div>
              <p className="text-ink-3 text-[13px] mt-0.5">
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
              <Play className="w-3.5 h-3.5" />
              Start Tour
            </Button>
          </div>
        </div>
      )}

      {tab === 'support' && (
        <div className="space-y-4 text-[13.5px] text-ink-2">
          <div className="p-4 bg-paper border border-rule rounded-[4px] space-y-2.5">
            <div className="font-semibold text-ink text-[15px]">Need assistance?</div>
            <p className="text-ink-3 text-[13px]">
              For office help, hardware questions, or report changes:
            </p>
            <div className="pt-2 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-ink-3" />
                <span>WhatsApp Support:</span>
                <strong className="text-action font-mono">+91 98230 00000</strong>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-ink-3" />
                <span>Operations Email:</span>
                <strong className="text-action">support@neobus.in</strong>
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
