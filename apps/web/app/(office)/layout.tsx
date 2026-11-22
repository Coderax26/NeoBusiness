'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { can, type SessionUser } from '@neo/shared';
import { SearchPalette } from '../../src/components/ui/SearchPalette';
import { ApprovalsDrawer } from '../../src/components/shell/ApprovalsDrawer';
import { NotificationsDrawer } from '../../src/components/shell/NotificationsDrawer';
import { HelpModal } from '../../src/components/shell/HelpModal';
import { LockScreenOverlay } from '../../src/components/shell/LockScreenOverlay';
import { TourEngine, Avatar, Kbd } from '@neo/ui';

interface NavItem {
  label: string;
  href: string;
  icon: string;
  permission?: string;
  badge?: string;
}

interface NavSection {
  title: string;
  accent: string; // Module colour accent (§3.3)
  items: NavItem[];
}

export default function OfficeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState<SessionUser | null>(null);
  const [activeSite, setActiveSite] = useState<string>('all');
  const [siteToast, setSiteToast] = useState<string | null>(null);

  // Shell UI states
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [approvalsOpen, setApprovalsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [tourActive, setTourActive] = useState(false);

  // Badge counts
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [unreadNotifsCount, setUnreadNotifsCount] = useState(0);

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
          const stored = typeof window !== 'undefined' ? localStorage.getItem('neobus_active_site_id') : null;
          const validStored =
            stored && (stored === 'all' || data.user.sites?.some((s: any) => s.id === stored));
          const initialSite = validStored
            ? stored!
            : data.user.activeSiteId || data.user.sites?.[0]?.id || 'all';
          setActiveSite(initialSite);
          if (typeof window !== 'undefined') {
            localStorage.setItem('neobus_active_site_id', initialSite);
            window.dispatchEvent(new CustomEvent('neobus-site-changed', { detail: initialSite }));
          }
        }
      })
      .catch(() => router.push('/login'));
  }, [router]);

  // Global Keyboard Shortcuts (Ctrl+K, ?, N)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      } else if (e.key === '?' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        setHelpOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSiteChange = (newSiteId: string) => {
    setActiveSite(newSiteId);
    if (typeof window !== 'undefined') {
      localStorage.setItem('neobus_active_site_id', newSiteId);
      window.dispatchEvent(new CustomEvent('neobus-site-changed', { detail: newSiteId }));
    }
    const siteObj = user?.sites?.find((s) => s.id === newSiteId);
    const siteName = newSiteId === 'all' ? 'All Sites' : siteObj?.name || newSiteId;
    setSiteToast(`Active site switched to: ${siteName}`);
    setTimeout(() => setSiteToast(null), 3000);
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const navSections: NavSection[] = [
    {
      title: 'Home',
      accent: '#0F766E', // Teal
      items: [
        { label: 'Today Board', href: '/home', icon: '🏠' },
        { label: 'Control Tower', href: '/control/dashboard', icon: '🗼', permission: 'dashboard.read_pulse' },
        {
          label: 'Approvals Centre',
          href: '/control/approvals',
          icon: '⚖️',
          permission: 'exception.resolve',
          ...(pendingApprovalsCount > 0 ? { badge: String(pendingApprovalsCount) } : {}),
        },
        { label: 'Executive Analytics', href: '/control/analytics', icon: '📈', permission: 'analytics.read_customers' },
        { label: 'Notifications Log', href: '/control/notifications', icon: '🔔', permission: 'audit.view' },
      ],
    },
    {
      title: 'Sales (Commercial)',
      accent: '#0F766E',
      items: [
        { label: "Today's Prices", href: '/sales/prices', icon: '🏷️', permission: 'price.set_daily' },
        { label: 'Orders', href: '/sales/orders', icon: '📝', permission: 'order.view' },
        { label: 'Quotes', href: '/sales/quotes', icon: '📋', permission: 'quote.view' },
        { label: 'Customers', href: '/sales/customers', icon: '👥', permission: 'customer.view' },
      ],
    },
    {
      title: 'Purchase (Procurement)',
      accent: '#6366F1', // Indigo
      items: [
        { label: 'Procurement Home', href: '/procurement', icon: '🧭', permission: 'po.read' },
        { label: 'Requisitions', href: '/procurement/requisitions', icon: '📥', permission: 'requisition.read' },
        { label: 'Purchase Orders', href: '/procurement/purchase-orders', icon: '📦', permission: 'po.read' },
        { label: 'Goods Received (GRN)', href: '/procurement/grns', icon: '🚚', permission: 'grn.read' },
        { label: 'Shortfall Workbench', href: '/procurement/shortfalls', icon: '⚠', permission: 'po.read' },
        { label: 'Supplier Bills (AP)', href: '/procurement/supplier-bills', icon: '🧾', permission: 'po.read' },
        { label: 'Suppliers & Rates', href: '/procurement/suppliers', icon: '🏭', permission: 'supplier.read' },
        { label: 'Scorecards & Trends', href: '/procurement/scorecards', icon: '📈', permission: 'supplier.read' },
      ],
    },
    {
      title: 'Stock (Inventory)',
      accent: '#F59E0B', // Amber
      items: [
        { label: 'Stock Overview', href: '/inventory/stock', icon: '📊', permission: 'inventory.read' },
        { label: 'Check Availability (ATP)', href: '/inventory/availability', icon: '✅', permission: 'inventory.read' },
        { label: 'Expiry Watchlist', href: '/inventory/expiry', icon: '⏳', permission: 'inventory.read' },
        { label: 'Inter-Site Transfers', href: '/inventory/transfers', icon: '🔄', permission: 'inventory.transfer' },
        { label: 'Stock Adjustments', href: '/inventory/adjustments', icon: '⚖️', permission: 'inventory.adjust' },
        { label: 'Stock Ledger', href: '/inventory/ledger', icon: '📒', permission: 'inventory.read' },
        { label: 'Reservations', href: '/inventory/reservations', icon: '🔒', permission: 'inventory.read' },
        { label: 'Physical Counts', href: '/inventory/stock-counts', icon: '🔢', permission: 'inventory.read' },
        { label: 'Stock Alerts', href: '/control/stock-alerts', icon: '🚨', permission: 'inventory.read' },
      ],
    },
    {
      title: 'Factory (Production)',
      accent: '#EA580C', // Orange
      items: [
        { label: 'Production Overview', href: '/production', icon: '📊', permission: 'wo.read' },
        { label: 'Recipes & BOMs', href: '/production/boms', icon: '🧪', permission: 'wo.read' },
        { label: 'Work Orders', href: '/production/work-orders', icon: '⚙️', permission: 'wo.read' },
        { label: 'RM Requisitions', href: '/production/requisitions', icon: '📥', permission: 'requisition.read' },
        { label: 'Wastage Log', href: '/production/wastage', icon: '🗑️', permission: 'wo.read' },
        { label: 'Attendance & Labour', href: '/production/attendance', icon: '👷', permission: 'wo.read' },
        { label: 'Floor Terminal', href: '/floor', icon: '📱' },
      ],
    },
    {
      title: 'Delivery (Logistics)',
      accent: '#2563EB', // Blue
      items: [
        { label: 'Live Dispatch Board', href: '/logistics/dispatch', icon: '📡', permission: 'fleet.view' },
        { label: 'Plan Trip (Builder)', href: '/logistics/trips/new', icon: '🗺️', permission: 'fleet.view' },
        { label: 'Trips & ePOD', href: '/logistics/trips', icon: '🚚', permission: 'fleet.view' },
        { label: 'Delivery Issues', href: '/logistics/issues', icon: '⚠️', permission: 'fleet.view' },
        { label: 'Trip Expenses', href: '/logistics/expenses', icon: '⛽', permission: 'fleet.view' },
        { label: 'Vehicles Master', href: '/logistics/vehicles', icon: '🚛', permission: 'fleet.view' },
        { label: 'Fleet Monitoring', href: '/logistics/monitoring', icon: '📊', permission: 'fleet.view' },
      ],
    },
    {
      title: 'Money (Finance)',
      accent: '#16A34A', // Green
      items: [
        { label: 'Finance Home', href: '/finance', icon: '💰', permission: 'finance.view' },
        { label: 'Tax Invoices', href: '/finance/invoices', icon: '💳', permission: 'finance.view' },
        { label: 'Receivables (AR)', href: '/finance/receivables', icon: '📊', permission: 'finance.view' },
        { label: 'Collections (Receipts)', href: '/finance/collections', icon: '🧾', permission: 'finance.view' },
        { label: 'Cash Handovers', href: '/finance/handovers', icon: '💵', permission: 'receipt.verify_handover' },
        { label: 'Cheques & PDC', href: '/finance/cheques', icon: '🏦', permission: 'finance.view' },
        { label: 'Credit Notes', href: '/finance/credit-notes', icon: '📝', permission: 'finance.view' },
        { label: 'COD Settlement', href: '/finance/cod', icon: '🪙', permission: 'finance.view' },
        { label: 'Promises to Pay', href: '/finance/ptp', icon: '🤝', permission: 'finance.view' },
        { label: 'Supplier Payables', href: '/finance/payables', icon: '📤', permission: 'finance.view' },
        { label: 'Day Closing (EOD)', href: '/finance/eod', icon: '🔒', permission: 'eod.signoff' },
        { label: 'Tally XML Export', href: '/finance/tally', icon: '📦', permission: 'finance.view' },
        { label: 'Report Library', href: '/reports', icon: '📈', permission: 'report.view' },
        { label: 'Scheduled Reports', href: '/reports/scheduled', icon: '⏰', permission: 'report.view' },
      ],
    },
    {
      title: 'Admin & Control',
      accent: '#8B5CF6', // Purple
      items: [
        { label: 'Opening Balances', href: '/admin/opening-balances', icon: '⚖️', permission: 'admin.manage' },
        { label: 'Users & Access', href: '/admin/users', icon: '👤', permission: 'admin.manage' },
        { label: 'Roles & Matrix', href: '/admin/roles', icon: '🛡️', permission: 'admin.manage' },
        { label: 'Sites & Locations', href: '/admin/sites', icon: '🏢', permission: 'admin.manage' },
        { label: 'Company Profile', href: '/admin/company', icon: '🏛️', permission: 'admin.manage' },
        { label: 'Business Rules', href: '/admin/business-rules', icon: '⚙️', permission: 'config.edit' },
        { label: 'Approval Rules', href: '/admin/approval-rules', icon: '🔁', permission: 'config.edit' },
        { label: 'Templates & Series', href: '/admin/templates', icon: '✉️', permission: 'config.edit' },
        { label: 'Audit Trail', href: '/control/audit', icon: '📜', permission: 'audit.view' },
        { label: 'System Health', href: '/admin/system', icon: '🩺', permission: 'admin.manage' },
        { label: 'Rollout Gate (F14)', href: '/admin/rollout', icon: '🚀', permission: 'admin.manage' },
        { label: 'ERP Extensions (R4)', href: '/extensions', icon: '🧩' },
        { label: 'Help & Training', href: '/help', icon: '🎓' },
      ],
    },
  ];

  // Breadcrumbs generator
  const pathParts = pathname.split('/').filter(Boolean);
  const breadcrumbItems = pathParts.map((p, idx) => ({
    label: p.charAt(0).toUpperCase() + p.slice(1).replace(/-/g, ' '),
    href: '/' + pathParts.slice(0, idx + 1).join('/'),
  }));

  const tourSteps = [
    { targetElementId: 'site-switcher', title: 'Site Switcher', content: 'Switch between factory plants, distribution hubs, or view aggregated data across All Sites.' },
    { targetElementId: 'command-palette-btn', title: 'Universal Command Palette', content: 'Press Ctrl+K anytime to quickly locate customers, orders, trips, or execute fast actions.' },
    { targetElementId: 'approvals-btn', title: 'Approvals & Exceptions Inbox', content: 'Authorize below-floor price overrides, credit limit breaches, or supplier spikes directly without leaving your screen.' },
    { targetElementId: 'notifications-btn', title: 'Live System Notifications', content: 'Stay informed on staged orders ready to load, disputed handovers, and stock expiry alerts.' },
  ];

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      {/* 1. Sidebar */}
      <aside
        className={`${
          sidebarCollapsed ? 'w-20' : 'w-64'
        } border-r border-zinc-800 bg-zinc-900/40 flex flex-col justify-between shrink-0 transition-all duration-200 select-none z-20`}
      >
        <div>
          {/* Logo & Collapse button */}
          <div className="h-16 px-4 border-b border-zinc-800 flex items-center justify-between">
            <Link href="/home" className="flex items-center gap-2.5 font-bold tracking-tight text-white">
              <span className="w-8 h-8 rounded-xl bg-teal-600/30 border border-teal-500/40 text-teal-300 inline-flex items-center justify-center text-sm font-black shadow-md">
                NB
              </span>
              {!sidebarCollapsed && <span className="text-base font-extrabold tracking-tight">NeoBus ERP</span>}
            </Link>
            <button
              type="button"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="text-zinc-500 hover:text-white p-1.5 rounded-lg hover:bg-zinc-800 text-xs"
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? '»' : '«'}
            </button>
          </div>

          {/* Navigation Items */}
          <nav className="p-3 space-y-5 overflow-y-auto max-h-[calc(100vh-140px)]">
            {navSections.map((section) => {
              const visibleItems = section.items.filter(
                (item) => !item.permission || can(user, item.permission),
              );
              if (visibleItems.length === 0) return null;

              return (
                <div key={section.title}>
                  {!sidebarCollapsed && (
                    <div
                      className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5"
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: section.accent }} />
                      <span>{section.title}</span>
                    </div>
                  )}
                  <div className="space-y-0.5">
                    {visibleItems.map((item) => {
                      const isActive = pathname === item.href;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          title={sidebarCollapsed ? item.label : undefined}
                          className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                            isActive
                              ? 'bg-teal-500/15 text-teal-300 font-semibold border border-teal-500/30'
                              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                          } ${sidebarCollapsed ? 'justify-center' : ''}`}
                        >
                          <span className="flex items-center gap-2.5">
                            <span className="text-sm">{item.icon}</span>
                            {!sidebarCollapsed && <span>{item.label}</span>}
                          </span>
                          {!sidebarCollapsed && item.badge && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-teal-500/20 text-teal-300">
                              {item.badge}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer / User Profile summary */}
        <div className="p-3 border-t border-zinc-800 bg-zinc-900/60">
          <Link
            href="/me"
            className="flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-zinc-800/60 transition-colors"
          >
            <Avatar name={user?.name || 'User'} size="sm" />
            {!sidebarCollapsed && (
              <div className="truncate">
                <div className="text-xs font-semibold text-white truncate">{user?.name || 'Loading...'}</div>
                <div className="text-[10px] text-zinc-400">{user?.role || ''}</div>
              </div>
            )}
          </Link>
        </div>
      </aside>

      {/* 2. Main Workspace Layout */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar (§3) */}
        <header className="h-16 border-b border-zinc-800 bg-zinc-900/30 px-6 flex items-center justify-between shrink-0 sticky top-0 z-10 backdrop-blur-md">
          <div className="flex items-center gap-4">
            {/* Site Switcher (§3, F2-03) */}
            <div
              id="site-switcher"
              className="flex items-center gap-2 bg-zinc-800/60 border border-zinc-700/60 rounded-xl px-3 py-1.5 text-xs"
            >
              <span className="text-zinc-400">Site:</span>
              <select
                className="bg-transparent text-white font-medium outline-none cursor-pointer"
                value={activeSite}
                onChange={(e) => handleSiteChange(e.target.value)}
              >
                {user?.role === 'OWNER' && <option value="all" className="bg-zinc-900">All Sites (Aggregated)</option>}
                {(user?.sites || []).map((s) => (
                  <option key={s.id} value={s.id} className="bg-zinc-900">
                    {s.name} ({s.siteType})
                  </option>
                ))}
              </select>
            </div>

            {/* Global Search Command Button (Ctrl+K, F2-04) */}
            <button
              id="command-palette-btn"
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-3 bg-zinc-800/40 hover:bg-zinc-800/80 border border-zinc-700/50 rounded-xl px-3.5 py-1.5 text-xs text-zinc-400 transition-colors"
            >
              <span>🔍 Search records...</span>
              <Kbd>Ctrl+K</Kbd>
            </button>
          </div>

          <div className="flex items-center gap-3">
            {/* Approvals Badge Button (✅ F2-05) */}
            <button
              id="approvals-btn"
              type="button"
              onClick={() => setApprovalsOpen(true)}
              className="relative p-2 rounded-xl bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700/50 text-sm flex items-center gap-1.5"
              title="Approvals & Exceptions Queue"
            >
              <span>✅</span>
              {pendingApprovalsCount > 0 && (
                <span className="text-xs font-bold text-amber-300">{pendingApprovalsCount}</span>
              )}
            </button>

            {/* Notifications Bell (🔔 F2-06) */}
            <button
              id="notifications-btn"
              type="button"
              onClick={() => setNotificationsOpen(true)}
              className="relative p-2 rounded-xl bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700/50 text-sm"
              title="System Notifications"
            >
              <span>🔔</span>
              {unreadNotifsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-teal-500 text-white font-bold text-[10px] flex items-center justify-center">
                  {unreadNotifsCount}
                </span>
              )}
            </button>

            {/* Help Button (? F2-11) */}
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="p-2 rounded-xl bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700/50 text-sm font-bold w-9 h-9 flex items-center justify-center"
              title="Help & Shortcuts (?)"
            >
              ?
            </button>

            {/* User Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 p-1 rounded-full hover:ring-2 hover:ring-teal-500 focus:outline-none"
              >
                <Avatar name={user?.name || 'U'} size="sm" />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-2 z-50 text-xs">
                  <div className="px-3 py-2 border-b border-zinc-800">
                    <div className="font-bold text-white truncate">{user?.name}</div>
                    <div className="text-[10px] text-teal-400 font-semibold">{user?.role}</div>
                  </div>
                  <Link
                    href="/me"
                    onClick={() => setUserMenuOpen(false)}
                    className="block px-3 py-2 text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg"
                  >
                    👤 My Profile
                  </Link>
                  <Link
                    href="/floor"
                    onClick={() => setUserMenuOpen(false)}
                    className="block px-3 py-2 text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg"
                  >
                    📱 Switch to Floor Mode
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full text-left px-3 py-2 text-rose-400 hover:bg-rose-500/10 rounded-lg"
                  >
                    ↪ Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Breadcrumb Navigation Bar */}
        <div className="px-6 py-2.5 bg-zinc-900/20 border-b border-zinc-800/60 flex items-center justify-between text-xs text-zinc-400 select-none">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <Link href="/home" className="hover:text-white flex items-center gap-1">
              <span>🏠</span>
              <span>Home</span>
            </Link>
            {breadcrumbItems.map((b, idx) => (
              <React.Fragment key={b.href}>
                <span className="text-zinc-600">›</span>
                {idx === breadcrumbItems.length - 1 ? (
                  <span className="text-zinc-200 font-semibold">{b.label}</span>
                ) : (
                  <Link href={b.href} className="hover:text-white">
                    {b.label}
                  </Link>
                )}
              </React.Fragment>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-indicator" />
              Live Connected (30s)
            </span>
          </div>
        </div>

        {/* Site Switch Feedback Toast */}
        {siteToast && (
          <div className="fixed top-20 right-6 z-50 p-3 rounded-xl bg-teal-950/90 border border-teal-500/40 text-teal-200 text-xs shadow-xl animate-fade-in flex items-center gap-2">
            <span>✓</span>
            <span>{siteToast}</span>
          </div>
        )}

        {/* Main Viewport Content */}
        <main className="flex-1 p-6 overflow-y-auto">{children}</main>
      </div>

      {/* Global Dialogs & Drawers */}
      <SearchPalette
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        siteId={activeSite === 'all' ? undefined : activeSite}
      />

      <ApprovalsDrawer
        open={approvalsOpen}
        onClose={() => setApprovalsOpen(false)}
        onCountChange={(count) => setPendingApprovalsCount(count)}
      />

      <NotificationsDrawer
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        onUnreadCountChange={(count) => setUnreadNotifsCount(count)}
      />

      <HelpModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        onStartTour={() => setTourActive(true)}
      />

      <TourEngine
        steps={tourSteps}
        active={tourActive}
        onComplete={() => setTourActive(false)}
      />

      <LockScreenOverlay user={user} idleTimeoutMinutes={30} />
    </div>
  );
}
