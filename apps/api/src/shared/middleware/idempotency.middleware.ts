import {
  Injectable,
  NestMiddleware,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';

/**
 * IdempotencyMiddleware — prevents duplicate writes from offline clients.
 *
 * Clients send an `Idempotency-Key` header on every mutating request.
 * On first arrival the middleware stores the request hash + a placeholder
 * response, then lets the request through. On replay (same key) it returns
 * the stored response immediately — no duplicate record is created.
 *
 * This is a simplified MVP implementation. Production would:
 *   - Store the response body and status code
 *   - Handle in-flight requests (same key arriving while the first is
 *     still being processed) by returning 409 Conflict
 */
@Injectable()
export class IdempotencyMiddleware implements NestMiddleware {
  private readonly logger = new Logger(IdempotencyMiddleware.name);

  constructor(@InjectKnex() private readonly knex: Knex) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const method = req.method;
    if (!['POST', 'PUT', 'PATCH'].includes(method)) {
      next();
      return;
    }

    const key = req.headers['idempotency-key'] as string | undefined;
    if (!key) {
      next();
      return;
    }

    // Validate format: UUID or short client-generated key
    if (!/^[0-9a-zA-Z-]{8,64}$/.test(key)) {
      throw new BadRequestException('Invalid Idempotency-Key format');
    }

    const endpoint = req.originalUrl ?? req.url;
    const requestHash = this.hashRequest(req);

    // Check for an existing record
    const existing = await this.knex('idempotency_keys')
      .where('key', key)
      .first();

    if (existing) {
      if (existing.request_hash !== requestHash) {
        throw new BadRequestException(
          'Idempotency-Key already used with a different request body',
        );
      }
      // Replay: return the stored response
      const stored = existing.response_json as {
        status?: number;
        body?: unknown;
      } | null;
      res.status(stored?.status ?? 200).json(stored?.body ?? { ok: true });
      return;
    }

    // Record the key before processing so concurrent replays see it
    const user = (req as any).user;
    await this.knex('idempotency_keys').insert({
      key,
      user_id: user?.sub ?? null,
      endpoint,
      request_hash: requestHash,
      response_json: null,
    });

    // Intercept the response to store it
    const originalJson = res.json.bind(res);
    const originalStatus = res.status.bind(res);
    let statusCode = 200;
    let responseBody: unknown = undefined;

    res.status = (code: number): Response => {
      statusCode = code;
      return originalStatus(code);
    };

    res.json = (body: unknown): Response => {
      responseBody = body;
      return originalJson(body);
    };

    res.on('finish', () => {
      this.knex('idempotency_keys')
        .where('key', key)
        .update({ response_json: { status: statusCode, body: responseBody } })
        .catch((err) =>
          this.logger.warn(
            `Failed to store idempotency response: ${(err as Error).message}`,
          ),
        );
    });

    next();
  }

  private hashRequest(req: Request): string {
    const body = req.body ? JSON.stringify(req.body) : '';
    const url = req.originalUrl ?? req.url;
    const method = req.method;
    // Simple deterministic hash — crypto.createHash would be stronger
    let hash = 0;
    const str = `${method}|${url}|${body}`;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // Convert to 32bit integer
    }
    return hash.toString(16);
  }
}
