# Phase P4 — Production Readiness

## Objective

Prove that the completed system is secure, recoverable, observable, performant, deployable, and operationally usable before go-live.

## Workstream P4.1 — Security review

### Scope

- Authentication, refresh-token rotation, logout, OTP, and rate limiting.
- RBAC decorator/guard bypasses.
- RLS isolation using the non-superuser application role.
- Site-switching and cross-site data access.
- Price-floor and credit-limit bypasses.
- Cash custody and EOD sign-off bypasses.
- Idempotency-key replay and payload mismatch.
- File upload, attachment authorization, path traversal, and content validation.
- Outbox/event payload trust boundaries.
- Notification/webhook credentials and secret handling.
- Sensitive-field masking in every client/API response.

### Evidence

- Security test suite.
- Threat model and data-flow diagram.
- Findings table with severity, exploitability, owner, and remediation.
- Retest evidence for every fixed finding.

## Workstream P4.2 — Concurrency and load

### Tests

- Last-stock concurrent reservations.
- Concurrent ledger collection writes.
- Duplicate COD settlement.
- Concurrent EOD sign-off.
- Outbox relay duplicate delivery.
- Materialized-view refresh during reads.
- API load for common order, ATP, dashboard, and collection queries.

### Targets

- Establish and measure p95 API response target of 300 ms for common queries.
- Define throughput and queue-lag targets.
- Record PostgreSQL lock waits, deadlocks, and retry rates.

## Workstream P4.3 — Backup and restore

### Tasks

- Document PostgreSQL backup schedule and retention.
- Configure and test point-in-time recovery.
- Restore to an isolated environment.
- Run migration and application compatibility checks after restore.
- Verify ledger append-only integrity and event continuity.
- Document RPO/RTO and owner responsibilities.

## Workstream P4.4 — Observability

### Required capabilities

- Structured JSON logs.
- Correlation/request IDs.
- Error tracking such as Sentry or approved alternative.
- API latency/error metrics.
- Queue depth, retry, and dead-letter metrics.
- Failed notification/provider metrics.
- Database pool and lock metrics.
- Materialized-view freshness metrics.
- Uptime and health checks.
- Alert routing and runbooks.

## Workstream P4.5 — Deployment hardening

- Non-root production image.
- Minimal runtime dependencies.
- Health checks and graceful shutdown.
- CPU/memory/resource limits.
- TLS, DNS, SSL renewal, and secret management.
- Migration ordering and rollback procedure.
- Environment configuration validation.
- Redis/PostgreSQL backup and failover plan.
- Deployment, rollback, and incident runbooks.

## Workstream P4.6 — Operational pilot

### Tasks

- Run the system in parallel with the manual EOD process for seven days.
- Reconcile invoices, collections, custody, stock, trips, exceptions, and dashboard totals daily.
- Record user feedback from each role.
- Track missed events, duplicate writes, offline conflicts, and provider failures.
- Obtain owner sign-off on operational metrics.

## Exit criteria

- Security findings are closed or accepted with documented risk.
- Load and concurrency targets are met.
- Restore rehearsal succeeds.
- Monitoring and runbooks are operational.
- Seven-day parallel run has no unexplained financial or stock discrepancy.

