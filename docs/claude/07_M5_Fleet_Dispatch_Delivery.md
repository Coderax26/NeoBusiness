# M5 — Fleet, Dispatch & Delivery

**Build order:** 6th (Sprint 2) · **Depends on:** M0, M1 (orders), M3 (loading/stock), M6 (invoice, COD), M7a · **Stubs until built:** Sprint 1 uses a coordinator "Mark Dispatched" button instead of trips (G10a)
**Blueprint refs:** §5.1 M5, BR-02 (dispatch block), BR-08, Scenario D, §6.6, §7.2(6), §7.3(4), Open Q4

---

## 1. Purpose & scope

Drivers stop phoning Mr. X for routes and problems. A digital manifest tells them what to deliver, and a mandatory ePOD proves it.

In scope: vehicle & driver assignment · trip/load builder · digital delivery challans · driver mobile app (offline) · ePOD (signature / photo / OTP) · partial delivery & returns · issue reporting · trip expenses (fuel/toll) · COD collection hand-off to M6 · trip closure rules.

Out of scope: invoice creation (M6 does it on `trip.dispatched`), stock postings (M3), live GPS telemetry and route optimisation AI (Phase 2).

---

## 2. Roles & permissions

| Role | Can | Cannot |
| --- | --- | --- |
| OPS_COORD | Build trips; assign driver & vehicle; resolve routine issues; re-route; handle returns into credit-note queue | Override credit hold |
| DRIVER | See own manifest only; navigate; log delivered/returned qty; capture ePOD; report issues; log expenses; collect COD | See unassigned customers; edit invoice prices; complete a stop without ePOD or exception reason |
| STOREKEEPER | Load vehicle against manifest | — |
| OWNER | Handle escalated disputes (e.g. full-load rejection) | — |

---

## 3. Data model

| Table | Columns | Src |
| --- | --- | --- |
| **`delivery_trips`** | `id` PK · `trip_no` · `origin_site_id` FK · `driver_id` FK · `vehicle_no` · `trip_status` (`LOADING` \| `IN_TRANSIT` \| `COMPLETED`) · `departure_time` · `completion_time` | BP |
| ↳ added | `vehicle_id` FK · `trip_date` · `planned_distance_km` · `route_polyline` · `closed_by` · `CANCELLED` status | ADD |
| **`delivery_stops`** | `id` PK · `trip_id` FK · `sales_order_id` FK · `customer_id` FK · `stop_sequence` · `stop_status` (`PENDING` \| `DELIVERED_FULL` \| `DELIVERED_PARTIAL` \| `FAILED`) · `epod_signature_url` · `epod_photo_url` · `exception_notes` · `completed_at` | BP |
| ↳ added | `invoice_id` · `epod_method` (`SIGNATURE` \| `PHOTO` \| `OTP`) · `epod_otp_verified` · `gps_lat_lng` · `captured_at` · `reason_code` (for FAILED/PARTIAL) · `is_cod` · `cod_amount` | ADD |
| **`delivery_stop_lines`** | `stop_id` · `sales_order_line_id` · `item_id` · `loaded_qty` · `delivered_qty` · `returned_qty` · `return_reason` · `batch_id` | ADD (G4) |
| **`vehicles`** | `id` · `vehicle_no` · `type` · `capacity_kg` · `capacity_crates` · `is_active` · `location_id` (the `VEHICLE` location in M0) | ADD |
| **`delivery_challans`** | `id` · `challan_no` · `trip_id` · `stop_id` · `eway_bill_no` · `pdf_attachment_id` · `generated_at` | ADD (A5) |
| **`issue_reports`** | `id` · `trip_id` · `stop_id` nullable · `reported_by` · `category` (`BREAKDOWN` \| `ROAD_CLOSURE` \| `CUSTOMER_PARTIAL_REJECTION` \| `CUSTOMER_FULL_REJECTION` \| `OTHER`) · `rejected_qty` · `photo_attachment_id` · `voice_note_attachment_id` · `status` (`OPEN` \| `RESOLVED` \| `ESCALATED`) · `resolved_by` · `resolution_note` | ADD (Scenario D) |
| **`trip_expenses`** | `id` · `trip_id` · `type` (`FUEL` \| `TOLL` \| `OTHER`) · `amount` · `receipt_attachment_id` · `logged_at` | ADD (§6.6) |

---

## 4. Business rules

### BR-08 — Mandatory ePOD Closure
A trip may be closed by the driver only when **every** stop on the manifest has a final state:
- `DELIVERED_FULL`, or
- `DELIVERED_PARTIAL` **with returned quantities logged**, or
- `FAILED` / undelivered **with a reason code**.

