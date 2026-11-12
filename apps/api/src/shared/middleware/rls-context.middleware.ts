import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';

/**
 * RLS context middleware (P4.1 Hardened).
 *
 * Sets PostgreSQL session-level settings using parameterized `set_config`
 * (preventing SQL injection and multi-statement syntax errors) so that
 * Row-Level Security policies enforce site isolation.
 */
@Injectable()
export class RlsContextMiddleware implements NestMiddleware {
  constructor(@InjectKnex() private readonly knex: Knex) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const user = (req as any).user;
    if (!user) {
      // No auth context — public route (health, metrics, login). Skip RLS.
      next();
      return;
    }

    const role = String(user.role ?? '');
    const userId = String(user.sub ?? '');
    const siteIds = await this.resolveSiteIds(userId, role);

    await this.knex.raw(
      `SELECT
        set_config('app.role', ?, true),
        set_config('app.user_id', ?, true),
        set_config('app.site_ids', ?, true)`,
      [role, userId, siteIds.join(',')],
    );

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
}
