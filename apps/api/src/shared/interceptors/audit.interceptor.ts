import { Injectable, NestInterceptor, ExecutionContext, Logger } from '@nestjs/common';
import type { CallHandler } from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';

/**
 * AuditInterceptor — writes an immutable_audit_logs row for every
 * successful mutating request (POST / PUT / PATCH / DELETE).
 *
 * The row records:
 *   user_id   — from the authenticated JWT payload
 *   action    — HTTP method + route path (e.g. 'POST /api/v1/orders')
 *   entity_name — derived from the route path (last path segment, singularised)
 *   entity_id — from the response body `id` field if present
 *   old_value_json — null (we do not capture old state in MVP)
 *   new_value_json — the response body (sanitised)
 *   ip_address — from X-Forwarded-For / X-Real-IP
 *   timestamp — server-side NOW()
 *
 * Failures are swallowed so an audit write can never break a business
 * transaction — but they are logged.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(@InjectKnex() private readonly knex: Knex) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const method = req.method;

    // Only mutating requests
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return next.handle();
    }

    const user = (req as any).user;
    const route = (req as any).route?.path ?? req.originalUrl ?? req.url;
    const entityName = this.deriveEntityName(route);
    const ipAddress = this.resolveIp(req);

    return next.handle().pipe(
      tap({
        next: (response: unknown) => {
          // Fire-and-forget — never block the response
          this.writeAudit(user?.sub, method, route, entityName, response, ipAddress).catch((err) => {
            this.logger.warn(`Audit write failed: ${(err as Error).message}`);
          });
        },
        error: () => {
          // Do not audit failed requests
        },
      }),
    );
  }

  private async writeAudit(
    userId: string | undefined,
    method: string,
    route: string,
    entityName: string,
    response: unknown,
    ipAddress: string | null,
  ): Promise<void> {
    const entityId = this.extractId(response);
    await this.knex('immutable_audit_logs').insert({
      user_id: userId ?? null,
      action: `${method} ${route}`,
      entity_name: entityName,
      entity_id: entityId,
      old_value_json: null,
      new_value_json: this.sanitise(response),
      ip_address: ipAddress,
    });
  }

  private deriveEntityName(route: string): string {
    // e.g. '/api/v1/orders/123' → 'orders'
    const parts = route.split('/').filter(Boolean);
    return parts[parts.length - 1] ?? 'unknown';
  }

  private extractId(response: unknown): string | null {
    if (response && typeof response === 'object') {
      const obj = response as Record<string, unknown>;
      if (typeof obj.id === 'string') return obj.id;
      if (typeof obj.id === 'number') return String(obj.id);
    }
    return null;
  }

  private sanitise(response: unknown): unknown {
    // Strip sensitive fields from the audited payload
    if (!response || typeof response !== 'object') return response;
    const obj = { ...(response as Record<string, unknown>) };
    for (const key of ['password', 'password_hash', 'pin_hash', 'token', 'accessToken', 'refreshToken']) {
      if (key in obj) obj[key] = '[REDACTED]';
    }
    return obj;
  }

  private resolveIp(req: Request): string | null {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
    const realIp = req.headers['x-real-ip'];
    if (typeof realIp === 'string') return realIp;
    return req.ip ?? null;
  }
}