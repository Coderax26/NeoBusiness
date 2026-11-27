import { Injectable, Logger } from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import {
  NotifyPort,
  NotifyChannel,
  EXCEPTION_PORT,
} from '../../shared/ports/ports.interface.js';

export interface NotificationDeliveryResult {
  delivered: boolean;
  channel: NotifyChannel;
  provider: string;
  providerMessageId: string;
  fallbackChannel?: 'SMS';
  deferred?: boolean;
}

/**
 * NotificationService — M7a's notification dispatch hub.
 *
 * Implements the NotifyPort interface (`send`) and `dispatch` with real
 * configurable HTTP/provider transports:
 *
 *   - FCM      -> dispatches via `FCM_WEBHOOK_URL` or `FCM_SERVER_KEY` (HTTP)
 *                 to registered device tokens, with automatic SMS fallback
 *                 when the user has no device or push delivery fails.
 *   - SMS      -> dispatches via `SMS_WEBHOOK_URL`, Twilio, or MSG91 HTTP API.
 *   - IN_APP   -> persists a row to `notification_outbox`.
 *   - WHATSAPP -> dispatches via `WHATSAPP_WEBHOOK_URL` when configured, or
 *                 logs an explicit documented deferral otherwise.
 *
 * When provider credentials are omitted in local dev/test, FCM/SMS log a
 * clearly tagged `[DEV-LOG]` entry so local flows remain non-blocking. When
 * provider credentials ARE configured and the HTTP transport returns a
 * non-2xx status or network error, `send`/`dispatch` throws so outbox relay
 * increments attempts and marks repeated failures as `FAILED`.
 */
@Injectable()
export class NotificationService implements NotifyPort {
  private readonly logger = new Logger(NotificationService.name);

  constructor(@InjectKnex() private readonly knex: Knex) {}

  /**
   * Send a notification via a specific channel (NotifyPort contract).
   */
  async send(
    channel: NotifyChannel,
    templateCode: string,
    recipientRef: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.dispatch(channel, templateCode, recipientRef, payload);
  }

