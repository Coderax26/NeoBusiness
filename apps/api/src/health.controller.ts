import { Controller, Get, Header, Optional } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import { ObservabilityService } from './shared/observability/observability.service.js';

/**
 * Health & Metrics endpoints (P4.4 Observability + P4.5 Deployment Hardening)
 *
 * - GET /health       — Liveness + PostgreSQL database connectivity + pool metrics
 * - GET /health/ready — Deep readiness probe
 * - GET /metrics      — Prometheus OpenMetrics text exposition
 * - GET /metrics/json — JSON telemetry snapshot (latency p50/p95/p99, error rate, MV freshness)
 */
@ApiTags('health')
@Controller()
export class HealthController {
  constructor(
    @Optional() @InjectKnex() private readonly knex?: Knex,
    @Optional() private readonly observability?: ObservabilityService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'System health and database readiness check' })
  @ApiResponse({
    status: 200,
    description: 'All systems operational',
  })
  async check(): Promise<Record<string, unknown>> {
    let dbStatus = 'not_configured';
    let poolStats: Record<string, unknown> | undefined;

    if (this.knex) {
      try {
        await this.knex.raw('SELECT 1');
        dbStatus = 'connected';
        const pool = (this.knex.client as any)?.pool;
        if (pool) {
          poolStats = {
            used: typeof pool.numUsed === 'function' ? pool.numUsed() : undefined,
            free: typeof pool.numFree === 'function' ? pool.numFree() : undefined,
            pendingAcquires:
              typeof pool.numPendingAcquires === 'function'
                ? pool.numPendingAcquires()
                : undefined,
          };
        }
      } catch (err: any) {
        dbStatus = `error: ${err?.message ?? 'unknown'}`;
      }
    }

    return {
      status: dbStatus === 'error' ? 'degraded' : 'ok',
      database: dbStatus,
      pool: poolStats,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '0.7.0',
      environment: process.env.NODE_ENV ?? 'development',
      uptime: process.uptime(),
    };
  }

  @Get('health/ready')
  @ApiOperation({ summary: 'Deep readiness probe' })
  async ready(): Promise<Record<string, unknown>> {
    return this.check();
  }

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @ApiOperation({ summary: 'Prometheus text format metrics' })
  prometheusMetrics(): string {
    return (
      this.observability?.toPrometheusText() ??
      '# NeoBus observability service not initialized\n'
    );
  }

  @Get('metrics/json')
  @ApiOperation({ summary: 'Structured JSON telemetry & latency percentiles' })
  jsonMetrics() {
    return this.observability?.getSnapshot() ?? { status: 'unavailable' };
  }
}
