import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import {
  NotifyPort,
  NotifyChannel,
  EXCEPTION_PORT,
} from '../../shared/ports/ports.interface.js';

/**
 * NotificationService — M7a's notification dispatch hub.
 *
 * Implements the NotifyPort interface (send) and provides:
 *
 *   - FCM  → real push via the device_registrations.fcm_token
 *            (for MVP we log the dispatch; real FCM uses Admin SDK in M7b)
 *   - IN_APP → writes a row to notification_outbox (processed by relayNotifications)
 *   - SMS  → log-only (no Twilio credentials in dev)
 *   - WHATSAPP → log-only (no WhatsApp Business API in dev)
 *
 * The send() method is called both synchronously (by ExceptionService
 * via notify.send) and by the background relay (which polls
 * notification_outbox and calls send per queued row).
 *
 * For FCM, we look up the recipient's fcm_token from
 * device_registrations and log the intended dispatch.
 * In production, this would call `admin.messaging().send(...)`.
 */
@Injectable()
export class NotificationService implements NotifyPort {
  private readonly logger = new Logger(NotificationService.name);

  constructor(@InjectKnex() private readonly knex: Knex) {}

  /**
   * Send a notification via a specific channel.
   *
   * Looks up the template, renders the body with the payload,
   * and dispatches (or logs for SMS/WhatsApp/FCM-MVP).
   *
   * Does NOT throw on delivery failure — failures are recorded
   * to notification_outbox.attempts by the caller (the relay).
   * When called synchronously (e.g. from ExceptionService),
   * an in-app fallback is always queued.
   */
  async send(
    channel: NotifyChannel,
    templateCode: string,
    recipientRef: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const template = await this.knex('notification_templates')
      .where({ code: templateCode, is_active: true })
      .first('body', 'title', 'channel', 'wa_template_id');

    if (!template) {
      this.logger.warn(`Template ${templateCode} not found or inactive — skipping notification`);
      return;
    }

    const renderedBody = this.renderTemplate(template.body, payload);
    const renderedTitle = template.title ? this.renderTemplate(template.title, payload) : undefined;

    switch (channel) {
      case 'FCM':
        await this.sendFcm(recipientRef, renderedTitle, renderedBody, payload);
        break;

      case 'IN_APP':
        await this.enqueueInApp(recipientRef, renderedBody, payload);
        break;

      case 'SMS':
        this.logger.log(`[SMS] to=${recipientRef} body=${renderedBody}`);
        break;

      case 'WHATSAPP':
        this.logger.log(`[WHATSAPP] to=${recipientRef} template=${template.wa_template_id ?? 'default'} body=${renderedBody}`);
        break;

      default:
        this.logger.warn(`Unknown channel ${channel} — skipping`);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Channel implementations
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * FCM push notification.
   *
   * For the M7a MVP, we look up the recipient's FCM token and log the
   * intended dispatch. Real Firebase Admin SDK integration lands in M7b.
   * We DO validate that the user has a registered token.
   */
  private async sendFcm(
    userId: string,
    title: string | undefined,
    body: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const device = await this.knex('device_registrations')
      .where({ user_id: userId })
      .orderBy('registered_at', 'desc')
      .first('fcm_token');

    if (!device?.fcm_token) {
      this.logger.warn(`User ${userId} has no registered FCM token — skipping push`);
      // Fallback: log as if sent (the in-app variant is queued separately)
      return;
    }

    const fcmMessage = {
      token: device.fcm_token,
      notification: { title, body },
      data: payload as Record<string, string>,
    };

    // M7b TODO: call admin.messaging().send(fcmMessage)
    this.logger.log(`[FCM] dispatching to token=${device.fcm_token} title="${title ?? ''}" body="${body}"`);
  }

  /**
   * In-app notification: insert a row in notification_outbox
   * that the mobile/tablet client will poll for the user's inbox.
   */
  private async enqueueInApp(
    userId: string,
    body: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.knex('notification_outbox').insert({
      channel: 'IN_APP',
      recipient_type: 'USER',
      recipient_ref: userId,
      template_code: payload.templateCode ?? 'in_app_generic',
      payload_json: JSON.stringify({ ...payload, body }),
      status: 'QUEUED',
    });

    this.logger.debug(`[IN_APP] enqueued for user=${userId} template=${payload.templateCode ?? 'generic'}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Render a template string by replacing {key} placeholders
   * with values from the payload object.
   */
  private renderTemplate(template: string, payload: Record<string, unknown>): string {
    return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
      const val = payload[key];
      return val !== undefined ? String(val) : `{${key}}`;
    });
  }
}

// NotifyPort is imported here only to type-check the contract.
// The module wiring replaces NOTIFY_PORT with this class.
void EXCEPTION_PORT; // no-op — just ensures the token import is used