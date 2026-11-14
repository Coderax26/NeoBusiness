import React, { useState, useEffect, useRef } from 'react';

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
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        onClose();
        return;
      }
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
              title: c.legal_name || c.trade_name,
              subtitle: c.phone,
              href: `/customers/${c.id}`,
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
              href: `/inventory/items/${i.id}`,
            }),
          );
          (data.suppliers || []).forEach((s: any) =>
            formatted.push({
              id: s.id,
              category: 'Supplier',
              title: s.legal_name,
              subtitle: s.phone,
              href: `/procurement/suppliers/${s.id}`,
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
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/70 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Global search palette"
        className="w-full max-w-xl bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden"
      >
        <div className="p-3 border-b border-zinc-800 flex items-center gap-3">
          <span className="text-zinc-400 text-lg">🔍</span>
          <input
            type="text"
            className="flex-1 bg-transparent text-white placeholder-zinc-500 outline-none text-base"
            placeholder="Search customers, orders, items, suppliers, trips... (ESC to close)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            autoFocus
          />
          {loading && <span className="text-xs text-indigo-400">Searching...</span>}
        </div>

        <div className="max-h-96 overflow-y-auto divide-y divide-zinc-800/60">
          {error ? (
            <div className="p-6 text-center text-rose-400 text-sm">{error}</div>
          ) : searchTerm.length >= 2 && results.length === 0 && !loading ? (
            <div className="p-6 text-center text-zinc-500 text-sm">
              No matches found for &ldquo;{searchTerm}&rdquo;
            </div>
          ) : (
            results.map((item) => (
              <a
                key={`${item.category}-${item.id}`}
                href={item.href}
                onClick={onClose}
                className="flex items-center justify-between p-3 hover:bg-zinc-800/70 transition-colors"
              >
                <div>
                  <div className="text-sm font-medium text-zinc-100">{item.title}</div>
                  {item.subtitle && <div className="text-xs text-zinc-400">{item.subtitle}</div>}
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                  {item.category}
                </span>
              </a>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
