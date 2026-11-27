'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
import { getRoleLabel, SITE_TYPE_LABELS } from '../../src/lib/settings-copy';

interface SubTabItem {
  label: string;
  href: string;
  permission?: string;
  description?: string;
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
  { label: 'Company', href: '/admin/company', permission: 'admin.manage', description: 'Business name, GST/PAN, bank details & invoice footer' },
  { label: 'Users', href: '/admin/users', permission: 'admin.manage', description: 'Staff accounts, login PINs & assigned locations' },
  { label: 'Roles', href: '/admin/roles', permission: 'admin.manage', description: 'What each staff role can view and do' },
  { label: 'Sites', href: '/admin/sites', permission: 'admin.manage', description: 'Factories, warehouses, fulfillment sites & storage areas' },
  { label: 'Opening Balances', href: '/admin/opening-balances', permission: 'admin.manage', description: 'Starting customer & supplier balances before go-live' },
  { label: 'Business Rules', href: '/admin/business-rules', permission: 'config.edit', description: 'Profit limits, credit days, alerts & daily rules' },
  { label: 'Approval Rules', href: '/admin/approval-rules', permission: 'config.edit', description: 'Who approves price overrides, credit & cash mismatches' },
  { label: 'Templates & Series', href: '/admin/templates', permission: 'config.edit', description: 'WhatsApp/SMS alerts & invoice/order number format' },
  { label: 'Audit Trail', href: '/control/audit', permission: 'audit.view', description: 'Permanent history of who changed what and when' },
  { label: 'System Health', href: '/admin/system', permission: 'admin.manage', description: 'App status, database connection & alert queue' },
  { label: 'Go-Live Checklist', href: '/admin/rollout', permission: 'admin.manage', description: 'Launch readiness checklist for your business' },
  { label: 'Extensions', href: '/extensions', description: 'Optional add-on tools like scanners and reports' },
  { label: 'Help & Training', href: '/help', description: 'Quick step-by-step guides & simple word glossary' },
];

const CREATE_MENU_ITEMS = [
  { label: 'New sales order', href: '/sales/orders/new', shortcut: 'O' },
  { label: 'Record a payment', href: '/finance/collections', shortcut: 'P' },
  { label: 'Receive goods (GRN)', href: '/procurement/grns', shortcut: 'G' },
  { label: 'New purchase order', href: '/procurement/purchase-orders', shortcut: 'B' },
  { label: 'Plan a trip', href: '/logistics/trips/new', shortcut: 'T' },
  { label: 'Stock adjustment', href: '/inventory/adjustments', shortcut: 'A' },
];

const MODULE_ROOT_HREFS = new Set(['/home', '/procurement', '/production', '/finance', '/reports']);

