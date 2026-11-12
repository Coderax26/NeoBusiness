import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { ObservabilityService } from './observability.service.js';

/**
 * P4.4 Correlation & Request Telemetry Middleware
 *
 * Ensures every HTTP request has a stable correlation ID (`X-Request-Id` / `X-Correlation-Id`),
 * echoes it on the response headers, and records request duration & status into ObservabilityService.
 */
@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  constructor(private readonly observability: ObservabilityService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const incomingId =
      (req.headers['x-correlation-id'] as string | undefined) ||
      (req.headers['x-request-id'] as string | undefined);
    const correlationId = incomingId && /^[a-zA-Z0-9_-]{8,64}$/.test(incomingId)
      ? incomingId
      : randomUUID();

    (req as any).correlationId = correlationId;
    res.setHeader('X-Correlation-Id', correlationId);
    res.setHeader('X-Request-Id', correlationId);

    const startNs = process.hrtime.bigint();

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startNs) / 1_000_000;
      const user = (req as any).user;
      this.observability.recordHttpRequest({
        correlationId,
        method: req.method,
        path: req.originalUrl ?? req.url,
        statusCode: res.statusCode,
        durationMs,
        userId: user?.sub,
        role: user?.role,
      });
    });

    next();
  }
}

