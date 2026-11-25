'use client';

import React, { useState } from 'react';
import { ERP_GLOSSARY, HELP_ARTICLES } from '../../../src/lib/rollout-data';

export default function HelpCentrePage() {
  const [practiceMode, setPracticeMode] = useState(false);
  const [feedbackNote, setFeedbackNote] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  function submitFeedback(e: React.FormEvent) {
    e.preventDefault();
    if (!feedbackNote.trim()) return;
    setToast('Feedback submitted to site champion & support team. Thank you!');
    setFeedbackNote('');
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Help Centre, Role Tours &amp; Practice Mode</h1>
          <p className="text-sm text-ink-3">
            60-second English &amp; Marathi walkthroughs, plain-words ERP glossary, and safe sandbox practice mode.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPracticeMode((p) => !p)}
          className={`rounded-lg px-4 py-2 text-xs font-semibold${
            practiceMode
              ? 'bg-amber-500 text-white'
              : 'border border-rule bg-sheet text-ink hover:bg-sunken'
          }`}
        >
          {practiceMode ? 'Practice Mode: ON (Sandbox Data)' : 'Enable Practice Mode'}
        </button>
      </div>

      {toast && (
        <div className="rounded-[3px] border border-leaf/30 bg-leaf-soft px-4 py-2.5 text-sm font-medium text-leaf">
          {toast}
        </div>
      )}

      {/* 60-Second Guides */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {HELP_ARTICLES.map((art) => (
          <div key={art.id} className="rounded-[3px] border border-rule bg-sheet p-5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="rounded bg-action/15 px-2 py-0.5 font-bold text-action">{art.role}</span>
              <span className="text-ink-3">{art.duration} · {art.language}</span>
            </div>
            <h2 className="text-base font-bold text-ink">{art.title}</h2>
            <ol className="list-decimal pl-4 text-xs text-ink-2 space-y-1">
              {art.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>
        ))}
      </div>

      {/* Glossary & Feedback */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-[3px] border border-rule bg-sheet p-5 space-y-3">
          <h2 className="text-base font-bold text-ink">Plain-Words ERP Glossary</h2>
          {ERP_GLOSSARY.map((g) => (
            <div key={g.term} className="rounded-lg border border-rule bg-paper p-3 text-xs">
              <div className="font-bold text-ink">{g.term}</div>
              <div className="text-ink-3">{g.meaning}</div>
            </div>
          ))}
        </div>

        <form onSubmit={submitFeedback} className="rounded-[3px] border border-rule bg-sheet p-5 space-y-3">
          <h2 className="text-base font-bold text-ink">Something&apos;s Confusing?</h2>
          <p className="text-xs text-ink-3">Send a quick note to your site champion or support team.</p>
          <textarea
            value={feedbackNote}
            onChange={(e) => setFeedbackNote(e.target.value)}
            rows={4}
            placeholder="Describe which screen or button felt unclear..."
            className="w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-3"
            required
          />
          <button type="submit" className="rounded-[3px] bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700">
            Send Feedback
          </button>
        </form>
      </div>
    </div>
  );
}
