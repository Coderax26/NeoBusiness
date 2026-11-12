# Phase F2 — App Shell, Login & Role Home Pages

> **Duration:** 2 weeks · **Release:** R1 · **Depends on:** F0, F1

## 1. Goal

Give every user a welcoming, role-specific starting point that answers **"What do I need to do now?"** — plus the global frame (navigation, search, notifications, approvals, site switcher, help) used by all later phases.

---

## 2. Login & account screens

| Screen | Route | Features | API |
|--------|-------|----------|-----|
| Login | `/login` | Company logo, phone + password; "Use PIN" toggle for floor devices; show/hide password; friendly rate-limit message with countdown (5 tries/60 s); "Remember this device" (keeps phone number only) | ✅ `POST /auth/login` |
| Lock screen | overlay | After idle timeout; shows user avatar, password/PIN; keeps unsaved work | ✅ `POST /auth/refresh` |
| Forgot password / PIN | `/login/forgot` | OTP by SMS (OD-006) → set new PIN | 🔴 G-M0-5 |
| My profile | `/me` | Name, phone, photo, language, density, change password/PIN, active sessions/devices | 🟡 `GET /auth/me`; 🔴 G-M0-6 update profile/password |
| First-login welcome | modal | Role tour, set PIN, choose language | UI only |

---

## 3. App shell

```
┌──────────────┬───────────────────────────────────────────────────────────────────┐
│ [Logo] NeoBus│ 🔍 Search anything… (Ctrl+K)   Site: Pune Factory ▾   ✅ 3  🔔 5  ?  👤 │
│──────────────│───────────────────────────────────────────────────────────────────│
│ 🏠 Home      │  Breadcrumb: Sales › Orders › SO-2611-0042                         │
│ 💰 Sales   ▸ │  ┌ Page header: title · status · [Primary action] [More ▾] ┐      │
│ 🛒 Purchase▸ │  │                                                         │      │
│ 📦 Stock   ▸ │  │                 Page content                            │      │
│ 🏭 Factory ▸ │  │                                                         │      │
│ 🚚 Delivery▸ │  └─────────────────────────────────────────────────────────┘      │
│ 💵 Money   ▸ │                                                                   │
│ 📊 Reports ▸ │  Banner area: offline · waiting for approval · credit hold        │
│ 🛡 Control ▸ │                                                                   │
│ ⚙ Admin   ▸ │                                                                   │
│ ── ⭐ Pinned │                                                                   │
│ « Collapse   │                                                                   │
└──────────────┴───────────────────────────────────────────────────────────────────┘
```

| Element | Behaviour |
|---------|-----------|
| **Sidebar** | Grouped by business area with friendly names ("Money" for Finance, "Delivery" for Logistics); items appear only if user has permission; collapsible; pin favourite pages; module colour accent |
| **Search (Ctrl+K)** | One box for customers, orders, invoices, items, suppliers, POs, trips, by name/number/phone. Also actions: "New order", "Record payment". Recent searches | 🔴 G-SRCH-1 (interim: parallel calls to list endpoints with `search`) |
| **Site switcher** | Shows only allowed sites (`siteIds`); Owner gets "All sites"; changing site refreshes data and shows a toast | ✅ via `siteId` params |
| **Approvals badge ✅** | Count of pending exceptions the user can resolve; opens approvals drawer | ✅ `GET /exceptions?status=PENDING` |
| **Notifications 🔔** | Bell with unread count: approvals decided, orders ready, handover disputes, stock alerts; mark read; link to record | 🔴 G-NOTIF-1 (interim: derived from exceptions + stock alerts) |
| **Help ?** | Search help articles, start page tour, keyboard shortcuts sheet, contact support (WhatsApp/phone), what's new | UI + static content |
| **User menu 👤** | Profile, language, density, switch to Floor Mode, logout |
| **Breadcrumbs** | Always visible, clickable |
| **Global banners** | Offline, maintenance, "Prices not published for today" (to coordinator), EOD not closed yesterday |
| **Keyboard shortcuts** | `N` new (context), `/` focus search, `G` then `O` orders, `G` then `I` invoices, `?` shortcut help |
| **Responsive** | ≥1280 full; 1024 collapsed sidebar; <768 bottom nav + simplified pages (owner on phone browser) |

### Navigation map (friendly name → routes)

| Group | Items |
|-------|-------|
| 🏠 Home | Today board (role-specific) |
| 💰 Sales | Quick Order · Orders · Quotes · Customers · Today's Prices · Sales returns |
| 🛒 Purchase | Requisitions · Purchase Orders · Goods Received · Shortfalls · Supplier Bills · Suppliers |
| 📦 Stock | Stock Overview · Check Availability · Batches & Expiry · Transfers · Adjustments · Stock Movements · Stock Count |
| 🏭 Factory | Production Board · Work Orders · Recipes (BOM) · Material Requests · Wastage · Attendance |
| 🚚 Delivery | Plan Trips · Dispatch Board · Trips · Vehicles · Delivery Issues · Trip Expenses |
| 💵 Money | Invoices · Money to Collect (AR) · Payments Received · Cash Handover · Cheques · Credit Notes · COD Settlement · Promises to Pay · Day Closing (EOD) · Supplier Bills & Payments · Tally Export |
| 📊 Reports | Report Library · Analytics · Scheduled Reports |
| 🛡 Control | Control Tower · Approvals · Stock Alerts · Audit Trail · Notification Log |
| ⚙ Admin | Users · Roles & Access · Sites & Locations · Business Rules · Approval Rules · Templates · Number Series · Opening Balances · System Health |