  /**
   * Render and dispatch a notification, returning structured provider metadata.
   */
  async dispatch(
    channel: NotifyChannel,
    templateCode: string,
    recipientRef: string,
    payload: Record<string, unknown>,
  ): Promise<NotificationDeliveryResult> {
    const template = await this.knex('notification_templates')
      .where({ code: templateCode, is_active: true })
      .first('body', 'title', 'channel', 'wa_template_id');

    if (!template) {
      this.logger.warn(
        `Template ${templateCode} not found or inactive — skipping notification`,
      );
      return {
        delivered: false,
        channel,
        provider: 'none',
        providerMessageId: '',
      };
    }

    const renderedBody = this.renderTemplate(template.body, payload);
    const renderedTitle = template.title
      ? this.renderTemplate(template.title, payload)
      : undefined;

    switch (channel) {
      case 'FCM':
        return this.sendFcm(
          recipientRef,
          templateCode,
          renderedTitle,
          renderedBody,
          payload,
        );

      case 'IN_APP':
        return this.enqueueInApp(
          recipientRef,
          templateCode,
          renderedTitle,
          renderedBody,
          payload,
        );

      case 'SMS':
        return this.sendSms(
          recipientRef,
          renderedBody,
          templateCode,
          payload,
        );

      case 'WHATSAPP':
        return this.sendWhatsApp(
          recipientRef,
          template.wa_template_id ?? 'default',
          renderedBody,
          payload,
        );

      default:
        this.logger.warn(`Unknown channel ${String(channel)} — skipping`);
        return {
          delivered: false,
          channel,
          provider: 'unknown',
          providerMessageId: '',
        };
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Channel implementations
  // ──────────────────────────────────────────────────────────────────────────

  private async sendFcm(
    userId: string,
    templateCode: string,
    title: string | undefined,
    body: string,
    payload: Record<string, unknown>,
  ): Promise<NotificationDeliveryResult> {
    const devices = await this.knex('device_registrations')
      .where({ user_id: userId })
      .orderBy('last_sync_at', 'desc')
      .select('fcm_token');

    const tokens = (Array.isArray(devices) ? devices : [])
      .map((d: any) => d?.fcm_token)
      .filter((t: unknown): t is string => typeof t === 'string' && t.length > 0);

    if (tokens.length === 0) {
      this.logger.warn(
        `User ${userId} has no registered FCM token — attempting SMS fallback`,
      );
      const fallback = await this.trySmsFallback(
        userId,
        title,
        body,
        templateCode,
        payload,
      );
      if (fallback) {
        return fallback;
      }
      return {
        delivered: false,
        channel: 'FCM',
        provider: 'fcm-no-device',
        providerMessageId: '',
      };
    }

    const webhookUrl = process.env.FCM_WEBHOOK_URL;
    const serverKey = process.env.FCM_SERVER_KEY;

    try {
      if (webhookUrl) {
        const res = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(serverKey ? { Authorization: `Bearer ${serverKey}` } : {}),
          },
          body: JSON.stringify({
            tokens,
            notification: { title, body },
            data: payload,
          }),
        });
        if (!res.ok) {
          throw new Error(`FCM webhook HTTP ${res.status}`);
        }
        const json = await res.json().catch(() => null);
        return {
          delivered: true,
          channel: 'FCM',
          provider: 'fcm-webhook',
          providerMessageId: String(
            json?.messageId ?? json?.id ?? `fcm-wh-${Date.now()}`,
          ),
        };
      }

      if (serverKey) {
        const endpoint =
          process.env.FCM_ENDPOINT || 'https://fcm.googleapis.com/fcm/send';
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `key=${serverKey}`,
          },
          body: JSON.stringify({
            registration_ids: tokens,
            notification: { title, body },
            data: payload,
          }),
        });
        if (!res.ok) {
          throw new Error(`FCM HTTP ${res.status}`);
        }
        const json = await res.json().catch(() => null);
        return {
          delivered: true,
          channel: 'FCM',
          provider: 'fcm-http',
          providerMessageId: String(
            json?.multicast_id ??
              json?.results?.[0]?.message_id ??
              `fcm-${Date.now()}`,
          ),
        };
      }

      this.logger.log(
        `[FCM:DEV-LOG] to=${tokens.length} device(s) token=${tokens[0]} title="${title ?? ''}" body="${body}"`,
      );
      return {
        delivered: true,
        channel: 'FCM',
        provider: 'fcm-dev-log',
        providerMessageId: `fcm-dev-${Date.now()}`,
      };
    } catch (fcmErr) {
      this.logger.warn(
        `FCM delivery failed for user=${userId} (${(fcmErr as Error).message}) — attempting SMS fallback`,
      );
      const fallback = await this.trySmsFallback(
        userId,
        title,
        body,
        templateCode,
        payload,
      );
      if (fallback) {
        return fallback;
      }
      throw fcmErr;
    }
  }

  private async trySmsFallback(
    userId: string,
    title: string | undefined,
    body: string,
    templateCode: string,
    payload: Record<string, unknown>,
  ): Promise<NotificationDeliveryResult | null> {
    const user = await this.knex('users')
      .where({ id: userId })
      .first('phone');

    if (!user?.phone) {
      return null;
    }

    const smsBody = title ? `${title}: ${body}` : body;
    const smsResult = await this.sendSms(
      String(user.phone),
      smsBody,
      templateCode,
      payload,
    );

    return {
      delivered: smsResult.delivered,
      channel: 'FCM',
      fallbackChannel: 'SMS',
      provider: smsResult.provider,
      providerMessageId: smsResult.providerMessageId,
    };
  }

  private async sendSms(
    recipientPhone: string,
    body: string,
    templateCode: string,
    payload: Record<string, unknown>,
  ): Promise<NotificationDeliveryResult> {
    const webhookUrl = process.env.SMS_WEBHOOK_URL;
    const apiKey = process.env.SMS_API_KEY;
    if (webhookUrl) {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          to: recipientPhone,
          message: body,
          templateCode,
          payload,
        }),
      });
      if (!res.ok) {
        throw new Error(`SMS webhook HTTP ${res.status}`);
      }
      const json = await res.json().catch(() => null);
      return {
        delivered: true,
        channel: 'SMS',
        provider: 'sms-webhook',
        providerMessageId: String(
          json?.messageId ?? json?.sid ?? `sms-wh-${Date.now()}`,
        ),
      };
    }

    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioFrom = process.env.TWILIO_FROM_NUMBER;
    if (twilioSid && twilioToken && twilioFrom) {
      const params = new URLSearchParams({
        To: recipientPhone,
        From: twilioFrom,
        Body: body,
      });
      const auth = Buffer.from(`${twilioSid}:${twilioToken}`).toString(
        'base64',
      );
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        },
      );
      if (!res.ok) {
        throw new Error(`Twilio SMS HTTP ${res.status}`);
      }
      const json = await res.json().catch(() => null);
      return {
        delivered: true,
        channel: 'SMS',
        provider: 'twilio',
        providerMessageId: String(json?.sid ?? `twilio-${Date.now()}`),
      };
    }

    const msg91Key = process.env.MSG91_AUTH_KEY;
    if (msg91Key) {
      const endpoint =
        process.env.MSG91_ENDPOINT || 'https://control.msg91.com/api/v5/flow/';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authkey: msg91Key,
        },
        body: JSON.stringify({
          template_id: templateCode,
          mobiles: recipientPhone,
          message: body,
          ...payload,
        }),
      });
      if (!res.ok) {
        throw new Error(`MSG91 SMS HTTP ${res.status}`);
      }
      const json = await res.json().catch(() => null);
      return {
        delivered: true,
        channel: 'SMS',
        provider: 'msg91',
        providerMessageId: String(json?.request_id ?? `msg91-${Date.now()}`),
      };
    }

    this.logger.log(`[SMS:DEV-LOG] to=${recipientPhone} body=${body}`);
    return {
      delivered: true,
      channel: 'SMS',
      provider: 'sms-dev-log',
      providerMessageId: `sms-dev-${Date.now()}`,
    };
  }

  private async sendWhatsApp(
    recipientRef: string,
    waTemplateId: string,
    body: string,
    payload: Record<string, unknown>,
  ): Promise<NotificationDeliveryResult> {
    const webhookUrl = process.env.WHATSAPP_WEBHOOK_URL;
    if (webhookUrl) {
      const token = process.env.WHATSAPP_ACCESS_TOKEN;
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          to: recipientRef,
          templateId: waTemplateId,
          body,
          payload,
        }),
      });
      if (!res.ok) {
        throw new Error(`WhatsApp webhook HTTP ${res.status}`);
      }
      const json = await res.json().catch(() => null);
      return {
        delivered: true,
        channel: 'WHATSAPP',
        provider: 'whatsapp-webhook',
        providerMessageId: String(
          json?.messageId ?? json?.id ?? `wa-${Date.now()}`,
        ),
      };
    }

    this.logger.log(
      `[WHATSAPP:DEFERRED] to=${recipientRef} template=${waTemplateId} body=${body}`,
    );
    return {
      delivered: false,
      deferred: true,
      channel: 'WHATSAPP',
      provider: 'whatsapp-deferred',
      providerMessageId: '',
    };
  }

  /**
   * In-app notification: insert a row in notification_outbox
   * that the mobile/tablet client polls for the user's inbox.
   */
  private async enqueueInApp(
    userId: string,
    templateCode: string,
    title: string | undefined,
    body: string,
    payload: Record<string, unknown>,
  ): Promise<NotificationDeliveryResult> {
    const resolvedTemplate =
      (typeof payload.templateCode === 'string' && payload.templateCode) ||
      templateCode ||
      'in_app_generic';

    const inserted = await this.knex('notification_outbox')
      .insert({
        channel: 'IN_APP',
        recipient_type: 'USER',
        recipient_ref: userId,
        template_code: resolvedTemplate,
        payload_json: JSON.stringify({
          ...payload,
          ...(title ? { title } : {}),
          body,
        }),
        status: 'QUEUED',
      })
      .returning('id');

    const msgId = String(inserted?.[0]?.id ?? `inapp-${Date.now()}`);
    this.logger.debug(
      `[IN_APP] enqueued for user=${userId} template=${resolvedTemplate}`,
    );
    return {
      delivered: true,
      channel: 'IN_APP',
      provider: 'in-app-outbox',
      providerMessageId: msgId,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Render a template string by replacing both `{{key}}` and `{key}`
   * placeholders with values from the payload object.
   */
  renderTemplate(
    template: string,
    payload: Record<string, unknown>,
  ): string {
    return template
      .replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
        const val = payload[key];
        return val !== undefined && val !== null ? String(val) : match;
      })
      .replace(/\{(\w+)\}/g, (match, key: string) => {
        const val = payload[key];
        return val !== undefined && val !== null ? String(val) : match;
      });
  }
}

void EXCEPTION_PORT;
