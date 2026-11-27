import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { Knex } from 'knex';
import { InjectKnex } from 'nestjs-knex';

export interface JwtPayload {
  sub: string; // user ID
  phone: string;
  role: string;
  siteIds: string[];
  iat?: number;
  exp?: number;
}

export interface RefreshPayload {
  sub: string;
  tokenId: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectKnex() private readonly knex: Knex,
    private readonly jwtService: JwtService,
  ) { }

  /**
   * Validate user credentials (phone + password/PIN).
   */
  async validateUser(
    phone: string,
    password: string,
  ): Promise<{ user: any; accessToken: string; refreshToken: string } | null> {
    if (!phone || !password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const EMAIL_TO_PHONE_ALIAS: Record<string, string> = {
      'owner@neobus.in': '+919876543210',
      'ops@neobus.in': '+919876543211',
      'prod@neobus.in': '+919876543212',
      'driver@neobus.in': '+919876543213',
      'collector@neobus.in': '+919876543214',
      'store@neobus.in': '+919876543215',
    };

    const trimmed = phone.trim().toLowerCase();
    const mappedPhone =
      EMAIL_TO_PHONE_ALIAS[trimmed] ??
      (/^\d{10}$/.test(trimmed) ? `+91${trimmed}` : phone.trim());

    const user = await this.knex('users')
      .where((qb) => {
        qb.where('phone', mappedPhone).orWhere('phone', phone.trim());
      })
      .andWhere('is_active', true)
      .first();

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordHash = user.password_hash || user.pin_hash;
    if (!passwordHash) {
      throw new UnauthorizedException('User has no password/PIN set');
    }

    const isValid = await bcrypt.compare(password, passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last login
    await this.knex('users')
      .where('id', user.id)
      .update({ last_login_at: new Date() });

    // Get user's site access
    const siteAccess = await this.knex('user_site_access')
      .where('user_id', user.id)
      .pluck('site_id');

    const siteIds: string[] = [
      ...new Set<string>([user.assigned_site_id, ...siteAccess].filter(Boolean)),
    ];

    const tokens = await this.generateTokens(user, siteIds);
    return { user, ...tokens };
  }

  /**
   * Generate access and refresh tokens.
   */
  async generateTokens(
    user: any,
    siteIds: string[],
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const payload: JwtPayload = {
      sub: user.id,
      phone: user.phone,
      role: user.role,
      siteIds,
    };

    const accessToken = this.jwtService.sign(payload);

    // Create refresh token in DB
    const refreshToken = await this.createRefreshToken(user.id);

    return { accessToken, refreshToken };
  }

  /**
   * Create and store a refresh token.
   */
  private async createRefreshToken(
    userId: string,
    deviceId?: string,
  ): Promise<string> {
    const crypto = await import('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(token, 10);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await this.knex('refresh_tokens').insert({
      user_id: userId,
      token_hash: tokenHash,
      device_id: deviceId,
      expires_at: expiresAt,
    });

    return token;
  }

  /**
   * Verify and rotate refresh token.
   */
  async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string } | null> {
    const allTokens = await this.knex('refresh_tokens')
      .where('revoked_at', null)
      .andWhere('expires_at', '>', new Date());

    let matchedToken = null;
    for (const t of allTokens) {
      if (await bcrypt.compare(refreshToken, t.token_hash)) {
        matchedToken = t;
        break;
      }
    }

    if (!matchedToken) {
      return null;
    }

    // Revoke old token
    await this.knex('refresh_tokens')
      .where('id', matchedToken.id)
      .update({ revoked_at: new Date() });

    // Get user
    const user = await this.knex('users')
      .where('id', matchedToken.user_id)
      .first();
    if (!user || !user.is_active) {
      return null;
    }

    // Get site access
    const siteAccess = await this.knex('user_site_access')
      .where('user_id', user.id)
      .pluck('site_id');
    const siteIds: string[] = [
      ...new Set<string>([user.assigned_site_id, ...siteAccess].filter(Boolean)),
    ];

    // Generate new tokens
    const tokens = await this.generateTokens(user, siteIds);
    return tokens;
  }

  /**
   * Revoke a refresh token (logout).
   */
  async revokeRefreshToken(refreshToken: string): Promise<void> {
    const allTokens = await this.knex('refresh_tokens').where(
      'revoked_at',
      null,
    );

    for (const t of allTokens) {
      if (await bcrypt.compare(refreshToken, t.token_hash)) {
        await this.knex('refresh_tokens')
          .where('id', t.id)
          .update({ revoked_at: new Date() });
        break;
      }
    }
  }

  /**
   * Verify JWT token and return payload.
   */
  async verifyToken(token: string): Promise<JwtPayload | null> {
    try {
      return this.jwtService.verify<JwtPayload>(token, {
        secret: process.env.JWT_SECRET,
      });
    } catch {
      return null;
    }
  }

  /**
   * Get user by ID with site access.
   */
  async getUserWithSites(userId: string): Promise<any> {
    const user = await this.knex('users')
      .where('id', userId)
      .andWhere('is_active', true)
      .first();

    if (!user) return null;

    const siteAccess = await this.knex('user_site_access')
      .where('user_id', user.id)
      .pluck('site_id');

    const siteIds: string[] = [
      ...new Set<string>([user.assigned_site_id, ...siteAccess].filter(Boolean)),
    ];

    // Gap I-2: expose sites (id, name, type) — OWNER sees every active site
    const siteQuery = this.knex('sites').where('is_active', true);
    if (user.role !== 'OWNER') siteQuery.whereIn('id', siteIds);
    const siteRows: any[] = await siteQuery.select('id', 'name', 'site_type');
    const sites = siteRows.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.site_type,
    }));

    return {
      ...user,
      name: user.full_name,
      siteIds,
      sites,
      preferredLanguage: user.preferred_language ?? 'en',
      permissions: await this.getPermissionCodes(user.role),
    };
  }

  /**
   * Gap I-1/I-2: permission list comes from role_permissions (single source of
   * truth). OWNER holds every permission ('*') — mirrors RbacGuard behaviour.
   */
  async getPermissionCodes(role: string): Promise<string[]> {
    if (role === 'OWNER') return ['*'];
    const rows: Array<{ permission_code: string }> = await this.knex(
      'role_permissions',
    )
      .where('role', role)
      .select('permission_code');
    return rows.map((r) => r.permission_code).sort();
  }
}