function isSubTabActive(pathname: string, tabHref: string): boolean {
  if (pathname === tabHref) return true;
  if (MODULE_ROOT_HREFS.has(tabHref)) return false;
  if (tabHref === '/logistics/trips' && pathname === '/logistics/trips/new') return false;
  return pathname.startsWith(tabHref + '/');
}

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
  const [expandedModuleId, setExpandedModuleId] = useState<string | null>('today');
  const [collapsedFlyout, setCollapsedFlyout] = useState<{
    id: string;
    label: string;
    tabs: SubTabItem[];
    top: number;
  } | null>(null);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [mobileSectionOpen, setMobileSectionOpen] = useState(false);
  const [mobileCreateOpen, setMobileCreateOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [approvalsOpen, setApprovalsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [tourActive, setTourActive] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Badge counts
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [unreadNotifsCount, setUnreadNotifsCount] = useState(0);

  const loadSessionUser = useCallback(() => {
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
    loadSessionUser();
  }, [loadSessionUser]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onSitesUpdated = () => loadSessionUser();
    window.addEventListener('neobus-sites-updated', onSitesUpdated);
    return () => window.removeEventListener('neobus-sites-updated', onSitesUpdated);
  }, [loadSessionUser]);

  useEffect(() => {
    if (!userMenuOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [userMenuOpen]);

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

  // Global Keyboard Shortcuts (Ctrl+K, N, ?, Escape)
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
      } else if (e.key === 'Escape') {
        setCreateMenuOpen(false);
        setCollapsedFlyout(null);
        setUserMenuOpen(false);
        setMobileDrawerOpen(false);
        setMobileSectionOpen(false);
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
    setUserMenuOpen(false);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Proceed to login even if backend logout request fails
    } finally {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('neobus_active_site_id');
      }
      router.push('/login');
      router.refresh();
    }
  };

  const visibleModules = useMemo(
    () =>
      MODULES.filter((mod) => {
        if (!mod.permission) return true;
        return can(user, mod.permission);
      }),
    [user],
  );

  const visibleSettingsTabs = useMemo(
    () => SETTINGS_TABS.filter((tab) => !tab.permission || can(user, tab.permission)),
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

  // Auto-sync open accordion & dismiss overlays on navigation
  useEffect(() => {
    setExpandedModuleId(isSettingsPath ? 'settings' : activeModule?.id ?? null);
    setCollapsedFlyout(null);
    setCreateMenuOpen(false);
    setUserMenuOpen(false);
    setMobileDrawerOpen(false);
    setMobileSectionOpen(false);
  }, [pathname, isSettingsPath, activeModule?.id]);

  const activeModuleLabel = isSettingsPath
    ? 'Settings'
    : locale === 'mr'
    ? activeModule?.labelMr || 'Today'
    : activeModule?.label || 'Today';

  const activePageLabel = useMemo(() => {
    const matched = activeTabs.find((t) => isSubTabActive(pathname, t.href));
    if (matched) return matched.label;
    if (pathname === '/me') return 'My Profile';
    return activeModuleLabel;
  }, [activeTabs, pathname, activeModuleLabel]);

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

  const selectedSiteLabel = useMemo(() => {
    if (activeSite === 'all') return 'All Sites (Aggregated)';
    const siteObj = user?.sites?.find((s) => s.id === activeSite);
    return siteObj ? `${siteObj.name} (${siteObj.siteType})` : activeSite;
  }, [activeSite, user?.sites]);

  const tourSteps = [
    { targetElementId: 'site-switcher', title: 'Site Switcher', content: 'Switch between factory plants, hubs, or view All Sites together.' },
    { targetElementId: 'command-palette-btn', title: 'Search Everything (Ctrl+K)', content: 'Press Ctrl+K anytime to jump directly to a customer, order, item, or trip.' },
    { targetElementId: 'approvals-btn', title: 'Approvals Queue', content: 'Review below-floor prices, credit limit requests, and supplier price rises.' },
    { targetElementId: 'notifications-btn', title: 'Notifications', content: 'Stay informed on staged orders, cash handovers, and stock expiry.' },
  ];

  const isNight = theme === 'night' || theme === 'dark';

  const openFlyoutFor = (
    e: React.MouseEvent<HTMLButtonElement>,
    id: string,
    label: string,
    tabs: SubTabItem[],
  ) => {
    if (collapsedFlyout?.id === id) {
      setCollapsedFlyout(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const clampedTop = Math.max(12, Math.min(rect.top, window.innerHeight - 340));
    setCollapsedFlyout({ id, label, tabs, top: clampedTop });
  };

  const renderAccordionList = (onNavigate?: () => void) => (
    <div className="space-y-0.5">
      {visibleModules.map((mod) => {
        const Icon = NAV_ICONS[mod.iconKey];
        const modTabs = mod.tabs.filter((t) => !t.permission || can(user, t.permission));
        const isCurrentModule = !isSettingsPath && activeModule?.id === mod.id;
        const isExpanded = expandedModuleId === mod.id;
        const badgeCount = mod.id === 'approvals' ? pendingApprovalsCount : 0;
        const modLabel = locale === 'mr' ? mod.labelMr : mod.label;

        if (modTabs.length <= 1) {
          return (
            <Link
              key={mod.id}
              href={mod.href}
              onClick={onNavigate}
              className={`flex items-center gap-3 h-[38px] px-3.5 text-[14.5px] rounded-l-[3px] transition-colors relative z-10 ${
                isCurrentModule
                  ? 'bg-sheet text-ink font-semibold mr-0 shadow-[inset_1px_0_0_var(--rule),inset_0_1px_0_var(--rule),inset_0_-1px_0_var(--rule)]'
                  : 'text-ink-2 hover:text-ink hover:bg-sheet/50 mr-3'
              }`}
            >
              <Icon className={`w-[18px] h-[18px] shrink-0 ${isCurrentModule ? 'text-action' : 'text-ink-2'}`} strokeWidth={1.75} />
              <span className="truncate">{modLabel}</span>
              {badgeCount > 0 && (
                <span className="ml-auto text-[12px] font-semibold bg-madder text-white rounded-full px-1.5 leading-[18px]">
                  {badgeCount}
                </span>
              )}
            </Link>
          );
        }

        return (
          <div key={mod.id}>
            <button
              type="button"
              onClick={() => setExpandedModuleId((prev) => (prev === mod.id ? null : mod.id))}
              aria-expanded={isExpanded}
              className={`w-[calc(100%-12px)] flex items-center gap-3 h-[38px] px-3.5 text-[14.5px] rounded-l-[3px] transition-colors relative z-10 text-left ${
                isCurrentModule
                  ? 'text-ink font-semibold bg-sheet/75'
                  : 'text-ink-2 hover:text-ink hover:bg-sheet/50'
              }`}
            >
              <Icon className={`w-[18px] h-[18px] shrink-0 ${isCurrentModule ? 'text-action' : 'text-ink-2'}`} strokeWidth={1.75} />
              <span className="truncate flex-1">{modLabel}</span>
              {badgeCount > 0 && (
                <span className="text-[12px] font-semibold bg-madder text-white rounded-full px-1.5 leading-[18px]">
                  {badgeCount}
                </span>
              )}
              {isExpanded ? (
                <ACTION_ICONS.chevronDown className="w-3.5 h-3.5 text-ink-3 shrink-0" />
              ) : (
                <ACTION_ICONS.chevronRight className="w-3.5 h-3.5 text-ink-3 shrink-0" />
              )}
            </button>

            {isExpanded && (
              <div className="ml-6 pl-3 mr-3 my-1 border-l border-rule space-y-0.5">
                {modTabs.map((tab) => {
                  const active = isSubTabActive(pathname, tab.href);
                  return (
                    <Link
                      key={tab.href}
                      href={tab.href}
                      onClick={onNavigate}
                      className={`block px-2.5 py-1.5 text-[13.5px] rounded-[3px] transition-colors truncate ${
                        active
                          ? 'bg-sheet text-action font-semibold border border-rule'
                          : 'text-ink-2 hover:text-ink hover:bg-sheet/50'
                      }`}
                    >
                      {tab.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Settings Accordion inside scrollable nav */}
      {visibleSettingsTabs.length > 0 && (
        <div className="pt-2 mt-2 border-t border-rule mr-3">
          <button
            type="button"
            onClick={() => setExpandedModuleId((prev) => (prev === 'settings' ? null : 'settings'))}
            aria-expanded={expandedModuleId === 'settings'}
            className={`w-full flex items-center gap-3 h-[38px] px-3.5 text-[14.5px] rounded-[3px] transition-colors text-left ${
              isSettingsPath
                ? 'text-ink font-semibold bg-sheet/75'
                : 'text-ink-2 hover:text-ink hover:bg-sheet/50'
            }`}
          >
            <NAV_ICONS.settings className={`w-[18px] h-[18px] shrink-0 ${isSettingsPath ? 'text-action' : 'text-ink-2'}`} strokeWidth={1.75} />
            <span className="truncate flex-1">Settings</span>
            {expandedModuleId === 'settings' ? (
              <ACTION_ICONS.chevronDown className="w-3.5 h-3.5 text-ink-3 shrink-0" />
            ) : (
              <ACTION_ICONS.chevronRight className="w-3.5 h-3.5 text-ink-3 shrink-0" />
            )}
          </button>

          {expandedModuleId === 'settings' && (
            <div className="ml-6 pl-3 my-1 border-l border-rule space-y-0.5">
              {visibleSettingsTabs.map((tab) => {
                const active = isSubTabActive(pathname, tab.href);
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    onClick={onNavigate}
                    title={tab.description}
                    className={`block px-2.5 py-1.5 text-[13.5px] rounded-[3px] transition-colors truncate ${
                      active
                        ? 'bg-sheet text-action font-semibold border border-rule'
                        : 'text-ink-2 hover:text-ink hover:bg-sheet/50'
                    }`}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen bg-paper text-ink font-sans">
      {/* Click-outside backdrop for desktop sidebar popovers */}
      {(createMenuOpen || collapsedFlyout) && (
        <div
          className="fixed inset-0 z-[25]"
          aria-hidden="true"
          onClick={() => {
            setCreateMenuOpen(false);
            setCollapsedFlyout(null);
          }}
        />
      )}

      {/* 1. Desktop Bahi-Khata Sidebar */}
      <aside
        className={`hidden lg:flex ${
          sidebarCollapsed ? 'w-[72px]' : 'w-[236px]'
        } bg-paper relative flex-col justify-between shrink-0 transition-all duration-150 select-none z-40 no-print`}
      >
        {/* Signature Double Madder Margin Rule */}
        <div
          aria-hidden="true"
          className="absolute top-0 bottom-0 right-0 bahi-margin-rule pointer-events-none"
        />

        <div className={`${sidebarCollapsed ? 'px-2 pt-5' : 'pl-4 pt-5'} flex flex-col min-h-0 flex-1`}>
          {/* Brand Wordmark & Collapse */}
          <div className={`flex items-center justify-between pb-4 shrink-0 ${sidebarCollapsed ? 'px-1' : 'px-3.5 pr-6'}`}>
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
              onClick={() => {
                setSidebarCollapsed(!sidebarCollapsed);
                setCollapsedFlyout(null);
              }}
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
          <div className={`relative mb-3 shrink-0 ${sidebarCollapsed ? 'px-1' : 'pr-[22px]'}`}>
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
              <div className="absolute left-0 top-full mt-1.5 w-60 bg-sheet border border-rule-strong rounded-[4px] shadow-xl py-1.5 z-50">
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

          {/* Navigation Accordion (Expanded) OR Icon Rail (Collapsed) */}
          <nav className="flex-1 overflow-y-auto pb-3">
            {sidebarCollapsed ? (
              <div className="space-y-1">
                {visibleModules.map((mod) => {
                  const Icon = NAV_ICONS[mod.iconKey];
                  const modTabs = mod.tabs.filter((t) => !t.permission || can(user, t.permission));
                  const isCurrentModule = !isSettingsPath && activeModule?.id === mod.id;
                  const modLabel = locale === 'mr' ? mod.labelMr : mod.label;
                  const badgeCount = mod.id === 'approvals' ? pendingApprovalsCount : 0;

                  if (modTabs.length <= 1) {
                    return (
                      <Link
                        key={mod.id}
                        href={mod.href}
                        title={modLabel}
                        className={`relative flex items-center justify-center h-[38px] px-2 rounded-[3px] transition-colors ${
                          isCurrentModule
                            ? 'bg-sheet text-action font-semibold border border-rule'
                            : 'text-ink-2 hover:text-ink hover:bg-sheet/50'
                        }`}
                      >
                        <Icon className="w-[18px] h-[18px]" strokeWidth={1.75} />
                        {badgeCount > 0 && (
                          <span className="absolute top-1 right-1.5 w-2 h-2 rounded-full bg-madder" />
                        )}
                      </Link>
                    );
                  }

                  return (
                    <button
                      key={mod.id}
                      type="button"
                      title={modLabel}
                      onClick={(e) => openFlyoutFor(e, mod.id, modLabel, modTabs)}
                      className={`w-full relative flex items-center justify-center h-[38px] px-2 rounded-[3px] transition-colors ${
                        isCurrentModule || collapsedFlyout?.id === mod.id
                          ? 'bg-sheet text-action font-semibold border border-rule'
                          : 'text-ink-2 hover:text-ink hover:bg-sheet/50'
                      }`}
                    >
                      <Icon className="w-[18px] h-[18px]" strokeWidth={1.75} />
                    </button>
                  );
                })}

                {visibleSettingsTabs.length > 0 && (
                  <div className="pt-2 mt-2 border-t border-rule">
                    <button
                      type="button"
                      title="Settings"
                      onClick={(e) => openFlyoutFor(e, 'settings', 'Settings', visibleSettingsTabs)}
                      className={`w-full flex items-center justify-center h-[38px] px-2 rounded-[3px] transition-colors ${
                        isSettingsPath || collapsedFlyout?.id === 'settings'
                          ? 'bg-sheet text-action font-semibold border border-rule'
                          : 'text-ink-2 hover:text-ink hover:bg-sheet/50'
                      }`}
                    >
                      <NAV_ICONS.settings className="w-[18px] h-[18px]" strokeWidth={1.75} />
                    </button>
                  </div>
                )}
              </div>
            ) : (
              renderAccordionList()
            )}
          </nav>
        </div>

        {/* Unclipped Floating Flyout Submenu (when desktop sidebar is collapsed) */}
        {sidebarCollapsed && collapsedFlyout && (
          <div
            style={{ top: collapsedFlyout.top }}
            className="fixed left-[76px] z-50 w-56 max-h-[calc(100vh-24px)] overflow-y-auto bg-sheet border border-rule-strong rounded-[4px] shadow-xl py-1.5"
          >
            <div className="px-3.5 py-2 text-[13px] font-semibold text-ink border-b border-rule">
              {collapsedFlyout.label}
            </div>
            <div className="py-1">
              {collapsedFlyout.tabs.map((tab) => {
                const active = isSubTabActive(pathname, tab.href);
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    onClick={() => setCollapsedFlyout(null)}
                    className={`block px-3.5 py-2 text-[13.5px] transition-colors ${
                      active
                        ? 'bg-paper text-action font-semibold'
                        : 'text-ink-2 hover:text-ink hover:bg-paper'
                    }`}
                  >
                    <div>{tab.label}</div>
                    {tab.description && (
                      <div className="text-[11.5px] text-ink-3 font-normal leading-snug mt-0.5">
                        {tab.description}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Sidebar Footer: Help, User, Language & Theme */}
        <div className={`${sidebarCollapsed ? 'px-2 pb-4' : 'pl-4 pr-5 pb-4'} pt-2 border-t border-rule shrink-0`}>
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

          {!sidebarCollapsed && (
            <div className="px-3 pt-2 mt-1 border-t border-rule flex items-center gap-2.5">
              <Link href="/me" className="flex items-center gap-2.5 min-w-0 flex-1 group">
                <Avatar name={user?.name || 'User'} size="sm" />
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold text-ink truncate group-hover:text-action">
                    {user?.name || 'Loading...'}
                  </div>
                  <div className="text-[12px] text-ink-3 truncate">{getRoleLabel(user?.role)}</div>
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
        {/* Clean Single-Row Topbar (Zero scrollbars, zero tabs) */}
        <header className="h-[56px] border-b border-rule px-4 sm:px-8 flex items-center justify-between gap-3 shrink-0 sticky top-0 z-30 bg-sheet no-print">
          {/* Left: Desktop Breadcrumb OR Mobile Menu + 1-Tap Section Switcher */}
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Mobile Hamburger + Contextual Pill */}
            <div className="flex lg:hidden items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(true)}
                className="w-10 h-10 -ml-1 border border-rule-strong bg-sheet hover:bg-paper rounded-[3px] flex items-center justify-center text-ink shrink-0"
                aria-label="Open menu"
              >
                <ACTION_ICONS.menu className="w-5 h-5" />
              </button>

              {activeTabs.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setMobileSectionOpen(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[3px] bg-paper border border-rule-strong text-[13.5px] text-ink min-w-0 max-w-[210px] sm:max-w-[300px]"
                >
                  <span className="text-ink-3 shrink-0">{activeModuleLabel}</span>
                  <span className="text-ink-3 shrink-0">·</span>
                  <span className="font-semibold truncate">{activePageLabel}</span>
                  <ACTION_ICONS.chevronDown className="w-3.5 h-3.5 text-ink-3 shrink-0" />
                </button>
              ) : (
                <span className="text-[14px] font-semibold text-ink truncate">
                  {activePageLabel}
                </span>
              )}
            </div>

            {/* Desktop Breadcrumb */}
            <div className="hidden lg:flex items-center gap-2 text-[13.5px] min-w-0">
              {pathname === '/home' ? (
                <span className="text-ink-3 whitespace-nowrap">{todayDateStr}</span>
              ) : (
                <div className="flex items-center gap-2 truncate">
                  <span className="text-ink-3">{activeModuleLabel}</span>
                  <span className="text-rule-strong">/</span>
                  <span className="text-ink font-semibold truncate">{activePageLabel}</span>
                </div>
              )}
            </div>
          </div>

          {/* Right: Site Switcher, Search, Approvals, Notifications, User */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <div
              id="site-switcher"
              className="hidden md:flex items-center max-w-[190px]"
              title={selectedSiteLabel}
            >
              <select
                className="w-full truncate bg-transparent text-ink-2 hover:text-ink text-[13.5px] font-medium outline-none cursor-pointer pr-1 py-1"
                value={activeSite}
                onChange={(e) => handleSiteChange(e.target.value)}
                aria-label="Active site"
              >
                {user?.role === 'OWNER' && <option value="all">All Sites (Aggregated)</option>}
                {(user?.sites || []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({SITE_TYPE_LABELS[s.siteType || ''] || s.siteType})
                  </option>
                ))}
              </select>
            </div>

            <button
              id="command-palette-btn"
              type="button"
              onClick={() => setSearchOpen(true)}
              className="hidden sm:flex items-center gap-2.5 w-52 lg:w-64 h-[36px] bg-paper border border-rule-strong hover:border-action rounded-[3px] px-3 text-[13.5px] text-ink-3 transition-colors"
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

            <div ref={userMenuRef} className="relative z-40">
              <button
                type="button"
                onClick={() => setUserMenuOpen((prev) => !prev)}
                className="flex items-center rounded-full focus:outline-none focus:ring-2 focus:ring-action"
                aria-label="Account menu"
                aria-expanded={userMenuOpen}
              >
                <Avatar name={user?.name || 'U'} size="sm" />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-sheet border border-rule-strong rounded-[4px] shadow-xl py-1.5 z-50 text-[13.5px]">
                  <div className="px-3.5 py-2 border-b border-rule">
                    <div className="font-semibold text-ink truncate">{user?.name}</div>
                    <div className="text-[12.5px] text-ink-3">{getRoleLabel(user?.role)}</div>
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
          <div className="fixed top-16 right-6 z-50 px-4 py-2.5 rounded-[4px] bg-sheet border border-rule-strong text-ink text-[13.5px] shadow-xl flex items-center gap-2">
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
          {
            id: 'today',
            label: 'Today',
            href: '/home',
            Icon: NAV_ICONS.today,
            active: pathname === '/home' || pathname.startsWith('/control/dashboard') || pathname.startsWith('/control/analytics'),
          },
          {
            id: 'approvals',
            label: 'Approvals',
            href: '/control/approvals',
            Icon: NAV_ICONS.approvals,
            badge: pendingApprovalsCount,
            active: pathname.startsWith('/control/approvals'),
          },
          {
            id: 'sales',
            label: 'Sales',
            href: '/sales/orders',
            Icon: NAV_ICONS.sales,
            active: pathname.startsWith('/sales'),
          },
          {
            id: 'money',
            label: 'Money',
            href: '/finance',
            Icon: NAV_ICONS.money,
            active: pathname.startsWith('/finance'),
          },
        ].map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className={`relative flex flex-col items-center justify-center gap-0.5 text-[12px] px-3 py-1 ${
              item.active ? 'text-action font-semibold' : 'text-ink-3'
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
        ))}
        <button
          type="button"
          onClick={() => setMobileDrawerOpen(true)}
          className={`flex flex-col items-center justify-center gap-0.5 text-[12px] px-3 py-1 ${
            mobileDrawerOpen ? 'text-action font-semibold' : 'text-ink-3'
          }`}
        >
          <ACTION_ICONS.menu className="w-5 h-5" />
          <span>Menu</span>
        </button>
      </nav>

      {/* Mobile 1-Tap Contextual Sub-Page Sheet */}
      {mobileSectionOpen && activeTabs.length > 1 && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-black/40 flex items-end"
          onClick={() => setMobileSectionOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${activeModuleLabel} pages`}
            className="w-full bg-sheet border-t border-rule-strong rounded-t-[8px] p-4 max-h-[70vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2.5 mb-2 border-b border-ink">
              <span className="text-[15px] font-semibold text-ink">{activeModuleLabel}</span>
              <button
                type="button"
                onClick={() => setMobileSectionOpen(false)}
                className="p-1 text-ink-3 hover:text-ink"
                aria-label="Close section menu"
              >
                <ACTION_ICONS.close className="w-4 h-4" />
              </button>
            </div>
            <div className="divide-y divide-rule">
              {activeTabs.map((tab) => {
                const active = isSubTabActive(pathname, tab.href);
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    onClick={() => setMobileSectionOpen(false)}
                    className={`flex items-center justify-between py-3 px-1 text-[14.5px] ${
                      active ? 'text-action font-semibold' : 'text-ink'
                    }`}
                  >
                    <span>{tab.label}</span>
                    {active && <ACTION_ICONS.check className="w-4 h-4 text-action" />}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Slide-Over Accordion Drawer */}
      {mobileDrawerOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-black/45 flex"
          onClick={() => setMobileDrawerOpen(false)}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            className="w-[290px] max-w-[85vw] h-full bg-paper relative flex flex-col justify-between shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              aria-hidden="true"
              className="absolute top-0 bottom-0 right-0 bahi-margin-rule pointer-events-none"
            />

            <div className="pl-4 pt-4 flex flex-col min-h-0 flex-1">
              <div className="flex items-center justify-between px-3 pr-5 pb-3 border-b border-rule mr-3">
                <div>
                  <div className="font-serif text-[22px] font-semibold tracking-tight text-ink leading-none">
                    NeoBus
                  </div>
                  <div className="text-[12.5px] text-ink-3 mt-1 truncate">
                    {user?.sites?.[0]?.name || 'Baramati Agro Foods'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(false)}
                  className="p-1.5 rounded-[3px] text-ink-2 hover:text-ink hover:bg-sheet"
                  aria-label="Close menu"
                >
                  <ACTION_ICONS.close className="w-5 h-5" />
                </button>
              </div>

              {/* Site Switcher on Mobile */}
              <div className="pr-6 py-3">
                <label className="block text-[12px] text-ink-3 mb-1 px-1">Active site</label>
                <select
                  className="w-full bg-sheet border border-rule-strong rounded-[3px] px-2.5 py-2 text-[13.5px] text-ink outline-none"
                  value={activeSite}
                  onChange={(e) => handleSiteChange(e.target.value)}
                >
                  {user?.role === 'OWNER' && <option value="all">All Sites (Aggregated)</option>}
                  {(user?.sites || []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.siteType})
                    </option>
                  ))}
                </select>
              </div>

              {/* + New Expandable Section on Mobile */}
              <div className="pr-6 pb-3">
                <button
                  type="button"
                  onClick={() => setMobileCreateOpen((o) => !o)}
                  className="w-full h-[38px] bg-action hover:bg-action-hover text-white rounded-[3px] font-medium text-[14px] px-3.5 flex items-center gap-2"
                >
                  <ACTION_ICONS.plus className="w-4 h-4 shrink-0" />
                  <span>New</span>
                  <ACTION_ICONS.chevronDown
                    className={`w-4 h-4 ml-auto transition-transform ${mobileCreateOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {mobileCreateOpen && (
                  <div className="mt-1.5 bg-sheet border border-rule rounded-[3px] divide-y divide-rule">
                    {CREATE_MENU_ITEMS.map((item) => (
                      <Link
                        key={item.href + item.label}
                        href={item.href}
                        onClick={() => {
                          setMobileCreateOpen(false);
                          setMobileDrawerOpen(false);
                        }}
                        className="block px-3 py-2 text-[13.5px] text-ink hover:bg-paper"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Same Single-Open Accordion Modules */}
              <nav className="flex-1 overflow-y-auto pb-3">
                {renderAccordionList(() => setMobileDrawerOpen(false))}
              </nav>
            </div>

            {/* Mobile Drawer Footer */}
            <div className="pl-4 pr-5 pb-4 pt-2 border-t border-rule shrink-0 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setMobileDrawerOpen(false);
                  setHelpOpen(true);
                }}
                className="w-full flex items-center gap-3 h-[36px] px-3 text-[14px] text-ink-2 hover:text-ink rounded-[3px]"
              >
                <NAV_ICONS.help className="w-[17px] h-[17px]" strokeWidth={1.75} />
                <span>Help</span>
              </button>

              <div className="px-3 pt-2 border-t border-rule flex items-center gap-2.5">
                <Link
                  href="/me"
                  onClick={() => setMobileDrawerOpen(false)}
                  className="flex items-center gap-2.5 min-w-0 flex-1"
                >
                  <Avatar name={user?.name || 'User'} size="sm" />
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-semibold text-ink truncate">
                      {user?.name || 'Loading...'}
                    </div>
                    <div className="text-[12px] text-ink-3 truncate">{getRoleLabel(user?.role)}</div>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => setLocale(locale === 'en' ? 'mr' : 'en')}
                  className="text-[12px] px-1.5 py-0.5 rounded-[3px] border border-rule-strong text-ink-2"
                >
                  {locale === 'en' ? 'मराठी' : 'EN'}
                </button>
                <button
                  type="button"
                  onClick={() => setTheme(isNight ? 'paper' : 'night')}
                  className="p-1.5 rounded-[3px] border border-rule-strong text-ink-2"
                  aria-label="Toggle theme"
                >
                  {isNight ? <ACTION_ICONS.sun className="w-3.5 h-3.5" /> : <ACTION_ICONS.moon className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </aside>
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
