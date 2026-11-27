'use client';

import React, { useState } from 'react';
import { ERP_GLOSSARY, HELP_ARTICLES } from '../../../src/lib/rollout-data';
import { ERP_GLOSSARY as BILINGUAL_GLOSSARY } from '@neo/i18n';
import { SettingsPageHeader } from '../../../src/components/settings/SettingsPageHeader';
import { getRoleLabel } from '../../../src/lib/settings-copy';

const FRIENDLY_ARTICLES = HELP_ARTICLES.map((art) => {
  if (art.id === 'h-1') {
    return {
      ...art,
      title: 'How to take a new Sales Order & check Minimum Price',
      steps: [
        'Go to Sales → Orders and click New Order',
        'Pick the Customer, Fulfillment Site, and Products',
        'Check that the green "In-Band Price" tag shows, then click Confirm Order',
      ],
    };
  }
  if (art.id === 'h-2') {
    return {
      ...art,
      title: 'How to verify Driver & Collector Cash Handovers',
      steps: [
        'Go to Money → Cash Handovers',
        'Select the Driver or Collector and count the cash/cheques received',
        'Enter the counted amount — any difference automatically alerts the Owner',
      ],
    };
  }
  if (art.id === 'h-3') {
    return {
      ...art,
      title: 'How to close the day’s accounts (End of Day)',
      steps: [
        'Go to Money → Day Closing',
        'Check that all daily checklists are green (cash, trips, stock)',
        'Enter your Owner confirmation password to lock the day',
      ],
    };
  }
  return {
    ...art,
    title: 'How to run a Factory Production Batch on Floor Screen',
    steps: [
      'Switch to Floor Mode from the top-right account menu',
      'Open Active Work Orders and confirm raw materials issued from store',
      'Enter finished weight and any wastage (the system checks recipe yield automatically)',
    ],
  };
});

const SETTINGS_GUIDE = [
  { name: 'Company', desc: 'Your legal business name, GST/PAN numbers, and bank details printed on invoices.' },
  { name: 'Users', desc: 'Add staff, reset login PINs, and choose which locations they can work in.' },
  { name: 'Roles', desc: 'See what each job role can do and which private numbers stay hidden.' },
  { name: 'Sites', desc: 'Manage factories, warehouses, fulfillment sites, and storage rooms.' },
  { name: 'Opening Balances', desc: 'Bring in starting customer and supplier balances before going live.' },
  { name: 'Business Rules', desc: 'Set profit limits, credit days, supplier price limits, and delivery times.' },
  { name: 'Approval Rules', desc: 'Choose who approves price overrides, credit exceptions, and cash mismatches.' },
  { name: 'Templates & Series', desc: 'Preview automatic WhatsApp/SMS messages and invoice numbering.' },
  { name: 'Audit Trail', desc: 'Permanent log of who changed what and when.' },
  { name: 'System Health', desc: 'Quick check that the app, data storage, and message delivery are working.' },
];

export default function HelpCentrePage() {
  const [practiceMode, setPracticeMode] = useState(false);
  const [feedbackNote, setFeedbackNote] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  function submitFeedback(e: React.FormEvent) {
    e.preventDefault();
    if (!feedbackNote.trim()) return;
    setToast('Thank you! Your question has been sent to your business admin and support team.');
    setFeedbackNote('');
  }

  const combinedGlossary = [
    ...ERP_GLOSSARY.map((g) => ({
      term: g.term === 'BR-08 Trip Close' ? 'Trip Close Checklist' : g.term === 'Step-Up Auth' ? 'Owner Password Confirmation' : g.term,
      meaning: g.meaning,
    })),
    ...Object.values(BILINGUAL_GLOSSARY)
      .filter((t) => ['AR', 'AP', 'GRN', 'BOM', 'EOD', 'FLOOR_PRICE'].includes(t.abbreviation || t.term.toUpperCase().replace(/\s+/g, '_')))
      .map((t) => ({
        term: `${t.plainWord} (${t.term})`,
        meaning: t.en,
      })),
  ];

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        title="Help & Staff Training"
        subtitle="Quick 1-minute guides in plain English, simple explanations of business words, and safe practice mode."
        whatIsThis="New to NeoBus? Start with the 1-minute guides below or look up any term in the Simple Word Guide. You can also turn on Practice Mode to try screens safely."
        actions={
          <button
            type="button"
            onClick={() => setPracticeMode((p) => !p)}
            className={`rounded-[3px] px-4 py-2 text-xs font-semibold ${
              practiceMode
                ? 'bg-haldi text-white'
                : 'border border-rule-strong bg-sheet text-ink hover:bg-paper'
            }`}
          >
            {practiceMode ? 'Practice Mode: ON (Safe Demo)' : 'Try Practice Mode'}
          </button>
        }
      />

      {practiceMode && (
        <div className="rounded-[3px] border border-haldi/40 bg-haldi-soft px-4 py-2.5 text-xs font-medium text-ink">
          Practice Mode is active for training — feel free to walk staff through steps without affecting real accounts.
        </div>
      )}

      {toast && (
        <div className="rounded-[3px] border border-leaf/30 bg-leaf-soft px-4 py-2.5 text-sm font-medium text-leaf">
          {toast}
        </div>
      )}

      {/* 60-Second Guides */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {FRIENDLY_ARTICLES.map((art) => (
          <div key={art.id} className="rounded-[4px] border border-rule bg-sheet p-5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="rounded bg-action-soft px-2 py-0.5 font-semibold text-action">
                {getRoleLabel(art.role)}
              </span>
              <span className="text-ink-3">
                {art.duration} · {art.language === 'EN / MR' ? 'English & Marathi' : art.language}
              </span>
            </div>
            <h2 className="text-base font-bold text-ink">{art.title}</h2>
            <ol className="list-decimal pl-4 text-xs text-ink-2 space-y-1 leading-relaxed">
              {art.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>
        ))}
      </div>

      {/* Settings Quick Guide */}
      <div className="rounded-[4px] border border-rule bg-sheet p-5 space-y-3">
        <h2 className="text-base font-bold text-ink">What Each Settings Option Is For</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          {SETTINGS_GUIDE.map((item) => (
            <div key={item.name} className="rounded-[3px] border border-rule bg-paper p-3">
              <div className="font-bold text-ink">{item.name}</div>
              <div className="text-ink-3 mt-0.5 leading-relaxed">{item.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Glossary & Feedback */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-[4px] border border-rule bg-sheet p-5 space-y-3">
          <h2 className="text-base font-bold text-ink">Simple Word Guide (Glossary)</h2>
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {combinedGlossary.map((g) => (
              <div key={g.term} className="rounded-[3px] border border-rule bg-paper p-3 text-xs">
                <div className="font-bold text-ink">{g.term}</div>
                <div className="text-ink-2 mt-0.5">{g.meaning}</div>
              </div>
            ))}
          </div>
        </div>

        <form
          onSubmit={submitFeedback}
          className="rounded-[4px] border border-rule bg-sheet p-5 space-y-3"
        >
          <h2 className="text-base font-bold text-ink">Need Help or Something Unclear?</h2>
          <p className="text-xs text-ink-3">
            Send a quick note to your business administrator or support team.
          </p>
          <textarea
            value={feedbackNote}
            onChange={(e) => setFeedbackNote(e.target.value)}
            rows={5}
            placeholder="Tell us which screen or button was confusing..."
            className="w-full rounded-[3px] border border-rule-strong bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-3"
            required
          />
          <button
            type="submit"
            className="rounded-[3px] bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-action-hover"
          >
            Send Note
          </button>
        </form>
      </div>
    </div>
  );
}
