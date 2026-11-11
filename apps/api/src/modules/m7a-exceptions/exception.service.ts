import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Inject,
  OnModuleInit,
} from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import {
  EXCEPTION_PORT,
  NOTIFY_PORT,
  type ExceptionType,
  type ExceptionPayload,
  type ExceptionPort,
  type NotifyPort,
} from '../../shared/ports/ports.interface.js';
import { ConfigService } from '../m0-platform/config.service.js';
import { OutboxService } from '../../shared/events/outbox.service.js';

type ResolutionAction = 'APPROVED' | 'REJECTED' | 'COUNTERED';

interface RaiseOptions {
  siteId?: string;
  valueAtRisk?: string; // numeric string
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
}

/**
 * ExceptionService — M7a's heart.
 *
 * Implements the ExceptionPort interface (raise / onResolved) plus the
 * management-by-exception lifecycle: resolve, expire, escalate.
 *
 * All writes happen inside a single Knex transaction so that the exception
 * record, the domain event (via OutboxService), and the notification enqueue
 * are committed atomically — matching ADR-005 (Transactional Outbox).
 */
@Injectable()
export class ExceptionService implements ExceptionPort, OnModuleInit {
  private readonly logger = new Logger(ExceptionService.name);

  /** Resolved handlers indexed by exception type (registered via onResolved). */
  private handlers = new Map<
    ExceptionType,
    (
      exceptionId: string,
      action: string,
      remarks: string,
      counterJson?: object,
    ) => Promise<void>
  >();

  constructor(
    @InjectKnex() private readonly knex: Knex,
    private readonly configService: ConfigService,
    private readonly outbox: OutboxService,
    @Inject(NOTIFY_PORT) private readonly notify: NotifyPort,
  ) {}

