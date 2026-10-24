import { Controller, Post, Body, UseGuards, Req, Logger } from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import { JwtAuthGuard } from '../m0-platform/jwt-auth.guard.js';
import { RequirePermission } from '../m0-platform/rbac.service.js';

/**
 * Device registration DTO.
 *
 * The mobile/tablet client calls this endpoint with its FCM token
 * so that M7a can push notification cards to the right device.
 *
 * The endpoint is idempotent — re-registering the same token
 * updates the `last_seen_at` timestamp.
 */
interface RegisterDeviceDto {
  fcmToken: string;
  deviceId: string;
  platform: 'ANDROID' | 'IOS' | 'WEB';
}

/**
 * DeviceController — FCM token registration.
 *
 * POST /api/v1/devices/register
 *
 * Authenticated endpoint. Stores the FCM token in device_registrations
 * so that NotificationService can push exception cards to the user.
 *
 * The JWT_AUTH_GUARD ensures only authenticated users can register
 * a device. Every user can register their own device.
 */
@Controller('devices')
@UseGuards(JwtAuthGuard)
export class DeviceController {
  private readonly logger = new Logger(DeviceController.name);

  constructor(@InjectKnex() private readonly knex: Knex) {}

  /**
   * Register or refresh the user's FCM token.
   *
   * On repeat registration (same user + same device_id), the row is
   * updated to refresh `is_active = true` and `last_seen_at`.
   * On repeat registration with a *different* token for the same
   * device_id, the old token is invalidated (is_active = false) and
   * the new one takes its place.
   */
  @Post('register')
  @RequirePermission('device.register')
  async register(@Req() req: any, @Body() dto: RegisterDeviceDto): Promise<{ ok: boolean; deviceId: string }> {
    const userId = req.user.sub;
    const { fcmToken, deviceId, platform } = dto;

    this.logger.debug(`Device registration: user=${userId} device=${deviceId} platform=${platform}`);

    // Delete-and-readd pattern: the table has a UNIQUE(user_id, device_id)
    // PK constraint, so we upsert by deleting the old row then inserting.
    await this.knex('device_registrations')
      .where({ user_id: userId, device_id: deviceId })
      .del();

    // Insert the new registration
    await this.knex('device_registrations').insert({
      user_id: userId,
      device_id: deviceId,
      fcm_token: fcmToken,
      platform,
      app_version: undefined,
      last_sync_at: new Date(),
    });

    return { ok: true, deviceId };
  }
}
