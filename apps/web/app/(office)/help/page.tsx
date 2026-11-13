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
          <h1 className="text-2xl font-bold text-slate-900">Help Centre, Role Tours &amp; Practice Mode</h1>
          <p className="text-sm text-slate-500">
            60-second English &amp; Marathi walkthroughs, plain-words ERP glossary, and safe sandbox practice mode.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPracticeMode((p) => !p)}
          className={`rounded-lg px-4 py-2 text-xs font-semibold ${
            practiceMode ? 'bg-amber-500 text-white' : 'border border-slate-200 bg-white text-slate-700'
          }`}
        >
          {practiceMode ? 'Practice Mode: ON (Sandbox Data)' : 'Enable Practice Mode'}
        </button>
      </div>

      {toast && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800">
          {toast}
        </div>
      )}

      {/* 60-Second Guides */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {HELP_ARTICLES.map((art) => (
          <div key={art.id} className="rounded-xl border border-slate-200 bg-white p-5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="rounded bg-teal-50 px-2 py-0.5 font-bold text-teal-700">{art.role}</span>
              <span className="text-slate-500">{art.duration} · {art.language}</span>
            </div>
            <h2 className="text-base font-bold text-slate-900">{art.title}</h2>
            <ol className="list-decimal pl-4 text-xs text-slate-600 space-y-1">
              {art.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>
        ))}
      </div>

      {/* Glossary & Feedback */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
          <h2 className="text-base font-bold text-slate-900">Plain-Words ERP Glossary</h2>
          {ERP_GLOSSARY.map((g) => (
            <div key={g.term} className="rounded-lg bg-slate-50 p-3 text-xs">
              <div className="font-bold text-slate-900">{g.term}</div>
              <div className="text-slate-600">{g.meaning}</div>
            </div>
          ))}
        </div>

        <form onSubmit={submitFeedback} className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
          <h2 className="text-base font-bold text-slate-900">Something&apos;s Confusing?</h2>
          <p className="text-xs text-slate-500">Send a quick note to your site champion or support team.</p>
          <textarea
            value={feedbackNote}
            onChange={(e) => setFeedbackNote(e.target.value)}
            rows={4}
            placeholder="Describe which screen or button felt unclear..."
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            required
          />
          <button type="submit" className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white">
            Send Feedback
          </button>
        </form>
      </div>
    </div>
  );
}

