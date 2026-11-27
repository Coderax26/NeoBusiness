'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';

export interface SearchResultItem {
  id: string;
  category: 'Customer' | 'Order' | 'Item' | 'Supplier' | 'Trip';
  title: string;
  subtitle?: string;
  href: string;
}

export interface SearchPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  siteId?: string;
}

export const SearchPalette: React.FC<SearchPaletteProps> = ({
  isOpen,
  onClose,
  siteId,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen && typeof document !== 'undefined') {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
    } else if (!isOpen && previousFocusRef.current) {
      previousFocusRef.current.focus?.();
      previousFocusRef.current = null;
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab' && isOpen && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'input, a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!searchTerm.trim() || searchTerm.length < 2) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    const timer = setTimeout(async () => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      try {
        const siteParam = siteId ? `&siteId=${encodeURIComponent(siteId)}` : '';
        const res = await fetch(
          `/api/bff/search?q=${encodeURIComponent(searchTerm)}${siteParam}`,
          { signal: controller.signal },
        );
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          if (cancelled) return;
          const formatted: SearchResultItem[] = [];
          (data.customers || []).forEach((c: any) =>
            formatted.push({
              id: c.id,
              category: 'Customer',
              title: c.business_name || c.legal_name || c.trade_name || 'Customer',
              subtitle: c.phone,
              href: `/sales/customers/${c.id}`,
            }),
          );
          (data.orders || []).forEach((o: any) =>
            formatted.push({
              id: o.id,
              category: 'Order',
              title: o.order_no,
              subtitle: `Status: ${o.order_status}`,
              href: `/sales/orders/${o.id}`,
            }),
          );
          (data.items || []).forEach((i: any) =>
            formatted.push({
              id: i.id,
              category: 'Item',
              title: i.name,
              subtitle: `SKU: ${i.sku_code}`,
              href: `/sales/items`,
            }),
          );
          (data.suppliers || []).forEach((s: any) =>
            formatted.push({
              id: s.id,
              category: 'Supplier',
              title: s.company_name || s.name || s.legal_name || 'Supplier',
              subtitle: s.phone,
              href: `/procurement/suppliers`,
            }),
          );
          (data.trips || []).forEach((t: any) =>
            formatted.push({
              id: t.id,
              category: 'Trip',
              title: `Trip ${t.trip_date}`,
              subtitle: `Status: ${t.status}`,
              href: `/logistics/trips/${t.id}`,
            }),
          );
          setResults(formatted);
        } else {
          setResults([]);
          setError('Unable to load search results.');
        }
      } catch (err: any) {
        if (cancelled || err?.name === 'AbortError') return;
        setResults([]);
        setError('Search request failed.');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchTerm, siteId]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/45"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Global search palette"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-sheet border border-rule-strong rounded-[4px] shadow-2xl overflow-hidden"
      >
        <div className="p-3.5 border-b border-rule flex items-center gap-3">
          <Search className="w-4 h-4 text-ink-3 shrink-0" />
          <input
            type="text"
            className="flex-1 bg-transparent text-ink placeholder-ink-3 outline-none text-[15px]"
            placeholder="Search customers, orders, items, suppliers, trips... (ESC to close)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            autoFocus
          />
          {loading && <span className="text-[13px] text-action">Searching...</span>}
        </div>

        <div className="max-h-96 overflow-y-auto divide-y divide-rule">
          {error ? (
            <div className="p-6 text-center text-madder text-[13.5px]">{error}</div>
          ) : searchTerm.length >= 2 && results.length === 0 && !loading ? (
            <div className="p-6 text-center text-ink-3 text-[13.5px]">
              No matches found for &ldquo;{searchTerm}&rdquo;
            </div>
          ) : (
            results.map((item) => (
              <Link
                key={`${item.category}-${item.id}`}
                href={item.href}
                onClick={onClose}
                className="flex items-center justify-between p-3.5 hover:bg-paper transition-colors"
              >
                <div>
                  <div className="text-[14px] font-medium text-ink">{item.title}</div>
                  {item.subtitle && <div className="text-[13px] text-ink-3">{item.subtitle}</div>}
                </div>
                <span className="text-[13px] px-2 py-0.5 rounded-[3px] bg-paper text-ink-2 border border-rule">
                  {item.category}
                </span>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