  onModuleInit(): void {
    this.logger.log(
      'ExceptionService initialized (EXCEPTION_PORT → real implementation)',
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ExceptionPort interface
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Raise a new exception card.
   *
   * Flow:
   *  1. Look up the approval policy for this exception type.
   *  2. Determine the approver (primary role → specific user via user_site_access).
   *  3. Set expires_at = now + auto_expire_minutes (from policy or global config).
   *  4. Insert the exception_approvals row (starts PENDING).
   *  5. Emit domain event 'exception.requested' via OutboxService (in-trx).
   *  6. Queue a notification to the approver's device.
   *
   * Idempotency: if a PENDING card already exists for the same
   *   (exception_type, reference_table, reference_id), it is returned
   *   instead of creating a duplicate. The unique partial index
   *   uq_exception_unique_pending enforces this at the DB level.
   *
   * @returns the exception_approvals UUID
   */
  async raise(
    type: ExceptionType,
    referenceTable: string,
    referenceId: string,
    requestedBy: string,
    payload: ExceptionPayload,
    siteId?: string,
    opts: RaiseOptions = {},
  ): Promise<string> {
    const valueAtRisk = opts.valueAtRisk ?? payload.valueAtRisk ?? null;
    const priority = opts.priority ?? 'NORMAL';
    const siteIdFinal = opts.siteId ?? siteId ?? null;

    return this.knex.transaction(async (trx) => {
      // 1 — Check idempotency: is there already a PENDING card?
      const existing = await trx('exception_approvals')
        .where({
          exception_type: type,
          reference_table: referenceTable,
          reference_id: referenceId,
          status: 'PENDING',
        })
        .first('id');

      if (existing) {
        this.logger.debug(
          `Exception ${type}:${referenceTable}:${referenceId} already PENDING — returning existing card`,
        );
        return String(existing.id);
      }

      // 2 — Look up the approval policy
      const policy = await trx('approval_policies')
        .where({ exception_type: type })
        .first(
          'escalation_wait_minutes',
          'primary_approver_role',
          'delegate_user_id',
        );

      if (!policy) {
        throw new BadRequestException(
          `No approval_policy configured for exception type ${type}`,
        );
      }

      // 3 — Resolve the approver user
      const approverUserId = await this.resolveApprover(
        policy.primary_approver_role,
        siteIdFinal,
        trx,
      );

      // 4 — Compute expiry time from policy's escalation_wait_minutes
      const autoExpireMinutes = Number(policy.escalation_wait_minutes);
      const expiresAt = new Date(Date.now() + autoExpireMinutes * 60_000);

      // 5 — Insert the card
      const [card] = await trx('exception_approvals')
        .insert({
          exception_type: type,
          reference_table: referenceTable,
          reference_id: referenceId,
          requested_by: requestedBy,
          site_id: siteIdFinal,
          context_payload_json: JSON.stringify(payload),
          status: 'PENDING',
          priority,
          value_at_risk: valueAtRisk ? Number(valueAtRisk) : null,
          owner_remarks: null,
          resolved_by: null,
          resolved_at: null,
          expires_at: expiresAt,
          escalated_to: null,
        })
        .returning('id');

      const exceptionId = String(card.id);

      // 6 — Write the audit event
      await trx('exception_events').insert({
        exception_id: exceptionId,
        event: 'RAISED',
        by_user: requestedBy,
      });

      // 7 — Emit domain event (transactional outbox — stays in the same trx)
      await this.outbox.raise(
        trx,
        'exception.requested',
        exceptionId,
        {
          exceptionType: type,
          referenceTable,
          referenceId,
          siteId: siteIdFinal,
          approverUserId,
          valueAtRisk,
        },
        'm7',
      );

      // 8 — Queue a notification to the approver's device
      if (approverUserId) {
        await this.enqueueNotification(
          trx,
          approverUserId,
          exceptionId,
          type,
          payload,
        );
      }

      this.logger.debug(
        `Raised exception ${type}:${exceptionId} — expires ${expiresAt.toISOString()}`,
      );
      return exceptionId;
    });
  }

  /**
   * Register a handler that will be called when an exception of
   * the given type is resolved.
   *
   * The originating module (M1, M2, etc.) calls onResolved() at startup
   * to register its resumption callback.
   *
   * When resolve() is called, ExceptionService invokes the handler
   * AFTER committing the transaction, so the handler can safely
   * start a new transaction to resume its business flow.
   */
  onResolved(
    type: ExceptionType,
    handler: (
      exceptionId: string,
      action: string,
      remarks: string,
      counterJson?: object,
    ) => Promise<void>,
  ): void {
    this.handlers.set(type, handler);
    this.logger.debug(`onResolved handler registered for ${type}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Lifecycle: resolve
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Resolve an exception card.
   *
   * - Idempotent: if the card is already resolved (or expired), the
   *   current status is returned without error.
   * - Single-resolution: the card's status must be PENDING; any other
   *   status short-circuits with a 409-like message.
   * - After commit, the registered onResolved handler (if any) is
   *   invoked so the originating module can resume.
   *
   * @returns the card's final status
   */
  async resolve(
    exceptionId: string,
    action: ResolutionAction,
    remarks: string,
    counterJson?: object,
  ): Promise<string> {
    const userId = await this.currentUserId();

    const result = await this.knex.transaction(async (trx) => {
      // Lock the row
      const card = await trx('exception_approvals')
        .where({ id: exceptionId })
        .forUpdate()
        .first(
          'id',
          'status',
          'exception_type',
          'reference_id',
          'reference_table',
          'requested_by',
        );

      if (!card) {
        throw new NotFoundException(`Exception ${exceptionId} not found`);
      }

      // Idempotency / single-resolution: only PENDING cards can be resolved
      if (card.status !== 'PENDING') {
        return {
          status: card.status,
          type: card.exception_type,
          refId: card.reference_id,
          tableName: card.reference_table,
        };
      }

      const now = new Date();
      const resolvedBy = userId ?? card.requested_by;

      // Update the card
      await trx('exception_approvals').where({ id: exceptionId }).update({
        status: action,
        resolved_by: resolvedBy,
        resolved_at: now,
        owner_remarks: remarks,
      });

      // Write the audit event
      await trx('exception_events').insert({
        exception_id: exceptionId,
        event: 'RESOLVED',
        by_user: resolvedBy,
        metadata_json: JSON.stringify({
          action,
          remarks,
          counter: counterJson ?? null,
        }),
      });

      return {
        status: action,
        type: card.exception_type,
        refId: card.reference_id,
        tableName: card.reference_table,
        resolvedBy,
      };
    });

    // Emit domain event (outside the trx so it fires after commit)
    await this.outbox.raiseStandalone(
      'exception.resolved',
      result.type, // aggregateId is the exception type for the originating module lookup
      {
        exceptionId,
        exceptionType: result.type,
        referenceId: result.refId,
        referenceTable: result.tableName,
        action: result.status as 'APPROVED' | 'REJECTED' | 'COUNTERED',
        remarks,
        counterJson,
        resolvedBy: result.resolvedBy,
        resolvedAt: new Date().toISOString(),
      },
      'm7',
    );

    // Fire onResolved handlers (async, fire-and-forget from the DB perspective)
    const handler = this.handlers.get(result.type as ExceptionType);
    if (handler) {
      void handler(exceptionId, result.status, remarks, counterJson).catch(
        (err) =>
          this.logger.error(
            `onResolved handler failed for ${result.type}: ${(err as Error).message}`,
          ),
      );
    }

    return result.status;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Lifecycle: expire + escalate (background sweep)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Scan for PENDING cards whose expires_at has passed and
   * either auto-reject them or escalate to the delegate user,
   * depending on the approval policy.
   *
   * This is intended to run on a timer (every 1 minute per the blueprint).
   */
  async sweepExpired(): Promise<void> {
    const now = new Date();
    const expired = await this.knex('exception_approvals')
      .where('status', 'PENDING')
      .where('expires_at', '<', now)
      .orderBy('created_at');

    for (const card of expired) {
      await this.expireOrEscalate(String(card.id), Number(card.value_at_risk));
    }
  }

  /** @internal */
  private async expireOrEscalate(
    exceptionId: string,
    valueAtRisk: number,
  ): Promise<void> {
    return this.knex.transaction(async (trx) => {
      const card = await trx('exception_approvals')
        .where({ id: exceptionId, status: 'PENDING' })
        .forUpdate()
        .first('exception_type', 'escalated_to');

      if (!card) return; // already resolved or expired by a concurrent sweep

      const policy = await trx('approval_policies')
        .where({ exception_type: card.exception_type })
        .first(
          'can_delegate',
          'delegate_user_id',
          'delegate_value_cap_inr',
          'second_escalation_user_id',
          'escalation_wait_minutes',
        );

      // Decision: escalate or reject
      const shouldEscalate =
        card.escalated_to !== null || // already escalated once → escalate again to second
        (policy?.can_delegate &&
          policy?.delegate_user_id !== null &&
          (policy?.delegate_value_cap_inr === null ||
            Number(policy.delegate_value_cap_inr) >= valueAtRisk));

      const targetStatus: 'EXPIRED' | 'COUNTERED' = shouldEscalate
        ? 'COUNTERED'
        : 'EXPIRED';
      const newEscalatedTo = shouldEscalate
        ? card.escalated_to
          ? policy.second_escalation_user_id
          : policy.delegate_user_id
        : null;

      await trx('exception_approvals')
        .where({ id: exceptionId })
        .update({
          status: targetStatus,
          escalated_to: newEscalatedTo ?? card.escalated_to,
        });

      await trx('exception_events').insert({
        exception_id: exceptionId,
        event: shouldEscalate ? 'ESCALATED' : 'EXPIRED',
        metadata_json: JSON.stringify({
          action: targetStatus,
          escalatedTo: newEscalatedTo ?? null,
          valueAtRisk,
        }),
      });

      // Emit domain event for escalation
      if (shouldEscalate) {
        await this.outbox.raise(
          trx,
          'exception.resolved',
          card.exception_type,
          {
            exceptionId,
            exceptionType: card.exception_type,
            action: 'ESCALATED',
            remarks: 'Auto-escalated by expiry sweep',
            escalatedTo: newEscalatedTo,
          },
          'm7',
        );
      }

      this.logger.debug(`Exception ${exceptionId} ${targetStatus}`);
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // M7a background notification relay
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Poll the notification_outbox for QUEUED rows with < 3 attempts
   * and dispatch them via the NotifyPort.
   * Intended to run on a timer (every 10s).
   */
  async relayNotifications(): Promise<number> {
    const rows = await this.knex('notification_outbox')
      .where('status', 'QUEUED')
      .where('attempts', '<', 3)
      .orderBy('created_at')
      .limit(50);

    let dispatched = 0;
    for (const row of rows) {
      const template = await this.knex('notification_templates')
        .where({ code: row.template_code, is_active: true })
        .first('channel', 'body', 'title', 'wa_template_id');

      if (!template) {
        await this.knex('notification_outbox')
          .where({ id: row.id })
          .update({
            status: 'FAILED',
            error: `Template ${row.template_code} not found`,
          });
        continue;
      }

      try {
        await this.notify.send(
          template.channel as 'FCM' | 'WHATSAPP' | 'SMS' | 'IN_APP',
          row.template_code,
          row.recipient_ref,
          JSON.parse(row.payload_json as unknown as string),
        );
        await this.knex('notification_outbox')
          .where({ id: row.id })
          .update({ status: 'SENT', provider_msg_id: `sent-${row.id}` });
        dispatched++;
      } catch (err) {
        const error = (err as Error).message;
        await this.knex('notification_outbox')
          .where({ id: row.id })
          .increment('attempts', 1)
          .update({ error });
      }
    }
    return dispatched;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Resolve which user should receive an exception card, given the
   * policy's primary_approver_role and the site context.
   *
   * For OWNER-level exceptions, the owner user is selected.
   * For other roles, we find a user matching that role at the given site
   * (or across all sites if siteId is null).
   */
  private async resolveApprover(
    role: string,
    siteId: string | null,
    trx: Knex.Transaction,
  ): Promise<string | null> {
    // OWNER always resolves to the single OWNER user
    const query = trx('users')
      .where({ role })
      .where('is_active', true)
      .first('id');

    if (siteId) {
      query.andWhere((qb) => {
        qb.where('assigned_site_id', siteId).orWhereExists((sub) => {
          sub
            .select('*')
            .from('user_site_access')
            .whereRaw('user_site_access.user_id = users.id')
            .andWhere('user_site_access.site_id', siteId);
        });
      });
    }

    const row = await query;
    return row ? String(row.id) : null;
  }

  private async enqueueNotification(
    trx: Knex.Transaction,
    approverUserId: string,
    exceptionId: string,
    type: ExceptionType,
    payload: ExceptionPayload,
  ): Promise<void> {
    // Check if the approver has any registered devices
    const device = await trx('device_registrations')
      .where({ user_id: approverUserId })
      .orderBy('registered_at', 'desc')
      .first('id', 'fcm_token');

    if (device?.fcm_token) {
      // Queue FCM push notification
      await trx('notification_outbox').insert({
        channel: 'FCM',
        recipient_type: 'USER',
        recipient_ref: approverUserId,
        template_code: 'exception_card_push',
        payload_json: JSON.stringify({
          exceptionId,
          exceptionType: type,
          title: payload.title,
          count: 1,
        }),
        status: 'QUEUED',
      });
    }

    // Also queue an in-app notification
    await trx('notification_outbox').insert({
      channel: 'IN_APP',
      recipient_type: 'USER',
      recipient_ref: approverUserId,
      template_code: 'in_app_exception',
      payload_json: JSON.stringify({
        exceptionId,
        exceptionType: type,
        title: payload.title,
        value_at_risk: payload.valueAtRisk ?? null,
      }),
      status: 'QUEUED',
    });
  }

  /**
   * Get the current user ID from the request context.
   *
   * The RlsContextMiddleware sets `app.user_id` at the PG session level
   * via `SET LOCAL`. We read it back with `current_setting(...)` so that
   * audit events and resolutions are attributed to the real caller.
   */
  private async currentUserId(): Promise<string | null> {
    const row = await this.knex.raw(
      "SELECT current_setting('app.user_id', true) AS uid",
    );
    const uid = row.rows?.[0]?.uid ?? row[0]?.uid;
    return uid && uid !== '' ? String(uid) : null;
  }
}

// EXCEPTION_PORT is provided here and re-exported so m0-platform.module.ts
// can wire it as the global token replacement for the stub.
