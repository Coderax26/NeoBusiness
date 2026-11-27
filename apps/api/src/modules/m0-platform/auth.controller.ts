import {
  Controller,
  Post,
  Patch,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  Req,
  UseGuards,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import * as bcrypt from 'bcrypt';
import { AuthService, JwtPayload } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private readonly otpStore = new Map<
    string,
    { otpHash: string; expiresAt: number; attempts: number }
  >();

  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with phone and password/PIN' })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    schema: {
      example: {
        user: { id: 'uuid', phone: '+91...', role: 'OWNER' },
        accessToken: 'eyJ...',
        refreshToken: 'eyJ...',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() body: { phone?: string; identifier?: string; email?: string; password?: string; pin?: string },
  ): Promise<{ user: any; accessToken: string; refreshToken: string }> {
    const rawIdentifier = (body?.phone ?? body?.identifier ?? body?.email ?? '').trim();
    const credential = (body?.password ?? body?.pin ?? '').trim();
    if (!rawIdentifier || !credential) {
      throw new UnauthorizedException('Phone/identifier and password/PIN are required');
    }
    const result = await this.authService.validateUser(rawIdentifier, credential);
    if (!result) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const { password_hash, pin_hash, ...safeUser } = result.user;
    return {
      user: safeUser,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(
    @Body() body: { refreshToken: string },
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const result = await this.authService.refreshAccessToken(body.refreshToken);
    if (!result) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    return result;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout - revoke refresh token' })
  async logout(
    @Body() body: { refreshToken: string },
  ): Promise<{ message: string }> {
    await this.authService.revokeRefreshToken(body.refreshToken);
    return { message: 'Logged out successfully' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  async me(@Req() req: any): Promise<any> {
    const user = req.user as JwtPayload;
    const fullUser = await this.authService.getUserWithSites(user.sub);
    if (!fullUser) {
      throw new NotFoundException('User not found');
    }
    const { password_hash, pin_hash, ...safeUser } = fullUser;
    return safeUser;
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update own profile preferences or language (G-M0-6)' })
  async updateMe(
    @Body() body: { name?: string; preferredLanguage?: 'en' | 'mr'; uiPreferences?: Record<string, unknown> },
    @Req() req: any,
  ) {
    const userId = String(req.user?.sub || req.user?.id || '');
    const knex = this.authService['knex'];
    const updates: Record<string, unknown> = { updated_at: new Date(), updated_by: userId };
    if (body.name !== undefined) updates.full_name = body.name.trim();
    if (body.preferredLanguage !== undefined) updates.preferred_language = body.preferredLanguage;
    await knex('users').where('id', userId).update(updates);

    if (body.uiPreferences !== undefined) {
      const prefKey = `USER_PREFS_${userId}`;
      const existingPref = await knex('business_rule_config').where({ key: prefKey, scope: 'GLOBAL' }).first();
      if (existingPref) {
        await knex('business_rule_config')
          .where({ key: prefKey, scope: 'GLOBAL' })
          .update({ value_json: body.uiPreferences, updated_by: userId, updated_at: new Date() });
      } else {
        await knex('business_rule_config').insert({
          key: prefKey,
          value_json: body.uiPreferences,
          scope: 'GLOBAL',
          scope_ref: null,
          description: `UI preferences for user ${userId}`,
          updated_by: userId,
          updated_at: new Date(),
        });
      }
    }

    const profile = await this.authService.getUserWithSites(userId);
    const { password_hash, pin_hash, ...safeProfile } = profile ?? {};
    return {
      ...safeProfile,
      uiPreferences: body.uiPreferences,
      updatedAt: new Date().toISOString(),
    };
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change own password or PIN (G-M0-6)' })
  async changePassword(
    @Body() body: { currentCredential?: string; newCredential?: string },
    @Req() req: any,
  ) {
    const userId = String(req.user?.sub || req.user?.id || '');
    const currentCredential = String(body?.currentCredential ?? '').trim();
    const newCredential = String(body?.newCredential ?? '').trim();

    if (!currentCredential || !newCredential) {
      throw new BadRequestException(
        'Both currentCredential and newCredential are required',
      );
    }
    if (newCredential.length < 4 || newCredential.length > 64) {
      throw new BadRequestException(
        'newCredential must be between 4 and 64 characters',
      );
    }

    const knex = this.authService['knex'];
    const user = await knex('users')
      .where('id', userId)
      .first('id', 'password_hash', 'pin_hash');
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const currentHash = user.password_hash || user.pin_hash;
    if (!currentHash) {
      throw new UnauthorizedException('No existing PIN or password set');
    }

    const matches = await bcrypt.compare(currentCredential, currentHash);
    if (!matches) {
      throw new UnauthorizedException('Current PIN or password is incorrect');
    }

    const newHash = await bcrypt.hash(newCredential, 10);
    await knex('users')
      .where('id', userId)
      .update({
        pin_hash: newHash,
        password_hash: null,
        updated_at: new Date(),
        updated_by: userId,
      });

    return {
      userId,
      changed: true,
      message: 'Credential updated successfully',
    };
  }

  @Post('forgot-pin')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trigger SMS OTP for PIN/password reset (G-M0-5)' })
  async forgotPin(@Body() body: { phone: string }) {
    const normalizedPhone = String(body?.phone ?? '').trim();
    if (!normalizedPhone || normalizedPhone.replace(/\D/g, '').length < 10) {
      throw new BadRequestException('A valid registered phone number is required');
    }

    const knex = this.authService['knex'];
    const digits = normalizedPhone.replace(/\D/g, '');
    const candidates = Array.from(
      new Set([
        normalizedPhone,
        digits,
        digits.length === 10 ? `+91${digits}` : normalizedPhone,
        digits.length === 12 && digits.startsWith('91')
          ? `+${digits}`
          : normalizedPhone,
      ]),
    );

    const user = await knex('users')
      .whereIn('phone', candidates)
      .where('is_active', true)
      .first('id', 'phone', 'full_name');

    if (user) {
      const otp = String(randomInt(100000, 999999));
      const otpHash = await bcrypt.hash(otp, 10);
      const expiresAt = Date.now() + 5 * 60 * 1000;
      for (const key of [normalizedPhone, String(user.phone)]) {
        this.otpStore.set(key, { otpHash, expiresAt, attempts: 0 });
      }
      if (process.env.NODE_ENV !== 'production') {
        this.logger.debug(`PIN reset OTP generated for ${user.phone}: ${otp}`);
      }
      await knex('notification_outbox')
        .insert({
          channel: 'SMS',
          recipient_type: 'USER',
          recipient_ref: String(user.phone),
          template_code: 'OTP_LOGIN_SMS',
          payload_json: JSON.stringify({
            otp,
            userName: user.full_name,
            purpose: 'PIN_RESET',
          }),
          status: 'QUEUED',
        })
        .catch(() => {});
    }

    return {
      phone: normalizedPhone,
      channel: 'SMS',
      otpDispatched: true,
      expiresInSeconds: 300,
    };
  }

  @Post('reset-pin')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP and set new PIN/password (G-M0-5)' })
  async resetPin(@Body() body: { phone: string; otp: string; newPin: string }) {
    const normalizedPhone = String(body?.phone ?? '').trim();
    const otp = String(body?.otp ?? '').trim();
    const newPin = String(body?.newPin ?? '').trim();

    if (!normalizedPhone || !otp || !newPin) {
      throw new BadRequestException('phone, otp, and newPin are required');
    }
    if (!/^\d{4,6}$/.test(newPin)) {
      throw new BadRequestException('newPin must be 4 to 6 numeric digits');
    }

    const record = this.otpStore.get(normalizedPhone);
    if (!record || record.expiresAt < Date.now() || record.attempts >= 5) {
      if (record) this.otpStore.delete(normalizedPhone);
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    record.attempts += 1;
    const otpValid = await bcrypt.compare(otp, record.otpHash);
    if (!otpValid) {
      if (record.attempts >= 5) this.otpStore.delete(normalizedPhone);
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    const knex = this.authService['knex'];
    const digits = normalizedPhone.replace(/\D/g, '');
    const candidates = Array.from(
      new Set([
        normalizedPhone,
        digits,
        digits.length === 10 ? `+91${digits}` : normalizedPhone,
        digits.length === 12 && digits.startsWith('91')
          ? `+${digits}`
          : normalizedPhone,
      ]),
    );

    const user = await knex('users')
      .whereIn('phone', candidates)
      .where('is_active', true)
      .first('id', 'phone');
    if (!user) {
      this.otpStore.delete(normalizedPhone);
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    const newHash = await bcrypt.hash(newPin, 10);
    await knex.transaction(async (trx) => {
      await trx('users')
        .where('id', user.id)
        .update({
          pin_hash: newHash,
          password_hash: null,
          updated_at: new Date(),
          updated_by: user.id,
        });
      await trx('refresh_tokens').where('user_id', user.id).del();
    });

    this.otpStore.delete(normalizedPhone);
    this.otpStore.delete(String(user.phone));

    return {
      phone: normalizedPhone,
      reset: true,
      message: 'PIN reset complete',
    };
  }
}
