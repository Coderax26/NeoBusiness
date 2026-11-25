'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { can, type SessionUser } from '@neo/shared';
import { SearchPalette } from '../../src/components/ui/SearchPalette';
import { ApprovalsDrawer } from '../../src/components/shell/ApprovalsDrawer';
import { NotificationsDrawer } from '../../src/components/shell/NotificationsDrawer';
import { HelpModal } from '../../src/components/shell/HelpModal';
import { LockScreenOverlay } from '../../src/components/shell/LockScreenOverlay';
import { TourEngine, Avatar, Kbd, useTheme } from '@neo/ui';
import { NAV_ICONS, ACTION_ICONS } from '../../src/lib/icons';
import { useLocale } from '../../src/lib/locale';

interface SubTabItem {
  label: string;
  href: string;
  permission?: string;
}

interface ModuleConfig {
  id: string;
  label: string;
  labelMr: string;
  href: string;
  iconKey: keyof typeof NAV_ICONS;
  matchPrefixes: string[];
  permission?: string;
  tabs: SubTabItem[];
}

const MODULES: ModuleConfig[] = [
  {
    id: 'today',
    label: 'Today',
    labelMr: 'आज',
    href: '/home',
    iconKey: 'today',
    matchPrefixes: ['/home', '/control/dashboard', '/control/analytics', '/control/notifications'],
    tabs: [
      { label: 'Today', href: '/home' },
      { label: 'Control Tower', href: '/control/dashboard', permission: 'dashboard.read_pulse' },
      { label: 'Analytics', href: '/control/analytics', permission: 'analytics.read_customers' },
      { label: 'Notifications', href: '/control/notifications', permission: 'audit.view' },
    ],
  },
  {
    id: 'approvals',
    label: 'Approvals',
    labelMr: 'मंजुरी',
    href: '/control/approvals',
    iconKey: 'approvals',
    matchPrefixes: ['/control/approvals'],
    permission: 'exception.resolve',
    tabs: [
      { label: 'Approvals Queue', href: '/control/approvals', permission: 'exception.resolve' },
    ],
  },
  {
    id: 'sales',
    label: 'Sales',
    labelMr: 'विक्री',
    href: '/sales/orders',
    iconKey: 'sales',
    matchPrefixes: ['/sales'],
    tabs: [
      { label: 'Orders', href: '/sales/orders', permission: 'order.view' },
      { label: 'Quotes', href: '/sales/quotes', permission: 'quote.view' },
      { label: 'Customers', href: '/sales/customers', permission: 'customer.view' },
      { label: "Today's prices", href: '/sales/prices', permission: 'price.set_daily' },
      { label: 'Items', href: '/sales/items', permission: 'order.view' },
      { label: 'Returns', href: '/sales/returns', permission: 'order.view' },
      { label: 'Board', href: '/sales/board', permission: 'order.view' },
    ],
  },
  {
    id: 'purchase',
    label: 'Purchase',
    labelMr: 'खरेदी',
    href: '/procurement',
    iconKey: 'purchase',
    matchPrefixes: ['/procurement'],
    tabs: [
      { label: 'Overview', href: '/procurement', permission: 'po.read' },
      { label: 'Purchase Orders', href: '/procurement/purchase-orders', permission: 'po.read' },
      { label: 'Requisitions', href: '/procurement/requisitions', permission: 'requisition.read' },
      { label: 'Goods Received', href: '/procurement/grns', permission: 'grn.read' },
      { label: 'Suppliers & Rates', href: '/procurement/suppliers', permission: 'supplier.read' },
      { label: 'Supplier Bills', href: '/procurement/supplier-bills', permission: 'po.read' },
      { label: 'Short supplies', href: '/procurement/shortfalls', permission: 'po.read' },
      { label: 'Scorecards', href: '/procurement/scorecards', permission: 'supplier.read' },
    ],
  },
  {
    id: 'stock',
    label: 'Stock',
    labelMr: 'साठा',
    href: '/inventory/stock',
    iconKey: 'stock',
    matchPrefixes: ['/inventory', '/control/stock-alerts'],
    tabs: [
      { label: 'Stock Overview', href: '/inventory/stock', permission: 'inventory.read' },
      { label: 'Check Availability', href: '/inventory/availability', permission: 'inventory.read' },
      { label: 'Expiry Watchlist', href: '/inventory/expiry', permission: 'inventory.read' },
      { label: 'Transfers', href: '/inventory/transfers', permission: 'inventory.transfer' },
      { label: 'Adjustments', href: '/inventory/adjustments', permission: 'inventory.adjust' },
      { label: 'Stock Ledger', href: '/inventory/ledger', permission: 'inventory.read' },
      { label: 'Reservations', href: '/inventory/reservations', permission: 'inventory.read' },
      { label: 'Physical Counts', href: '/inventory/stock-counts', permission: 'inventory.read' },
      { label: 'Stock Alerts', href: '/control/stock-alerts', permission: 'inventory.read' },
    ],
  },
  {
    id: 'factory',
    label: 'Factory',
    labelMr: 'कारखाना',
    href: '/production',
    iconKey: 'factory',
    matchPrefixes: ['/production'],
    tabs: [
      { label: 'Overview', href: '/production', permission: 'wo.read' },
      { label: 'Work Orders', href: '/production/work-orders', permission: 'wo.read' },
      { label: 'Recipes & BOMs', href: '/production/boms', permission: 'wo.read' },
      { label: 'RM Requisitions', href: '/production/requisitions', permission: 'requisition.read' },
      { label: 'Wastage Log', href: '/production/wastage', permission: 'wo.read' },
      { label: 'Attendance', href: '/production/attendance', permission: 'wo.read' },
      { label: 'Floor Terminal', href: '/floor' },
    ],
  },
  {
    id: 'delivery',
    label: 'Delivery',
    labelMr: 'वितरण',
    href: '/logistics/dispatch',
    iconKey: 'delivery',
    matchPrefixes: ['/logistics'],
    tabs: [
      { label: 'Dispatch Board', href: '/logistics/dispatch', permission: 'fleet.view' },
      { label: 'Plan Trip', href: '/logistics/trips/new', permission: 'fleet.view' },
      { label: 'Trips & ePOD', href: '/logistics/trips', permission: 'fleet.view' },
      { label: 'Delivery Issues', href: '/logistics/issues', permission: 'fleet.view' },
      { label: 'Trip Expenses', href: '/logistics/expenses', permission: 'fleet.view' },
      { label: 'Vehicles', href: '/logistics/vehicles', permission: 'fleet.view' },
      { label: 'Monitoring', href: '/logistics/monitoring', permission: 'fleet.view' },
    ],
  },
  {
    id: 'money',
    label: 'Money',
    labelMr: 'पैसे',
    href: '/finance',
    iconKey: 'money',
    matchPrefixes: ['/finance'],
    tabs: [
      { label: 'Overview', href: '/finance', permission: 'finance.view' },
      { label: 'Tax Invoices', href: '/finance/invoices', permission: 'finance.view' },
      { label: 'To Collect (AR)', href: '/finance/receivables', permission: 'finance.view' },
      { label: 'Collections', href: '/finance/collections', permission: 'finance.view' },
      { label: 'Cash Handovers', href: '/finance/handovers', permission: 'receipt.verify_handover' },
      { label: 'Cheques & PDC', href: '/finance/cheques', permission: 'finance.view' },
      { label: 'Credit Notes', href: '/finance/credit-notes', permission: 'finance.view' },
      { label: 'COD Settlement', href: '/finance/cod', permission: 'finance.view' },
      { label: 'Promises to Pay', href: '/finance/ptp', permission: 'finance.view' },
      { label: 'Payables', href: '/finance/payables', permission: 'finance.view' },
      { label: 'Day Closing (EOD)', href: '/finance/eod', permission: 'eod.signoff' },
      { label: 'Tally XML Export', href: '/finance/tally', permission: 'finance.view' },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    labelMr: 'अहवाल',
    href: '/reports',
    iconKey: 'reports',
    matchPrefixes: ['/reports'],
    permission: 'report.view',
    tabs: [
      { label: 'Report Library', href: '/reports', permission: 'report.view' },
      { label: 'Scheduled Reports', href: '/reports/scheduled', permission: 'report.view' },
    ],
  },
];

const SETTINGS_TABS: SubTabItem[] = [
  { label: 'Company', href: '/admin/company', permission: 'admin.manage' },
  { label: 'Users', href: '/admin/users', permission: 'admin.manage' },
  { label: 'Roles', href: '/admin/roles', permission: 'admin.manage' },
  { label: 'Sites', href: '/admin/sites', permission: 'admin.manage' },
  { label: 'Opening Balances', href: '/admin/opening-balances', permission: 'admin.manage' },
  { label: 'Business Rules', href: '/admin/business-rules', permission: 'config.edit' },
  { label: 'Approval Rules', href: '/admin/approval-rules', permission: 'config.edit' },
  { label: 'Templates & Series', href: '/admin/templates', permission: 'config.edit' },
  { label: 'Audit Trail', href: '/control/audit', permission: 'audit.view' },
  { label: 'System Health', href: '/admin/system', permission: 'admin.manage' },
  { label: 'Go-Live Checklist', href: '/admin/rollout', permission: 'admin.manage' },
  { label: 'Extensions', href: '/extensions' },
  { label: 'Help & Training', href: '/help' },
];

const CREATE_MENU_ITEMS = [
  { label: 'New sales order', href: '/sales/orders/new', shortcut: 'O' },
  { label: 'Record a payment', href: '/finance/collections', shortcut: 'P' },
  { label: 'Receive goods (GRN)', href: '/procurement/grns', shortcut: 'G' },
  { label: 'New purchase order', href: '/procurement/purchase-orders', shortcut: 'B' },
  { label: 'Plan a trip', href: '/logistics/trips/new', shortcut: 'T' },
  { label: 'Stock adjustment', href: '/inventory/adjustments', shortcut: 'A' },
];

export default function OfficeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { locale, setLocale } = useLocale();

  const [user, setUser] = useState<SessionUser | null>(null);
  const [activeSite, setActiveSite] = useState<string>('all');
  const [siteToast, setSiteToast] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  // Shell UI states
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [moreTabsOpen, setMoreTabsOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    setIsOffline(!navigator.onLine);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Global Keyboard Shortcuts (Ctrl+K, N, ?)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      } else if (!inInput && e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setCreateMenuOpen((prev) => !prev);
      } else if (e.key === '?' && !inInput) {
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
    setSiteToast(`Switched site to ${siteName}`);
    setTimeout(() => setSiteToast(null), 3000);
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const visibleModules = useMemo(
    () =>
      MODULES.filter((mod) => {
        if (!mod.permission) return true;
        return can(user, mod.permission);
      }),
    [user],
  );

  const isSettingsPath =
    pathname.startsWith('/admin') ||
    pathname.startsWith('/control/audit') ||
    pathname.startsWith('/extensions') ||
    pathname.startsWith('/help');

  const activeModule = useMemo(() => {
    if (isSettingsPath) return null;
    return (
      MODULES.find((m) => m.matchPrefixes.some((p) => pathname.startsWith(p))) ?? MODULES[0]
    );
  }, [pathname, isSettingsPath]);

  const activeTabs = useMemo(() => {
    const raw = isSettingsPath ? SETTINGS_TABS : activeModule?.tabs ?? [];
    return raw.filter((tab) => !tab.permission || can(user, tab.permission));
  }, [isSettingsPath, activeModule, user]);

  const visibleTabs = activeTabs.slice(0, 5);
  const overflowTabs = activeTabs.slice(5);

  const todayDateStr = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date());
    } catch {
      return '';
    }
  }, []);

  const tourSteps = [
    { targetElementId: 'site-switcher', title: 'Site Switcher', content: 'Switch between factory plants, hubs, or view All Sites together.' },
    { targetElementId: 'command-palette-btn', title: 'Search Everything (Ctrl+K)', content: 'Press Ctrl+K anytime to jump directly to a customer, order, item, or trip.' },
    { targetElementId: 'approvals-btn', title: 'Approvals Queue', content: 'Review below-floor prices, credit limit requests, and supplier price rises.' },
    { targetElementId: 'notifications-btn', title: 'Notifications', content: 'Stay informed on staged orders, cash handovers, and stock expiry.' },
  ];

  const isNight = theme === 'night' || theme === 'dark';

  return (
    <div className="flex min-h-screen bg-paper text-ink font-sans">
      {/* 1. Desktop Bahi-Khata Sidebar */}
      <aside
        className={`hidden lg:flex ${
          sidebarCollapsed ? 'w-[72px]' : 'w-[236px]'
        } bg-paper relative flex-col justify-between shrink-0 transition-all duration-150 select-none z-20 no-print`}
      >
        {/* Signature Double Madder Margin Rule */}
        <div
          aria-hidden="true"
          className="absolute top-0 bottom-0 right-0 bahi-margin-rule pointer-events-none"
        />

        <div className={sidebarCollapsed ? 'px-2 pt-5' : 'pl-4 pt-5'}>
          {/* Brand Wordmark & Collapse */}
          <div className={`flex items-center justify-between pb-4 ${sidebarCollapsed ? 'px-1' : 'px-3.5 pr-6'}`}>
            <Link href="/home" className="min-w-0">
              <div className="font-serif text-[23px] font-semibold tracking-tight text-ink leading-none">
                {sidebarCollapsed ? 'NB' : 'NeoBus'}
              </div>
              {!sidebarCollapsed && (
                <div className="text-[12.5px] text-ink-3 mt-1 truncate">
                  {user?.sites?.[0]?.name || 'Baramati Agro Foods'}
                </div>
              )}
            </Link>
            <button
              type="button"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="text-ink-3 hover:text-ink p-1 rounded-[3px] hover:bg-sheet"
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? (
                <ACTION_ICONS.chevronRight className="w-4 h-4" />
              ) : (
                <ACTION_ICONS.chevronLeft className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Primary + New Action Button + Create Menu */}
          <div className={`relative mb-4 ${sidebarCollapsed ? 'px-1' : 'pr-[22px]'}`}>
            <button
              type="button"
              onClick={() => setCreateMenuOpen((o) => !o)}
              className={`w-full h-[38px] bg-action hover:bg-action-hover text-white rounded-[3px] font-medium text-[14px] flex items-center ${
                sidebarCollapsed ? 'justify-center' : 'px-3.5 gap-2'
              } transition-colors`}
              title="Create new record (N)"
            >
              <ACTION_ICONS.plus className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && (
                <>
                  <span>New</span>
                  <kbd className="ml-auto font-mono text-[11.5px] px-1.5 py-0 rounded-[2px] border border-white/35 text-white/90">
                    N
                  </kbd>
                </>
              )}
            </button>

            {createMenuOpen && (
              <div
                className="absolute left-0 top-full mt-1.5 w-60 bg-sheet border border-rule-strong rounded-[4px] shadow-xl py-1.5 z-50"
                onMouseLeave={() => setCreateMenuOpen(false)}
              >
                {CREATE_MENU_ITEMS.map((item) => (
                  <Link
                    key={item.href + item.label}
                    href={item.href}
                    onClick={() => setCreateMenuOpen(false)}
                    className="flex items-center justify-between px-3.5 py-2 text-[13.5px] text-ink hover:bg-paper transition-colors"
                  >
                    <span>{item.label}</span>
                    <Kbd>{item.shortcut}</Kbd>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* 9 Clean Module Links with Index-Tab Active State */}
          <nav className="space-y-0.5 overflow-y-auto max-h-[calc(100vh-280px)]">
            {visibleModules.map((mod) => {
              const Icon = NAV_ICONS[mod.iconKey];
              const isActive = !isSettingsPath && activeModule?.id === mod.id;
              const badgeCount = mod.id === 'approvals' ? pendingApprovalsCount : 0;

              return (
                <Link
                  key={mod.id}
                  href={mod.href}
                  title={sidebarCollapsed ? mod.label : undefined}
                  className={`flex items-center gap-3 h-[38px] text-[14.5px] transition-colors relative z-10 ${
                    sidebarCollapsed ? 'justify-center px-2 rounded-[3px]' : 'px-3.5 rounded-l-[3px]'
                  } ${
                    isActive
                      ? 'bg-sheet text-ink font-semibold mr-0 shadow-[inset_1px_0_0_var(--rule),inset_0_1px_0_var(--rule),inset_0_-1px_0_var(--rule)]'
                      : 'text-ink-2 hover:text-ink hover:bg-sheet/50 mr-3'
                  }`}
                >
                  <Icon className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-action' : 'text-ink-2'}`} strokeWidth={1.75} />
                  {!sidebarCollapsed && (
                    <span className="truncate">{locale === 'mr' ? mod.labelMr : mod.label}</span>
                  )}
                  {!sidebarCollapsed && badgeCount > 0 && (
                    <span className="ml-auto text-[12px] font-semibold bg-madder text-white rounded-full px-1.5 leading-[18px]">
                      {badgeCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer: Settings, Help, User, Language & Theme */}
        <div className={`${sidebarCollapsed ? 'px-2 pb-4' : 'pl-4 pr-5 pb-4'} pt-2.5 border-t border-rule mr-0`}>
          <div className="space-y-0.5 mb-2">
            <Link
              href="/admin/company"
              className={`flex items-center gap-3 h-[36px] px-3 text-[14px] rounded-[3px] transition-colors ${
                isSettingsPath ? 'bg-sheet text-ink font-semibold' : 'text-ink-2 hover:text-ink hover:bg-sheet/50'
              } ${sidebarCollapsed ? 'justify-center px-2' : ''}`}
              title="Settings"
            >
              <NAV_ICONS.settings className="w-[17px] h-[17px] shrink-0" strokeWidth={1.75} />
              {!sidebarCollapsed && <span>Settings</span>}
            </Link>
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className={`w-full flex items-center gap-3 h-[36px] px-3 text-[14px] text-ink-2 hover:text-ink hover:bg-sheet/50 rounded-[3px] transition-colors ${
                sidebarCollapsed ? 'justify-center px-2' : ''
              }`}
              title="Help & Shortcuts (?)"
            >
              <NAV_ICONS.help className="w-[17px] h-[17px] shrink-0" strokeWidth={1.75} />
              {!sidebarCollapsed && <span>Help</span>}
            </button>
          </div>

          {!sidebarCollapsed && (
            <div className="px-3 pt-2 border-t border-rule flex items-center gap-2.5">
              <Link href="/me" className="flex items-center gap-2.5 min-w-0 flex-1 group">
                <Avatar name={user?.name || 'User'} size="sm" />
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold text-ink truncate group-hover:text-action">
                    {user?.name || 'Loading...'}
                  </div>
                  <div className="text-[12px] text-ink-3 truncate">{user?.role || ''}</div>
                </div>
              </Link>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setLocale(locale === 'en' ? 'mr' : 'en')}
                  className="text-[12px] px-1.5 py-0.5 rounded-[3px] border border-rule-strong text-ink-2 hover:text-ink"
                  title="Switch language (English / Marathi)"
                >
                  {locale === 'en' ? 'मराठी' : 'EN'}
                </button>
                <button
                  type="button"
                  onClick={() => setTheme(isNight ? 'paper' : 'night')}
                  className="p-1 rounded-[3px] border border-rule-strong text-ink-2 hover:text-ink"
                  title={isNight ? 'Switch to Paper theme' : 'Switch to Night theme'}
                  aria-label="Toggle theme"
                >
                  {isNight ? <ACTION_ICONS.sun className="w-3.5 h-3.5" /> : <ACTION_ICONS.moon className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* 2. Main Sheet Workspace */}
      <div className="flex-1 flex flex-col min-w-0 bg-sheet pb-16 lg:pb-0">
        {/* Topbar with Module Tabs */}
        <header className="h-[60px] border-b border-rule px-4 sm:px-8 flex items-center justify-between gap-4 shrink-0 sticky top-0 z-10 bg-sheet no-print">
          {/* Left: Module Sub-Tabs or Today's Date */}
          <div className="flex items-center gap-5 h-full overflow-x-auto min-w-0">
            {pathname === '/home' ? (
              <span className="text-[13.5px] text-ink-3 whitespace-nowrap">{todayDateStr}</span>
            ) : (
              <>
                {visibleTabs.map((tab) => {
                  const isTabActive =
                    pathname === tab.href ||
                    (tab.href !== '/procurement' &&
                      tab.href !== '/production' &&
                      tab.href !== '/finance' &&
                      pathname.startsWith(tab.href + '/'));
                  return (
                    <Link
                      key={tab.href}
                      href={tab.href}
                      className={`h-full flex items-center text-[14px] border-b-2 -mb-px whitespace-nowrap transition-colors ${
                        isTabActive
                          ? 'border-ink text-ink font-semibold'
                          : 'border-transparent text-ink-2 hover:text-ink'
                      }`}
                    >
                      {tab.label}
                    </Link>
                  );
                })}
                {overflowTabs.length > 0 && (
                  <div className="relative h-full flex items-center">
                    <button
                      type="button"
                      onClick={() => setMoreTabsOpen((o) => !o)}
                      className="text-[13.5px] text-ink-2 hover:text-ink flex items-center gap-1 py-1 px-1.5 rounded-[3px]"
                    >
                      <span>More</span>
                      <ACTION_ICONS.chevronDown className="w-3.5 h-3.5" />
                    </button>
                    {moreTabsOpen && (
                      <div
                        className="absolute left-0 top-full mt-0.5 w-52 bg-sheet border border-rule-strong rounded-[4px] shadow-xl py-1.5 z-50"
                        onMouseLeave={() => setMoreTabsOpen(false)}
                      >
                        {overflowTabs.map((tab) => (
                          <Link
                            key={tab.href}
                            href={tab.href}
                            onClick={() => setMoreTabsOpen(false)}
                            className={`block px-3.5 py-2 text-[13.5px] hover:bg-paper ${
                              pathname === tab.href ? 'font-semibold text-action' : 'text-ink-2'
                            }`}
                          >
                            {tab.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Right: Site Switcher, Search, Approvals, Notifications, User */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div id="site-switcher" className="hidden md:flex items-center gap-1 text-[13.5px] text-ink-2">
              <select
                className="bg-transparent text-ink-2 hover:text-ink font-medium outline-none cursor-pointer pr-1 py-1"
                value={activeSite}
                onChange={(e) => handleSiteChange(e.target.value)}
                aria-label="Active site"
              >
                {user?.role === 'OWNER' && <option value="all">All Sites (Aggregated)</option>}
                {(user?.sites || []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.siteType})
                  </option>
                ))}
              </select>
            </div>

            <button
              id="command-palette-btn"
              type="button"
              onClick={() => setSearchOpen(true)}
              className="hidden sm:flex items-center gap-2.5 w-60 lg:w-72 h-[36px] bg-paper border border-rule-strong hover:border-action rounded-[3px] px-3 text-[13.5px] text-ink-3 transition-colors"
            >
              <ACTION_ICONS.search className="w-4 h-4 shrink-0" />
              <span className="truncate">Search orders, customers...</span>
              <Kbd>Ctrl+K</Kbd>
            </button>

            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="sm:hidden w-9 h-9 border border-rule-strong rounded-[3px] flex items-center justify-center text-ink-2"
              aria-label="Search"
            >
              <ACTION_ICONS.search className="w-4 h-4" />
            </button>

            <button
              id="approvals-btn"
              type="button"
              onClick={() => setApprovalsOpen(true)}
              className="relative w-9 h-9 border border-rule-strong bg-sheet hover:bg-paper rounded-[3px] flex items-center justify-center text-ink-2 hover:text-ink transition-colors"
              title="Approvals queue"
              aria-label="Approvals queue"
            >
              <ACTION_ICONS.checkCircle className="w-4 h-4" />
              {pendingApprovalsCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-madder text-white text-[11px] font-semibold flex items-center justify-center">
                  {pendingApprovalsCount}
                </span>
              )}
            </button>

            <button
              id="notifications-btn"
              type="button"
              onClick={() => setNotificationsOpen(true)}
              className="relative w-9 h-9 border border-rule-strong bg-sheet hover:bg-paper rounded-[3px] flex items-center justify-center text-ink-2 hover:text-ink transition-colors"
              title="Notifications"
              aria-label="Notifications"
            >
              <ACTION_ICONS.bell className="w-4 h-4" />
              {unreadNotifsCount > 0 && (
                <span className="absolute top-1.5 right-2 w-2 h-2 rounded-full bg-madder" />
              )}
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center rounded-full focus:outline-none focus:ring-2 focus:ring-action"
                aria-label="Account menu"
              >
                <Avatar name={user?.name || 'U'} size="sm" />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-52 bg-sheet border border-rule-strong rounded-[4px] shadow-xl py-1.5 z-50 text-[13.5px]">
                  <div className="px-3.5 py-2 border-b border-rule">
                    <div className="font-semibold text-ink truncate">{user?.name}</div>
                    <div className="text-[12.5px] text-ink-3">{user?.role}</div>
                  </div>
                  <Link
                    href="/me"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 px-3.5 py-2 text-ink-2 hover:text-ink hover:bg-paper"
                  >
                    <ACTION_ICONS.user className="w-4 h-4" />
                    My Profile
                  </Link>
                  <Link
                    href="/floor"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 px-3.5 py-2 text-ink-2 hover:text-ink hover:bg-paper"
                  >
                    <ACTION_ICONS.phone className="w-4 h-4" />
                    Switch to Floor Mode
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 text-left px-3.5 py-2 text-madder hover:bg-madder-soft"
                  >
                    <ACTION_ICONS.logout className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Show connectivity banner ONLY when offline */}
        {isOffline && (
          <div className="px-8 py-2 bg-haldi-soft border-b border-haldi/30 text-[13px] text-haldi font-medium no-print">
            Offline — changes will sync once connection returns.
          </div>
        )}

        {/* Site Switch Feedback Toast */}
        {siteToast && (
          <div className="fixed top-20 right-6 z-50 px-4 py-2.5 rounded-[4px] bg-sheet border border-rule-strong text-ink text-[13.5px] shadow-xl flex items-center gap-2">
            <ACTION_ICONS.check className="w-4 h-4 text-leaf" />
            <span>{siteToast}</span>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 px-4 py-5 sm:px-9 sm:py-7 overflow-y-auto">{children}</main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-[62px] bg-sheet border-t border-rule flex items-center justify-around px-2 z-30 no-print">
        {[
          { id: 'today', label: 'Today', href: '/home', Icon: NAV_ICONS.today },
          { id: 'approvals', label: 'Approvals', href: '/control/approvals', Icon: NAV_ICONS.approvals, badge: pendingApprovalsCount },
          { id: 'sales', label: 'Sales', href: '/sales/orders', Icon: NAV_ICONS.sales },
          { id: 'money', label: 'Money', href: '/finance', Icon: NAV_ICONS.money },
        ].map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`relative flex flex-col items-center justify-center gap-0.5 text-[12px] px-3 py-1 ${
                isActive ? 'text-action font-semibold' : 'text-ink-3'
              }`}
            >
              <item.Icon className="w-5 h-5" />
              <span>{item.label}</span>
              {item.badge ? (
                <span className="absolute top-0 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-madder text-white text-[10.5px] font-semibold flex items-center justify-center">
                  {item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileMoreOpen((o) => !o)}
          className="flex flex-col items-center justify-center gap-0.5 text-[12px] px-3 py-1 text-ink-3"
        >
          <ACTION_ICONS.more className="w-5 h-5" />
          <span>More</span>
        </button>
      </nav>

      {mobileMoreOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/40 flex items-end" onClick={() => setMobileMoreOpen(false)}>
          <div
            className="w-full bg-sheet border-t border-rule-strong rounded-t-[8px] p-4 space-y-2 max-h-[75vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[14px] font-semibold text-ink pb-2 border-b border-ink">All Sections</div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              {visibleModules.map((mod) => {
                const Icon = NAV_ICONS[mod.iconKey];
                return (
                  <Link
                    key={mod.id}
                    href={mod.href}
                    onClick={() => setMobileMoreOpen(false)}
                    className="flex items-center gap-2.5 p-3 rounded-[4px] border border-rule bg-paper text-[14px] text-ink"
                  >
                    <Icon className="w-4 h-4 text-action" />
                    <span>{mod.label}</span>
                  </Link>
                );
              })}
              <Link
                href="/admin/company"
                onClick={() => setMobileMoreOpen(false)}
                className="flex items-center gap-2.5 p-3 rounded-[4px] border border-rule bg-paper text-[14px] text-ink"
              >
                <NAV_ICONS.settings className="w-4 h-4 text-action" />
                <span>Settings</span>
              </Link>
            </div>
          </div>
        </div>
      )}

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