---

## 4. Role home pages ("Today" boards)

All home pages share the pattern: **Greeting + date → "Needs you now" → KPI cards → Shortcuts → Activity feed**.

### 4.1 Owner home (`/home` → Control Tower lite)
| Section | Content | API |
|---------|---------|-----|
| Greeting | "Good morning, Mr. X — here's your business today" + site selector | — |
| Needs your decision | Top 5 Exception Cards (approve/counter/reject inline), "See all (12)" | ✅ `GET /exceptions` |
| Pulse KPIs | Today's sales (tax invoices issued today, OD-020), gross margin %, cash collected, pending exceptions — each with trend & sparkline | ✅ `GET /dashboard/pulse` |
| Operations status | Orders pending dispatch, batches running, trucks on road, supplier shortfalls — progress tiles | ✅ `GET /dashboard/status-matrix` |
| Money snapshot | AR aging donut, top 5 overdue customers | ✅ `GET /finance/ar/aging` |
| Stock alerts | Low / expiring / negative counts | ✅ `GET /stock-alerts/counts` |
| Yesterday's EOD | Signed off? variance? link | ✅ `GET /dashboard/eod` |
| Quick actions | Publish today's prices · Approvals · Reports |

### 4.2 Ops Coordinator home
| Section | Content | API |
|---------|---------|-----|
| My to-do (checklist style) | ☐ Publish/verify today's prices (if missing) · ☐ 6 draft orders to confirm · ☐ 4 orders ready → build trips · ☐ 3 handovers to verify · ☐ 2 cheques to deposit · ☐ 5 PTPs due today · ☐ 1 shortfall open · ☐ Close yesterday's EOD | ✅ multiple: `prices/missing/:date`, `orders?status=`, `handovers`, `cheques`, `ptp/due`, `procurement/shortfalls/all/open`, `eod/:date` |
| Today's numbers | Orders taken, value, deliveries done/total, cash collected | ✅ pulse/status |
| Waiting for Owner | My requests pending approval with age | ✅ `exceptions?requestedBy=me` |
| Shortcuts | New order (N), Record payment, Plan trip, Receive cash |
| Activity feed | Recent events at my site | 🔴 G-NOTIF-1 (interim: order status log) |

### 4.3 Production Manager home (Floor Mode)
Big tiles: **Today's batches** (count by state), **Start next batch**, **Record output**, **Request materials**, **Attendance**, **Wastage**. No money anywhere.

### 4.4 Storekeeper home (Floor Mode)
Big tiles: **Receive goods (GRN)** with expected deliveries count, **Load vehicle** (trips loading today), **Transfers to send/receive**, **Check stock**, **Report damage/adjustment**.

### 4.5 Driver / Collector (web fallback)
Read-only "My trip / My collections" page for when the mobile app is unavailable; primary experience remains the Flutter app.

---

## 5. Approvals drawer (global)

Opened from the ✅ badge anywhere. Shows Exception Cards sorted by priority/value with inline actions (detail in F10). Lets the Owner act without leaving the current screen.

---

## 6. UX notes for non-tech users

- Home page checklists use **ticks and counts**; clicking an item opens the exact filtered list.
- Every KPI card has a one-line explanation on hover ("Sales = total of tax invoices issued today").
- Empty states celebrate: "All caught up! No approvals waiting 🎉".
- "Last updated 15 s ago · Refresh" on every live widget.

## 7. API mapping & gaps

| Need | Status |
|------|--------|
| Permissions & site names in `/auth/me` | 🔴 G-M0-1 |
| Global search | 🔴 G-SRCH-1 |
| Notifications feed + read state | 🔴 G-NOTIF-1 |
| Profile update / change password / forgot PIN | 🔴 G-M0-5, G-M0-6 |
| `exceptions` filter by `requestedBy`, `status`, `type` | 🟡 verify & extend |
| Realtime push for badges | 🔴 G-RT-1 (poll 30 s meanwhile) |

## 8. Acceptance criteria

1. Each of the 4 office/floor roles lands on its own home page after login.
2. Sidebar shows only permitted items; counts on approvals badge match `GET /exceptions` pending.
3. Ctrl+K finds an order by number and a customer by phone in < 1 s (with search API).
4. Owner can approve a price override directly from the home page card.
5. Coordinator checklist items deep-link to correctly filtered lists.
6. Layout works at 1366×768, 1024 and phone width.

## 9. Task checklist

- [ ] F2-01 Login, PIN mode, rate-limit UX, lock screen
- [ ] F2-02 App shell: sidebar, topbar, breadcrumbs, banners, responsive behaviour
- [ ] F2-03 Site switcher + site context in queries
- [ ] F2-04 Command palette & global search (interim + final)
- [ ] F2-05 Approvals badge + drawer
- [ ] F2-06 Notifications bell (interim derived feed)
- [ ] F2-07 Owner home
- [ ] F2-08 Coordinator home with to-do checklist
- [ ] F2-09 Floor Mode homes (PROD_MGR, STOREKEEPER)
- [ ] F2-10 Profile & preferences page
- [ ] F2-11 Help menu, shortcut sheet, first-login tour

