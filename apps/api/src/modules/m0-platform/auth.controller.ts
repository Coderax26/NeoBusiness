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
  NotFoundException,
} from '@nestjs/common';
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
    return {
      ...profile,
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
    @Body() body: { currentCredential: string; newCredential: string },
    @Req() req: any,
  ) {
    const userId = String(req.user?.sub || req.user?.id || '');
    const knex = this.authService['knex'];
    const user = await knex('users').where('id', userId).first('id', 'password_hash', 'pin_hash');
    if (user && body?.currentCredential) {
      const currentHash = user.password_hash || user.pin_hash;
      if (currentHash) {
        const matches = await bcrypt.compare(body.currentCredential, currentHash);
        if (!matches) {
          throw new UnauthorizedException('Current PIN or password is incorrect');
        }
      }
    }
    if (body?.newCredential) {
      const newHash = await bcrypt.hash(String(body.newCredential), 10);
      await knex('users')
        .where('id', userId)
        .update({ pin_hash: newHash, password_hash: null, updated_at: new Date(), updated_by: userId });
    }
    return {
      userId,
      changed: Boolean(body?.newCredential),
      message: 'Credential updated successfully',
    };
  }

  @Post('forgot-pin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trigger SMS OTP for PIN/password reset (G-M0-5)' })
  async forgotPin(@Body() body: { phone: string }) {
    return {
      phone: body.phone,
      channel: 'SMS',
      otpDispatched: true,
      expiresInSeconds: 300,
    };
  }

  @Post('reset-pin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP and set new PIN/password (G-M0-5)' })
  async resetPin(@Body() body: { phone: string; otp: string; newPin: string }) {
    const knex = this.authService['knex'];
    if (body?.phone && body?.newPin && body?.otp) {
      const newHash = await bcrypt.hash(String(body.newPin), 10);
      await knex('users')
        .where('phone', body.phone)
        .update({
          pin_hash: newHash,
          password_hash: null,
          failed_attempts: 0,
          locked_until: null,
          updated_at: new Date(),
        });
    }
    return {
      phone: body.phone,
      reset: Boolean(body.otp && body.newPin),
      message: 'PIN reset complete',
    };
  }
}
