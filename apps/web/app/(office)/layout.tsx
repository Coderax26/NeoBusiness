'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { can, type SessionUser } from '@neo/shared';
import { SearchPalette } from '../../src/components/ui/SearchPalette';

interface NavItem {
  label: string;
  href: string;
  icon: string;
  permission?: string;
  badge?: string;
}

export default function OfficeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [activeSite, setActiveSite] = useState<string>('all');
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => {
        if (!res.ok) {
          router.push('/login');
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data && data.user) {
          setUser(data.user);
          if (data.user.sites?.[0]) {
            setActiveSite(data.user.sites[0].id);
          }
        }
      })
      .catch(() => router.push('/login'));
  }, [router]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const navSections: Array<{ title: string; items: NavItem[] }> = [
    {
      title: 'Main',
      items: [
        { label: 'Control Tower & Home', href: '/home', icon: '⚡' },
        { label: 'Approvals & Exceptions', href: '/approvals', icon: '⚖️', permission: 'exception.resolve' },
      ],
    },
    {
      title: 'Commercial & Sales',
      items: [
        { label: 'Daily Price Sheet', href: '/sales/prices', icon: '🏷️', permission: 'price.set_daily' },
        { label: 'Sales Orders', href: '/sales/orders', icon: '📝', permission: 'order.view' },
        { label: 'Quotes Workbench', href: '/sales/quotes', icon: '📋', permission: 'quote.view' },
        { label: 'Customers 360', href: '/sales/customers', icon: '👥', permission: 'customer.view' },
      ],
    },
    {
      title: 'Procurement & Supply',
      items: [
        { label: 'Requisitions', href: '/procurement/requisitions', icon: '📥', permission: 'requisition.read' },
        { label: 'Purchase Orders', href: '/procurement/purchase-orders', icon: '📦', permission: 'po.read' },
        { label: 'Suppliers & Rates', href: '/procurement/suppliers', icon: '🏭', permission: 'supplier.read' },
        { label: 'Supplier Bills (AP)', href: '/procurement/bills', icon: '🧾', permission: 'po.read' },
      ],
    },
    {
      title: 'Warehouse & Operations',
      items: [
        { label: 'Stock & ATP', href: '/inventory/stock', icon: '📊', permission: 'inventory.read' },
        { label: 'Physical Stock Counts', href: '/inventory/stock-counts', icon: '🔢', permission: 'inventory.read' },
        { label: 'Fleet & Trips', href: '/logistics/trips', icon: '🚚', permission: 'fleet.view' },
        { label: 'Production Orders', href: '/production/work-orders', icon: '⚙️', permission: 'wo.read' },
      ],
    },
    {
      title: 'Finance & Accounts',
      items: [
        { label: 'Invoices & AR', href: '/finance/invoices', icon: '💳', permission: 'finance.view' },
        { label: 'Cash Handovers', href: '/finance/handovers', icon: '💵', permission: 'receipt.verify_handover' },
        { label: 'Expenses & Cashbook', href: '/finance/expenses', icon: '📑', permission: 'finance.view' },
        { label: 'End of Day (EOD)', href: '/finance/eod', icon: '🔒', permission: 'eod.signoff' },
        { label: 'Statutory Reports', href: '/reports', icon: '📈', permission: 'report.view' },
      ],
    },
    {
      title: 'Administration',
      items: [
        { label: 'Users & Roles', href: '/admin/users', icon: '👤', permission: 'admin.manage' },
        { label: 'Sites & Locations', href: '/admin/sites', icon: '🏢', permission: 'admin.manage' },
        { label: 'Business Rules', href: '/admin/rules', icon: '⚙️', permission: 'config.edit' },
        { label: 'Audit Trail', href: '/admin/audit', icon: '📜', permission: 'audit.view' },
      ],
    },
  ];

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      {/* Sidebar */}
      <aside className="w-64 border-r border-zinc-800 bg-zinc-900/40 flex flex-col justify-between shrink-0">
        <div>
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
            <Link href="/home" className="flex items-center gap-2.5 font-bold tracking-tight text-white">
              <span className="w-8 h-8 rounded-lg bg-indigo-600/30 border border-indigo-500/40 text-indigo-400 inline-flex items-center justify-center text-sm font-black">
                NB
              </span>
              <span>NeoBus ERP</span>
            </Link>
          </div>

          <nav className="p-3 space-y-6 overflow-y-auto max-h-[calc(100vh-140px)]">
            {navSections.map((section) => {
              const visibleItems = section.items.filter(
                (item) => !item.permission || can(user, item.permission),
              );
              if (visibleItems.length === 0) return null;

              return (
                <div key={section.title}>
                  <div className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    {section.title}
                  </div>
                  <div className="space-y-1">
                    {visibleItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-800/60 transition-colors"
                      >
                        <span className="flex items-center gap-2.5">
                          <span>{item.icon}</span>
                          <span>{item.label}</span>
                        </span>
                        {item.badge && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </nav>
        </div>

        {/* User bar at bottom */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-8 h-8 rounded-full bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 flex items-center justify-center font-bold text-xs shrink-0">
              {user?.name ? user.name[0].toUpperCase() : 'U'}
            </div>
            <div className="truncate">
              <div className="text-xs font-semibold text-white truncate">{user?.name || 'Loading...'}</div>
              <div className="text-[10px] text-zinc-400">{user?.role || ''}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Sign out"
            className="text-zinc-400 hover:text-rose-400 p-1.5 rounded transition-colors"
          >
            ↪
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-16 border-b border-zinc-800 bg-zinc-900/30 px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            {/* Site switcher */}
            <div className="flex items-center gap-2 bg-zinc-800/60 border border-zinc-700/60 rounded-lg px-3 py-1.5 text-xs">
              <span className="text-zinc-400">Site:</span>
              <select
                className="bg-transparent text-white font-medium outline-none cursor-pointer"
                value={activeSite}
                onChange={(e) => setActiveSite(e.target.value)}
              >
                {user?.role === 'OWNER' && <option value="all">All Sites (Aggregated)</option>}
                {(user?.sites || []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.siteType})
                  </option>
                ))}
              </select>
            </div>

            {/* Quick search button */}
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 bg-zinc-800/40 hover:bg-zinc-800/80 border border-zinc-700/50 rounded-lg px-3 py-1.5 text-xs text-zinc-400 transition-colors"
            >
              <span>🔍 Search records...</span>
              <kbd className="bg-zinc-700 text-zinc-300 text-[10px] px-1.5 py-0.5 rounded font-mono">Ctrl+K</kbd>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 pulse-indicator" />
              Live Connected
            </span>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-6 overflow-y-auto">{children}</main>
      </div>

      {/* Global Command Palette */}
      <SearchPalette
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        siteId={activeSite === 'all' ? undefined : activeSite}
      />
    </div>
  );
}

