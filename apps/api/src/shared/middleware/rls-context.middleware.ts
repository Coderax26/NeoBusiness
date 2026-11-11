import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';

/**
 * RLS context middleware.
 *
 * Sets PostgreSQL session-level settings on every request so that
 * Row-Level Security policies defined in migration 001 can enforce
 * site isolation. The settings are scoped to the current transaction
 * via SET LOCAL (they do not leak across connections in the pool).
 *
 * Settings set:
 *   app.role        — the authenticated user's role (e.g. 'STOREKEEPER')
 *   app.user_id     — the authenticated user's UUID
 *   app.site_ids    — comma-separated list of site UUIDs the user can access
 *
 * The JwtAuthGuard runs before this middleware and attaches the
 * decoded JWT payload to `request.user`.
 */
@Injectable()
export class RlsContextMiddleware implements NestMiddleware {
  constructor(@InjectKnex() private readonly knex: Knex) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const user = (req as any).user;
    if (!user) {
      // No auth context — this is a public route (health, login). Skip RLS.
      next();
      return;
    }

    const role = String(user.role ?? '');
    const userId = String(user.sub ?? '');
    const siteIds = await this.resolveSiteIds(userId, role);

    const settings: string[] = [];
    if (role) settings.push(`app.role = '${this.escape(role)}'`);
    if (userId) settings.push(`app.user_id = '${this.escape(userId)}'`);
    if (siteIds.length > 0) {
      settings.push(`app.site_ids = '${siteIds.join(',')}'`);
    }

    if (settings.length > 0) {
      await this.knex.raw(`SET LOCAL ${settings.join('; ')}`);
    }

    next();
  }

  /**
   * Resolve the set of site IDs the user can access.
   * OWNER sees all sites; everyone else sees their assigned sites.
   */
  private async resolveSiteIds(
    userId: string,
    role: string,
  ): Promise<string[]> {
    if (role === 'OWNER') {
      const rows = await this.knex('sites').select('id');
      return rows.map((r) => String(r.id));
    }

    const rows = await this.knex('user_site_access')
      .where('user_id', userId)
      .select('site_id');
    return rows.map((r) => String(r.site_id));
  }

  private escape(value: string): string {
    return value.replace(/'/g, "''");
  }
}
