import { Controller, Post, Body, HttpCode, HttpStatus, Get, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
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
  @ApiResponse({ status: 200, description: 'Login successful', schema: { example: { user: { id: 'uuid', phone: '+91...', role: 'OWNER' }, accessToken: 'eyJ...', refreshToken: 'eyJ...' } } })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() body: { phone: string; password: string },
  ): Promise<{ user: any; accessToken: string; refreshToken: string }> {
    const result = await this.authService.validateUser(body.phone, body.password);
    if (!result) {
      throw new Error('Invalid credentials');
    }
    return result;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  async refresh(
    @Body() body: { refreshToken: string },
  ): Promise<{ accessToken: string; refreshToken: string } | null> {
    const result = await this.authService.refreshAccessToken(body.refreshToken);
    if (!result) {
      throw new Error('Invalid or expired refresh token');
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
      throw new Error('User not found');
    }
    const { password_hash, pin_hash, ...safeUser } = fullUser;
    return safeUser;
  }
}