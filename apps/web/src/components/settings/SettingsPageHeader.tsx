'use client';

import React from 'react';

export interface SettingsPageHeaderProps {
  title: string;
  subtitle: string;
  whatIsThis: string;
  actions?: React.ReactNode;
}

export function SettingsPageHeader({
  title,
  subtitle,
  whatIsThis,
  actions,
}: SettingsPageHeaderProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">{title}</h1>
          <p className="text-sm text-ink-2 mt-1">{subtitle}</p>
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>

      <div className="rounded-[4px] border border-rule bg-paper px-4 py-3 text-[13px] text-ink-2 leading-relaxed">
        <span className="font-semibold text-ink">What this page is for: </span>
        {whatIsThis}
      </div>
    </div>
  );
}
