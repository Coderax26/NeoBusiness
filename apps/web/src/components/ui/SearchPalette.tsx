import React, { useState, useEffect } from 'react';

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else onClose(); // parent handles toggle
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!searchTerm.trim() || searchTerm.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const siteParam = siteId ? `&siteId=${encodeURIComponent(siteId)}` : '';
        const res = await fetch(`/api/bff/search?q=${encodeURIComponent(searchTerm)}${siteParam}`);
        if (res.ok) {
          const data = await res.json();
          // Federated search returns grouped categories
          const formatted: SearchResultItem[] = [];
          (data.customers || []).forEach((c: any) =>
            formatted.push({ id: c.id, category: 'Customer', title: c.legal_name || c.trade_name, subtitle: c.phone, href: `/customers/${c.id}` }),
          );
          (data.orders || []).forEach((o: any) =>
            formatted.push({ id: o.id, category: 'Order', title: o.order_no, subtitle: `Status: ${o.order_status}`, href: `/sales/orders/${o.id}` }),
          );
          (data.items || []).forEach((i: any) =>
            formatted.push({ id: i.id, category: 'Item', title: i.name, subtitle: `SKU: ${i.sku_code}`, href: `/inventory/items/${i.id}` }),
          );
          (data.suppliers || []).forEach((s: any) =>
            formatted.push({ id: s.id, category: 'Supplier', title: s.legal_name, subtitle: s.phone, href: `/procurement/suppliers/${s.id}` }),
          );
          (data.trips || []).forEach((t: any) =>
            formatted.push({ id: t.id, category: 'Trip', title: `Trip ${t.trip_date}`, subtitle: `Status: ${t.status}`, href: `/logistics/trips/${t.id}` }),
          );
          setResults(formatted);
        }
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchTerm, siteId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-xl bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden">
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

        <div className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="text-xs text-zinc-500 text-center py-6">
              {searchTerm.length < 2 ? 'Type at least 2 characters...' : 'No matching records found.'}
            </p>
          ) : (
            <div className="space-y-1">
              {results.map((r) => (
                <a
                  key={`${r.category}-${r.id}`}
                  href={r.href}
                  className="flex items-center justify-between p-2.5 rounded-lg hover:bg-zinc-800/80 transition-colors"
                >
                  <div>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-zinc-800 text-indigo-300 mr-2">
                      {r.category}
                    </span>
                    <span className="text-sm font-medium text-white">{r.title}</span>
                  </div>
                  {r.subtitle && <span className="text-xs text-zinc-400">{r.subtitle}</span>}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

