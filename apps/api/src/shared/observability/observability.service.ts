import { Injectable, Logger } from '@nestjs/common';

/**
 * P4.4 Observability & Telemetry Service
 *
 * Collects rolling API latency percentiles (p50/p95/p99), error rates,
 * queue/notification failure counters, MV freshness timestamps, and emits
 * structured JSON logs with correlation IDs.
 */

export interface StructuredLogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  correlationId: string;
  event: string;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  userId?: string;
  role?: string;
  error?: string;
}

export interface TelemetrySnapshot {
  requestsTotal: number;
  errorsTotal: number;
  errorRatePct: number;
  latencyMs: {
    p50: number;
    p95: number;
    p99: number;
    max: number;
  };
  queueDepth: number;
  deadLetterCount: number;
  failedNotificationsCount: number;
  lastMvRefreshIso: string | null;
  mvFreshnessSeconds: number | null;
}

@Injectable()
export class ObservabilityService {
  private readonly logger = new Logger('Observability');
  private readonly maxSamples = 1000;
  private readonly latencySamples: number[] = [];
  private requestsTotal = 0;
  private errorsTotal = 0;
  private queueDepth = 0;
  private deadLetterCount = 0;
  private failedNotificationsCount = 0;
  private lastMvRefreshMs: number | null = Date.now();
  private readonly recentStructuredLogs: StructuredLogEntry[] = [];

  recordHttpRequest(input: {
    correlationId: string;
    method: string;
    path: string;
    statusCode: number;
    durationMs: number;
    userId?: string;
    role?: string;
  }): StructuredLogEntry {
    this.requestsTotal += 1;
    if (input.statusCode >= 500) {
      this.errorsTotal += 1;
    }

    this.latencySamples.push(input.durationMs);
    if (this.latencySamples.length > this.maxSamples) {
      this.latencySamples.shift();
    }

    const entry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level: input.statusCode >= 500 ? 'error' : input.statusCode >= 400 ? 'warn' : 'info',
      correlationId: input.correlationId,
      event: 'http_request',
      method: input.method,
      path: input.path,
      statusCode: input.statusCode,
      durationMs: Number(input.durationMs.toFixed(2)),
      userId: input.userId,
      role: input.role,
    };

    this.recentStructuredLogs.push(entry);
    if (this.recentStructuredLogs.length > 200) {
      this.recentStructuredLogs.shift();
    }

    if (process.env.LOG_FORMAT === 'json' || process.env.NODE_ENV === 'production') {
      this.logger.log(JSON.stringify(entry));
    }

    return entry;
  }

  recordQueueMetrics(queueDepth: number, deadLetterCount: number): void {
    this.queueDepth = queueDepth;
    this.deadLetterCount = deadLetterCount;
  }

  recordNotificationFailure(): void {
    this.failedNotificationsCount += 1;
  }

  recordMvRefresh(atMs = Date.now()): void {
    this.lastMvRefreshMs = atMs;
  }

  getSnapshot(nowMs = Date.now()): TelemetrySnapshot {
    const sorted = [...this.latencySamples].sort((a, b) => a - b);
    const percentile = (p: number) => {
      if (sorted.length === 0) return 0;
      const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
      return Number(sorted[idx].toFixed(2));
    };

    return {
      requestsTotal: this.requestsTotal,
      errorsTotal: this.errorsTotal,
      errorRatePct:
        this.requestsTotal > 0
          ? Number(((this.errorsTotal / this.requestsTotal) * 100).toFixed(2))
          : 0,
      latencyMs: {
        p50: percentile(50),
        p95: percentile(95),
        p99: percentile(99),
        max: sorted.length > 0 ? Number(sorted[sorted.length - 1].toFixed(2)) : 0,
      },
      queueDepth: this.queueDepth,
      deadLetterCount: this.deadLetterCount,
      failedNotificationsCount: this.failedNotificationsCount,
      lastMvRefreshIso: this.lastMvRefreshMs
        ? new Date(this.lastMvRefreshMs).toISOString()
        : null,
      mvFreshnessSeconds: this.lastMvRefreshMs
        ? Math.max(0, Math.round((nowMs - this.lastMvRefreshMs) / 1000))
        : null,
    };
  }

  getRecentLogs(): StructuredLogEntry[] {
    return [...this.recentStructuredLogs];
  }

  toPrometheusText(): string {
    const snap = this.getSnapshot();
    return [
      '# HELP neobus_http_requests_total Total HTTP requests handled',
      '# TYPE neobus_http_requests_total counter',
      `neobus_http_requests_total ${snap.requestsTotal}`,
      '# HELP neobus_http_errors_total Total HTTP 5xx errors',
      '# TYPE neobus_http_errors_total counter',
      `neobus_http_errors_total ${snap.errorsTotal}`,
      '# HELP neobus_http_request_duration_ms_p95 95th percentile HTTP request duration in ms',
      '# TYPE neobus_http_request_duration_ms_p95 gauge',
      `neobus_http_request_duration_ms_p95 ${snap.latencyMs.p95}`,
      '# HELP neobus_queue_depth Current background job queue depth',
      '# TYPE neobus_queue_depth gauge',
      `neobus_queue_depth ${snap.queueDepth}`,
      '# HELP neobus_dead_letter_jobs Dead letter queue count',
      '# TYPE neobus_dead_letter_jobs gauge',
      `neobus_dead_letter_jobs ${snap.deadLetterCount}`,
      '# HELP neobus_mv_freshness_seconds Seconds since last materialized view refresh',
      '# TYPE neobus_mv_freshness_seconds gauge',
      `neobus_mv_freshness_seconds ${snap.mvFreshnessSeconds ?? -1}`,
    ].join('\n');
  }
}