```
canCloseTrip(trip):
    for stop in trip.stops:
        if stop.status == PENDING:                          return false
        if stop.status == DELIVERED_PARTIAL and Σreturned == 0: return false
        if stop.status == FAILED and stop.reason_code is null:  return false
        if stop.is_cod and cod_cash_not_logged(stop):           return false   # §9.3 COD blocks closure
        if stop requires ePOD and no signature/photo/OTP:        return false
    return true
```

### BR-02 (dispatch side) — Credit hold enforcement
At *trip loading / dispatch*, call `CreditPort.canDispatch(order)`. If `credit_flag = HOLD` the order cannot be loaded unless converted to `COD_ONLY` or released by the owner.

### Trip & load consolidation
- Candidate orders = status `READY` (or `CONFIRMED` with stock reserved), same origin site.
- Group by route/area and vehicle capacity (sum of loaded kg / crates ≤ capacity).
- With 3–4 drivers: manual drag-and-drop with Maps-based sequencing. Optimisation AI is Phase 2.

### ePOD
Acceptable proof (Open Q4): **customer signature**, **photo of stamped challan**, or **OTP** sent to the customer's phone. Each capture stores GPS and device timestamp (§7.3(4)). Partial delivery requires per-line delivered vs returned quantities.

### Variance on return
Returned quantities create a **credit-note request** in M6 and `RETURN` stock rows in M3 (or quarantine if damaged).

### Issue routing (Scenario D)
`issue_reports` go first to the **Ops Coordinator**. They escalate to the owner only when `value_at_risk ≥ owner_escalation_value_inr` or category is `CUSTOMER_FULL_REJECTION`.

---

## 5. Workflows & state machines

```
Trip:    (build) ─► LOADING ──(all lines loaded, credit OK)──► IN_TRANSIT ──(BR-08 satisfied)──► COMPLETED
                        └──────────────────────── cancel ──────────────────► CANCELLED

Stop:    PENDING ─► DELIVERED_FULL
                 ├► DELIVERED_PARTIAL (returned qty logged)
                 └► FAILED (reason code)
```

**Day flow**
1. **Coordinator** selects READY orders → builds trip → assigns driver + vehicle → sequences stops.
2. **Storekeeper** loads against the manifest (scan/tick lines, batches) → *Dispatch*.
3. **System** on `trip.dispatched`: invoices generated (M6), challans/e-way bill produced, order → `DISPATCHED`, WhatsApp dispatch alert with driver contact to each customer.
4. **Driver** works the stop list offline → at each stop records delivered qty, captures ePOD, collects COD if any.
5. **Driver** closes trip (BR-08) → M6 settles COD into the driver's wallet.

---

## 6. Screens

| # | Screen | User | Notes |
| --- | --- | --- | --- |
| S1 | **Trip builder** | Coordinator (web) | Ready-orders pool, capacity meter, map sequence, assign driver/vehicle |
| S2 | **Dispatch board** | Coordinator / Owner | Trucks on the road with "Stop X of Y", open issues |
| S3 | **Vehicle loading checklist** | Storekeeper | Per line: item, qty, batch; scan or tick |
| S4 | **Driver app — My Trip** | Driver (mobile, offline) | Stop list, call-customer button, navigate button, item counts to unload, crates to return |
| S5 | **ePOD capture** | Driver | Large buttons: *Delivered full / Partial / Not delivered*; signature pad / camera / OTP entry |
| S6 | **Report Issue** | Driver | Category buttons, photo, voice note, quantity keypad |
| S7 | **Expenses** | Driver | Fuel/toll amount keypad + receipt photo |
| S8 | **Issue desk** | Coordinator | Resolve, re-route, create credit-note request, escalate |

Driver UI rules (§9.3): zero typing where possible, numeric keypad only, large colour-coded buttons, local-language labels, voice notes for exceptions.

---

## 7. API (proposed)

| Method | Path | Role | Notes |
| --- | --- | --- | --- |
| GET/POST | `/vehicles` | OPS | |
| POST | `/trips` · `/trips/{id}/stops` | OPS | Capacity check |
| POST | `/trips/{id}/load` | STORE | Posts to M3 |
| POST | `/trips/{id}/dispatch` | STORE/OPS | Runs credit check; emits `trip.dispatched` |
| GET | `/me/trip` | DRIVER | Manifest + ledger snippet for offline cache; **no prices** |
| POST | `/stops/{id}/deliver` | DRIVER | Idempotent; includes lines, ePOD, GPS |
| POST | `/stops/{id}/fail` | DRIVER | Reason code required |
| POST | `/trips/{id}/issues` | DRIVER | |
| POST | `/trips/{id}/expenses` | DRIVER | |
| POST | `/trips/{id}/close` | DRIVER | BR-08 |
| PATCH | `/issues/{id}/resolve` · `/escalate` | OPS | |

