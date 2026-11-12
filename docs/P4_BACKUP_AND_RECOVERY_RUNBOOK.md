# Phase P4.3 — Backup, PITR & Disaster Recovery Runbook

**RPO Target:** $\le 15\text{ minutes}$ (Continuous PostgreSQL WAL Archiving / PITR)  
**RTO Target:** $\le 30\text{ minutes}$ (Automated restore to standby/isolated instance + verification)  
**Primary Owner:** Database & Infrastructure Lead (Backup verification weekly by Ops Coordinator / DevOps)

---

## 1. Backup Schedule & Retention Matrix

| Backup Tier | Frequency | Retention | Storage Location | Encryption |
|---|---|---|---|---|
| **Logical Base Snapshot (`pg_dump -Fc`)** | Daily at `02:00 IST` (post-EOD closing) | 30 days daily + 12 monthly | Off-site encrypted S3/Object Storage | AES-256 SSE-KMS |
| **Continuous WAL Segments (PITR)** | Continuous (`archive_mode=on`) | 14 days rolling window | `postgres_wal_archive` synced to S3 | AES-256 |
| **Redis AOF (`appendonly yes`)** | Every second (`everysec`) | 7 days snapshot | `redis_prod_data` volume | Encrypted volume |

---

## 2. Point-in-Time Recovery (PITR) & Isolated Restore Rehearsal Procedure

### Step 1: Take Logical Backup (Production / Dev)
```bash
docker exec neobus_prod_postgres pg_dump \
  -U neobus_app -d neobus_prod -Fc \
  -f /tmp/neobus_backup_$(date +%Y%m%d_%H%M).dump
```

### Step 2: Restore into an Isolated Staging Environment
```bash
createdb -h localhost -U neobus_app neobus_restore_rehearsal
pg_restore -h localhost -U neobus_app -d neobus_restore_rehearsal \
  --no-owner --role=neobus_app /tmp/neobus_backup_YYYYMMDD.dump
```

### Step 3: Post-Restore Migration & Ledger Integrity Checks
Run the automated verification check against the restored database:
1. Run pending migrations check: `npm --prefix apps/api run migrate:status` (must match `db/migrations/` count).
2. Run append-only ledger & continuity script:
   ```bash
   node scripts/backup-and-verify.mjs
   ```
3. Verify zero orphaned outbox dead-letters and exact row counts on:
   - `stock_ledger_txns`
   - `collection_receipts`
   - `customer_ledger_entries`
   - `custody_ledger`
   - `supplier_ledger_entries`
   - `immutable_audit_logs`

---

## 3. PostgreSQL & Redis Failover Plan

1. **PostgreSQL Primary Failure**:
   - Promote warm standby or provision new Postgres 16 container using `docker-compose.prod.yml`.
   - Replay WAL segments up to target timestamp (`recovery_target_time` in `postgresql.conf`) for zero financial transaction loss.
2. **Redis Queue Loss**:
   - BullMQ jobs in `dashboard-events` and `outbox-relay` are **idempotent and backed by PostgreSQL `outbox_events`**.
   - On fresh Redis startup, `OutboxRelay` automatically replays any `outbox_events` with `published_at IS NULL` within 5 seconds.

