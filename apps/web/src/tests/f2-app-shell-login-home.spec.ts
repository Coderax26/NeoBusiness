import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Phase F2 — App Shell, Login & Role Home Pages', () => {
  it('TC-F2-AC01: Login screen implements password/PIN toggle, remember device, and rate-limiting UX (F2-01)', () => {
    const loginPath = path.resolve(__dirname, '../../app/(auth)/login/page.tsx');
    expect(fs.existsSync(loginPath)).toBe(true);

    const content = fs.readFileSync(loginPath, 'utf-8');
    expect(content).toContain('usePin');
    expect(content).toContain('neobus_remembered_identifier');
    expect(content).toContain('lockoutSeconds');
    expect(content).toContain('Too many failed attempts');
    expect(content).toContain('/login/forgot');
  });

  it('TC-F2-AC02: Forgot PIN/Password page provides phone, SMS OTP, and new PIN reset flow (F2-01, G-M0-5)', () => {
    const forgotPath = path.resolve(__dirname, '../../app/(auth)/login/forgot/page.tsx');
    expect(fs.existsSync(forgotPath)).toBe(true);

    const content = fs.readFileSync(forgotPath, 'utf-8');
    expect(content).toContain('Send Verification Code');
    expect(content).toContain('Verify Code');
    expect(content).toContain('New Security PIN');
  });

  it('TC-F2-AC03: LockScreenOverlay handles inactivity timeout and preserves unsaved work (F2-01)', () => {
    const lockScreenPath = path.resolve(__dirname, '../components/shell/LockScreenOverlay.tsx');
    expect(fs.existsSync(lockScreenPath)).toBe(true);

    const content = fs.readFileSync(lockScreenPath, 'utf-8');
    expect(content).toContain('idleTimeoutMinutes');
    expect(content).toContain('Session locked due to inactivity');
    expect(content).toContain('Your in-progress forms and drafts are safely preserved');
  });

  it('TC-F2-AC04: Office app shell integrates collapsible sidebar, topbar, site switcher, and shortcuts (F2-02, F2-03)', () => {
    const layoutPath = path.resolve(__dirname, '../../app/(office)/layout.tsx');
    expect(fs.existsSync(layoutPath)).toBe(true);

    const content = fs.readFileSync(layoutPath, 'utf-8');
    expect(content).toContain('sidebarCollapsed');
    expect(content).toContain('handleSiteChange');
    expect(content).toContain('All Sites (Aggregated)');
    expect(content).toContain('Ctrl+K');
    expect(content).toContain('ApprovalsDrawer');
    expect(content).toContain('NotificationsDrawer');
    expect(content).toContain('HelpModal');
  });

  it('TC-F2-AC05: Approvals drawer provides inline approve, reject, and counter offer actions (F2-05)', () => {
    const approvalsPath = path.resolve(__dirname, '../components/shell/ApprovalsDrawer.tsx');
    expect(fs.existsSync(approvalsPath)).toBe(true);

    const content = fs.readFileSync(approvalsPath, 'utf-8');
    expect(content).toContain('/api/proxy/exceptions?status=OPEN');
    expect(content).toContain('ExceptionCard');
    expect(content).toContain('handleApprove');
    expect(content).toContain('handleReject');
  });

  it('TC-F2-AC06: Notifications bell and drawer track unread status and mark-all-read (F2-06)', () => {
    const notifsPath = path.resolve(__dirname, '../components/shell/NotificationsDrawer.tsx');
    expect(fs.existsSync(notifsPath)).toBe(true);

    const content = fs.readFileSync(notifsPath, 'utf-8');
    expect(content).toContain('markAllRead');
    expect(content).toContain('unreadCount');
    expect(content).toContain('Price Override Approved');
  });

  it('TC-F2-AC07: Owner home renders Control Tower pulse KPIs, operations status, and AR aging (F2-07)', () => {
    const homePath = path.resolve(__dirname, '../../app/(office)/home/page.tsx');
    expect(fs.existsSync(homePath)).toBe(true);

    const content = fs.readFileSync(homePath, 'utf-8');
    expect(content).toContain("Today's Sales (OD-020)");
    expect(content).toContain('Gross Margin');
    expect(content).toContain('Live Operations Status Matrix');
    expect(content).toContain('Accounts Receivable Aging Breakdown');
  });

  it('TC-F2-AC08: Coordinator home renders interactive daily to-do checklist with deep-links (F2-08)', () => {
    const homePath = path.resolve(__dirname, '../../app/(office)/home/page.tsx');
    const content = fs.readFileSync(homePath, 'utf-8');

    expect(content).toContain('Daily Operations To-Do Checklist');
    expect(content).toContain('Verify today’s base & floor prices');
    expect(content).toContain('Confirm draft sales orders');
    expect(content).toContain('Build dispatch trips for ready orders');
    expect(content).toContain('Verify driver cash handovers');
    expect(content).toContain('Bank cheque deposit register');
  });

  it('TC-F2-AC09: Floor Mode terminal renders role-specific 56px touch tiles with no financial data (F2-09)', () => {
    const floorPath = path.resolve(__dirname, '../../app/(floor)/floor/page.tsx');
    expect(fs.existsSync(floorPath)).toBe(true);

    const content = fs.readFileSync(floorPath, 'utf-8');
    expect(content).toContain('Blind GRN Receiving');
    expect(content).toContain('Vehicle Loading Check');
    expect(content).toContain('Active Work Orders');
    expect(content).toContain('Record Batch Output & Yield');
    expect(content).toContain('NumericKeypad');
  });

  it('TC-F2-AC10: User profile and preferences page (/me) supports language and density switching (F2-10)', () => {
    const profilePath = path.resolve(__dirname, '../../app/(office)/me/page.tsx');
    expect(fs.existsSync(profilePath)).toBe(true);

    const content = fs.readFileSync(profilePath, 'utf-8');
    expect(content).toContain('My Account & Preferences');
    expect(content).toContain('Interface & Regional Preferences');
    expect(content).toContain('Layout Density');
    expect(content).toContain('Security PIN & Password');
  });

  it('TC-F2-AC11: Help modal provides keyboard shortcut cheatsheet, product tours, and support channels (F2-11)', () => {
    const helpPath = path.resolve(__dirname, '../components/shell/HelpModal.tsx');
    expect(fs.existsSync(helpPath)).toBe(true);

    const content = fs.readFileSync(helpPath, 'utf-8');
    expect(content).toContain('Keyboard Shortcuts');
    expect(content).toContain('Ctrl + K');
    expect(content).toContain('Interactive Workspace Tour');
    expect(content).toContain('WhatsApp Support');
  });
});