---

## 8. Events & ports

| Direction | Name | Detail |
| --- | --- | --- |
| Consumes | `workorder.completed`, `stock.reserved` | Orders appear as READY |
| Calls | `CreditPort.canDispatch`, `InventoryPort.postDispatch/postReturn`, `LedgerPort.postInvoice/postCreditNote`, `NotifyPort`, `ExceptionPort` | |
| Publishes | `trip.loaded` | → M3 |
| Publishes | `trip.dispatched` | → M6 invoice, M1 status, WhatsApp |
| Publishes | `delivery.completed` / `delivery.partial` / `delivery.failed` | → M1, M3, M6 |
| Publishes | `issue.reported` / `issue.escalated` | → M7 |
| Publishes | `trip.closed` | → M6 (COD settlement), M7 (KPI 6) |

---

## 9. Integrations, jobs & instrumentation

| Item | Detail |
| --- | --- |
| Google Maps Routes API | Stop sequencing and distance; cache results; fall back to manual order if offline |
| OTP delivery | SMS/WhatsApp message to customer at the stop (needs connectivity; otherwise use signature/photo) |
| Offline | Manifest, customer snippets and challan data cached locally; commands queued (M0 §7) |
| Job: late-trip alert | Notify coordinator if a trip is not closed by `trip_close_deadline` (20:00) |
| KPI 6 | Store `completion_time` and whether all ePODs were valid |
| Phase 2 | Live GPS telemetry; route-optimisation AI; cold-chain sensors; crate/empty-container deposit ledger; UPI dynamic QR |

---

## 10. Acceptance criteria

1. A trip with one `PENDING` stop cannot be closed (BR-08), via UI or direct API.
2. A partial delivery without returned quantity is rejected.
3. A `FAILED` stop without a reason code is rejected.
4. An order on credit `HOLD` cannot be loaded or dispatched; after owner converts it to `COD_ONLY` it can.
5. A COD stop with no cash logged blocks trip closure.
6. **Scenario D:** driver reports *Customer Partial Rejection* with rejected qty and photo → issue appears on the **coordinator** desk; the owner receives nothing unless value ≥ threshold or it is a full rejection.
7. Delivering the same stop twice (retry after reconnect) creates one delivery record and one stock/credit-note posting.
8. Every ePOD stores GPS coordinates and device timestamp.
9. Driver API responses contain no unit prices or other customers' data.
10. Dispatch triggers invoice creation in M6 and a WhatsApp alert with the driver's phone number.

---

## 11. MVP vs Phase 2+

| MVP | Phase 2+ |
| --- | --- |
| Trip manifest builder & driver assignment (3–4 drivers); driver app with offline sync; mandatory ePOD (signature/photo) & partial-delivery logging | Live GPS telemetry & route optimisation AI; cold-chain temperature sensors; automated crate/empty-container deposit ledger |

---

## 12. Open questions

- `[DECISION]` Is OTP-based ePOD required in MVP or only signature/photo?
- `[DECISION]` `owner_escalation_value_inr` — what value makes a dispute an owner matter?
- `[DECISION]` Can one trip serve several sites or only one origin site?
- `[DECISION]` Who generates the e-way bill: NeoCore or the accountant's tool (Tally bridge)?
- Do drivers ever *sell* from the truck (van sales), or only deliver confirmed orders?

---

## 13. Build checklist

- [ ] Migrations: `vehicles`, `delivery_trips`, `delivery_stops`, `delivery_stop_lines`, `delivery_challans`, `issue_reports`, `trip_expenses`
- [ ] Trip builder service (capacity check, sequencing)
- [ ] Loading + dispatch (credit check, `trip.dispatched`)
- [ ] Challan PDF generation (+ e-way bill reference field)
- [ ] ePOD capture API with idempotency + GPS
- [ ] BR-08 guard and trip close
- [ ] Issue reporting + routing rules
- [ ] Driver mobile app (offline manifest, queue, photo upload, local language)
- [ ] Coordinator web screens S1, S2, S8 · storekeeper screen S3
- [ ] Replace M6 "Mark Dispatched" invoice trigger with `trip.dispatched`
- [ ] Offline stress test (airplane mode, duplicate replay) · acceptance tests §10 (+ Scenario D)
