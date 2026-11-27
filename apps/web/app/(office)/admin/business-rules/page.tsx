'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { SettingsPageHeader } from '../../../../src/components/settings/SettingsPageHeader';
import {
  BUSINESS_RULE_META,
  INTERNAL_RULE_KEYS,
  formatRuleKeyFallback,
  type BusinessRuleMeta,
} from '../../../../src/lib/settings-copy';

interface EditableRuleRow {
  key: string;
  group: BusinessRuleMeta['group'];
  label: string;
  description: string;
  control: BusinessRuleMeta['control'];
  unit?: string;
  options?: Array<{ value: string; label: string }>;
  rawValue: any;
  displayValue: string;
  lastUpdated: string;
  dirty?: boolean;
}

const GROUP_ORDER: BusinessRuleMeta['group'][] = [
  'Pricing & Margins',
  'Customer Credit',
  'Orders & Delivery',
  'Purchasing',
  'Factory & Stock',
  'Finance & Accounts',
  'Alerts & Display',
];

function parseJsonValue(raw: unknown): any {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function toDisplayValue(val: any, control: BusinessRuleMeta['control']): string {
  if (control === 'boolean') return val === true || val === 'true' ? 'true' : 'false';
  if (control === 'decimal_percent') {
    const num = Number(val);
    return Number.isFinite(num) ? String(Number((num * 100).toFixed(2))) : String(val ?? '');
  }
  if (val === null || val === undefined) return '';
  return String(val);
}

function toApiValue(displayVal: string, control: BusinessRuleMeta['control']): any {
  if (control === 'boolean') return displayVal === 'true';
  if (control === 'decimal_percent') {
    const num = Number(displayVal);
    return Number.isFinite(num) ? Number((num / 100).toFixed(4)) : 0;
  }
  if (control === 'percent' || control === 'currency' || control === 'number') {
    const num = Number(displayVal);
    return Number.isFinite(num) ? num : 0;
  }
  return displayVal;
}

export default function AdminBusinessRulesPage() {
  const [rules, setRules] = useState<EditableRuleRow[]>([]);
  const [activeGroup, setActiveGroup] = useState<string>('ALL');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: 'success' | 'error' } | null>(null);

  useEffect(() => {
    fetch('/api/proxy/admin/business-rules')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        const mapped: EditableRuleRow[] = list
          .filter((r: any) => !INTERNAL_RULE_KEYS.has(String(r.key)))
          .map((r: any) => {
            const key = String(r.key ?? r.id);
            const meta = BUSINESS_RULE_META[key];
            const parsed = parseJsonValue(r.value_json);
            const control =
              meta?.control ??
              (typeof parsed === 'boolean'
                ? 'boolean'
                : typeof parsed === 'number'
                  ? 'number'
                  : 'text');

            return {
              key,
              group: meta?.group ?? 'Orders & Delivery',
              label: meta?.label ?? formatRuleKeyFallback(key),
              description:
                meta?.description ??
                String(r.description || 'Controls how this business process behaves.').replace(
                  /\s*\((?:OD|BR|KPI)[^)]*\)/gi,
                  '',
                ),
              control,
              unit: meta?.unit,
              options: meta?.options,
              rawValue: parsed,
              displayValue: toDisplayValue(parsed, control),
              lastUpdated: r.updated_at
                ? new Date(r.updated_at).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })
                : 'Default',
            };
          });
        setRules(mapped);
      })
      .catch(() => setRules([]));
  }, []);

  async function saveRule(rule: EditableRuleRow, nextDisplayValue: string) {
    const apiValue = toApiValue(nextDisplayValue, rule.control);
    setSavingKey(rule.key);
    setToast(null);
    setRules((prev) =>
      prev.map((item) =>
        item.key === rule.key
          ? { ...item, displayValue: nextDisplayValue, rawValue: apiValue, dirty: false }
          : item,
      ),
    );
    try {
      const res = await fetch(`/api/proxy/admin/business-rules/${encodeURIComponent(rule.key)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valueJson: apiValue }),
      });
      if (!res.ok) {
        setToast({ text: `Could not update "${rule.label}". Please try again.`, tone: 'error' });
        return;
      }
      setRules((prev) =>
        prev.map((item) =>
          item.key === rule.key ? { ...item, lastUpdated: 'Just now' } : item,
        ),
      );
      setToast({
        text: `Saved "${rule.label}". All staff devices will use this setting within 5 minutes.`,
        tone: 'success',
      });
    } catch {
      setToast({ text: `Network error saving "${rule.label}".`, tone: 'error' });
    } finally {
      setSavingKey(null);
    }
  }

  const visibleRules = useMemo(() => {
    const list =
      activeGroup === 'ALL' ? rules : rules.filter((r) => r.group === activeGroup);
    return [...list].sort(
      (a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group),
    );
  }, [rules, activeGroup]);

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        title="Business Rules & Limits"
        subtitle="Set your company’s everyday limits for profit margins, customer credit, supplier price checks, and delivery cut-offs."
        whatIsThis="These rules guide daily staff actions automatically — for example, warning if a selling price is too low, holding an order when a customer exceeds credit, or requiring an E-Way Bill above ₹50,000. Every change is logged automatically."
      />

      {toast && (
        <div
          className={`rounded-[3px] border px-4 py-2.5 text-sm font-medium ${
            toast.tone === 'error'
              ? 'border-madder/30 bg-madder-soft text-madder'
              : 'border-leaf/30 bg-leaf-soft text-leaf'
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Group filter pills */}
      <div className="flex flex-wrap gap-2 border-b border-rule pb-3">
        <button
          type="button"
          onClick={() => setActiveGroup('ALL')}
          className={`rounded-[3px] px-3 py-1.5 text-xs font-semibold ${
            activeGroup === 'ALL'
              ? 'bg-action text-white'
              : 'bg-paper border border-rule text-ink-2 hover:text-ink'
          }`}
        >
          All Rules ({rules.length})
        </button>
        {GROUP_ORDER.map((group) => {
          const count = rules.filter((r) => r.group === group).length;
          if (count === 0) return null;
          return (
            <button
              key={group}
              type="button"
              onClick={() => setActiveGroup(group)}
              className={`rounded-[3px] px-3 py-1.5 text-xs font-semibold ${
                activeGroup === group
                  ? 'bg-action text-white'
                  : 'bg-paper border border-rule text-ink-2 hover:text-ink'
              }`}
            >
              {group} ({count})
            </button>
          );
        })}
      </div>

      <div className="space-y-3">
        {visibleRules.length === 0 ? (
          <div className="rounded-[4px] border border-rule bg-sheet p-6 text-sm text-ink-3">
            No business rules found in this category.
          </div>
        ) : (
          visibleRules.map((r) => (
            <div
              key={r.key}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-[4px] border border-rule bg-sheet p-5"
            >
              <div className="space-y-1 max-w-2xl">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded bg-action-soft px-2 py-0.5 font-semibold text-action">
                    {r.group}
                  </span>
                  <span className="text-ink-3">Updated: {r.lastUpdated}</span>
                </div>
                <div className="text-[15px] font-bold text-ink">{r.label}</div>
                <p className="text-xs text-ink-2 leading-relaxed">{r.description}</p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {r.control === 'boolean' ? (
                  <button
                    type="button"
                    disabled={savingKey === r.key}
                    onClick={() =>
                      void saveRule(r, r.displayValue === 'true' ? 'false' : 'true')
                    }
                    className={`rounded-[3px] border px-3.5 py-1.5 text-xs font-semibold ${
                      r.displayValue === 'true'
                        ? 'border-leaf/30 bg-leaf-soft text-leaf'
                        : 'border-rule-strong bg-paper text-ink-2'
                    }`}
                  >
                    {r.displayValue === 'true' ? 'Yes (Enabled)' : 'No (Off)'}
                  </button>
                ) : r.control === 'select' && r.options ? (
                  <select
                    value={r.displayValue}
                    disabled={savingKey === r.key}
                    onChange={(e) => void saveRule(r, e.target.value)}
                    className="rounded-[3px] border border-rule-strong bg-paper px-3 py-1.5 text-xs font-semibold text-ink max-w-[260px]"
                  >
                    {r.options.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <div className="flex items-center rounded-[3px] border border-rule-strong bg-paper overflow-hidden">
                      {r.unit === '₹' && (
                        <span className="px-2 text-xs font-semibold text-ink-3">₹</span>
                      )}
                      <input
                        type={
                          r.control === 'text' ? 'text' : 'number'
                        }
                        step={r.control === 'decimal_percent' ? '0.5' : '1'}
                        value={r.displayValue}
                        onChange={(e) => {
                          const v = e.target.value;
                          setRules((prev) =>
                            prev.map((item) =>
                              item.key === r.key
                                ? { ...item, displayValue: v, dirty: true }
                                : item,
                            ),
                          );
                        }}
                        className="w-28 bg-transparent px-2.5 py-1.5 font-mono text-sm font-semibold text-ink outline-none"
                      />
                      {r.unit && r.unit !== '₹' && (
                        <span className="px-2 text-xs text-ink-3">{r.unit}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={savingKey === r.key || !r.dirty}
                      onClick={() => void saveRule(r, r.displayValue)}
                      className="rounded-[3px] bg-action px-3 py-1.5 text-xs font-semibold text-white hover:bg-action-hover disabled:opacity-45"
                    >
                      {savingKey === r.key ? 'Saving...' : 'Save'}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
