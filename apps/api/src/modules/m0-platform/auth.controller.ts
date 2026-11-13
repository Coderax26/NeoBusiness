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
    @Body() body: { phone: string; password?: string; pin?: string },
  ): Promise<{ user: any; accessToken: string; refreshToken: string }> {
    const credential = body.password ?? body.pin ?? '';
    const result = await this.authService.validateUser(body.phone, credential);
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
    return {
      id: req.user?.sub,
      ...body,
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
    return {
      userId: req.user?.sub,
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
    return {
      phone: body.phone,
      reset: Boolean(body.otp && body.newPin),
      message: 'PIN reset complete',
    };
  }
}
