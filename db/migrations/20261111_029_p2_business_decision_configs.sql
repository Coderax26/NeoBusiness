-- ============================================================
-- Migration: 20261111_029_p2_business_decision_configs
-- Module:    M0 Platform / Governance
-- Purpose:   Seed confirmed business rule configuration defaults for Phase P2 (OD-001 through OD-025)
-- ============================================================

INSERT INTO business_rule_config (key, value_json, scope, description) VALUES
  -- OD-002: Owner escalation value threshold for delivery disputes (INR 5,000)
  ('owner_escalation_value_inr', '5000', 'GLOBAL', 'Disputes with value at risk >= 5000 INR escalate to owner (OD-002)'),
  
  -- OD-004: e-Invoicing applicability (false for MVP, schema irn placeholder retained)
  ('einvoicing_enabled', 'false', 'GLOBAL', 'e-Invoicing IRN generation toggle via GST portal (OD-004)'),
  
  -- OD-005: e-Way bill consignment threshold (INR 50,000)
  ('eway_bill_threshold_inr', '50000', 'GLOBAL', 'Consignment invoice value requiring e-Way bill reference (OD-005)'),
  
  -- OD-006: OTP delivery channel for field staff authentication
  ('otp_channel_default', '"SMS"', 'GLOBAL', 'Primary authentication OTP delivery channel for field staff (OD-006)'),
  
  -- OD-007: Multi-site coordinator access
  ('multisite_coordinator_enabled', 'true', 'GLOBAL', 'Allows coordinators access to multiple sites via user_site_access (OD-007)'),
  
  -- OD-008: Default language for field and factory UI
  ('default_language', '"en"', 'GLOBAL', 'Default UI language for driver and factory apps (OD-008)'),
  
  -- OD-009: Supplier price-spike baseline logic
  ('supplier_price_spike_baseline', '"SAME_SUPPLIER_FIRST"', 'GLOBAL', 'Price spike baseline: same-supplier last price then item-wide last cost (OD-009)'),
  
  -- OD-010: Backup supplier tolerance for shortfall coverage
  ('backup_supplier_tolerance_pct', '2', 'GLOBAL', 'Tolerance % above primary for auto-suggesting backup suppliers (OD-010)'),
  
  -- OD-011: Freight and handling allocation into landed cost
  ('landed_cost_freight_allocation', '"NONE_MVP"', 'GLOBAL', 'Landed cost calculation method: PO price in MVP (OD-011)'),
  
  -- OD-012: Yield variance calculation basis
  ('yield_variance_basis', '"ISSUED_RAW_MATERIAL"', 'GLOBAL', 'Yield variance calculated against actual issued RM weight (OD-012)'),
  
  -- OD-013: Production mode
  ('production_mode', '"MAKE_TO_ORDER_PRIMARY"', 'GLOBAL', 'Production mode: MTO primary with MTS for min_stock replenishment (OD-013)'),
  
  -- OD-014: ePOD OTP requirement
  ('epod_otp_required', 'false', 'GLOBAL', 'Require customer OTP for ePOD completion (false = signature/photo only in MVP) (OD-014)'),
  
  -- OD-015: Custody wallet scope
  ('custody_wallet_scope', '"CASH_AND_CHEQUE"', 'GLOBAL', 'Field custody wallet tracks cash and cheques only; UPI bypasses handover (OD-015)'),
  
  -- OD-016: Handover verification cashier role
  ('handover_cashier_role', '"OPS_COORD"', 'GLOBAL', 'Role authorized to verify routine field handovers (OD-016)'),
  
  -- OD-017: Invoice receipt allocation policy
  ('invoice_allocation_policy', '"FIFO"', 'GLOBAL', 'Default invoice allocation policy for customer collections (OD-017)'),
  
  -- OD-018: Statutory accounting target
  ('accounting_bridge_target', '"TALLY_PRIME"', 'GLOBAL', 'Primary accounting export target format (OD-018)'),
  
  -- OD-020: Definition of today's sales
  ('todays_sales_definition', '"TAX_INVOICES_ISSUED"', 'GLOBAL', 'Owner pulse definition of today sales: tax invoices issued today (OD-020)'),
  
  -- OD-021: Expected dashboard refresh interval (seconds)
  ('dashboard_refresh_interval_seconds', '30', 'GLOBAL', 'Expected dashboard poll/refresh interval in seconds (OD-021)'),
  
  -- OD-022: WhatsApp BSP provider adapter
  ('whatsapp_bsp_adapter', '"PLUGGABLE_SMS_FALLBACK"', 'GLOBAL', 'Notification adapter configuration with SMS fallback (OD-022)'),
  
  -- OD-024: Standing negotiated customer prices
  ('standing_customer_prices_enabled', 'false', 'GLOBAL', 'Enable standing price tiers below floor price (OD-024)'),
  
  -- OD-025: Inter-site order fulfillment
  ('intersite_order_fulfillment', '"SINGLE_SITE_MVP"', 'GLOBAL', 'Allow single sales order to fulfill across multiple sites in MVP (OD-025)'),
  
  -- Supplier Bill Auto-Approve Cap (INR 25,000 for MATCHED bills)
  ('supplier_bill_auto_approve_cap_inr', '25000', 'GLOBAL', '3-way matched supplier bills below this amount auto-approve for payment')
ON CONFLICT (key) DO UPDATE SET
  value_json = EXCLUDED.value_json,
  description = EXCLUDED.description,
  updated_at = NOW();
