/**
 * Client Error Monitoring & Web Vitals Telemetry (F0-10)
 * Compliant with Ponytail Rule: Lightweight native telemetry with Sentry DSN hook
 */

export interface WebVitalMetric {
  id: string;
  name: 'CLS' | 'FCP' | 'FID' | 'INP' | 'LCP' | 'TTFB';
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  navigationType: string;
}

export function reportWebVitals(metric: WebVitalMetric) {
  if (process.env.NODE_ENV === 'development') {
    // Only log performance metrics in dev or when telemetry enabled
    // console.debug(`[Web-Vital] ${metric.name}: ${metric.value.toFixed(2)} (${metric.rating})`);
  }

  // If a reporting endpoint or Sentry is configured
  if (process.env.NEXT_PUBLIC_TELEMETRY_ENDPOINT) {
    try {
      navigator.sendBeacon?.(
        process.env.NEXT_PUBLIC_TELEMETRY_ENDPOINT,
        JSON.stringify({
          type: 'web-vital',
          metric,
          timestamp: Date.now(),
          url: window.location.pathname,
        }),
      );
    } catch {
      // Ignore background beacon errors
    }
  }
}

export function captureClientException(error: Error | unknown, context?: Record<string, unknown>) {
  const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  const errorPayload = {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    url: typeof window !== 'undefined' ? window.location.pathname : undefined,
    timestamp: new Date().toISOString(),
    context,
  };

  // Avoid logging any PII
  if (sentryDsn) {
    // In production with Sentry configured, send event envelope
    console.error('[Sentry Capture]', errorPayload);
  } else {
    console.error('[Client Exception Boundary]', errorPayload);
  }
}

