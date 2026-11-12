import { generateIdempotencyKey, createMutationHeaders } from './idempotency';

export interface ApiEnvelope<T = any> {
  data?: T;
  meta?: {
    total?: number;
    limit?: number;
    offset?: number;
    page?: number;
  };
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface FriendlyApiError {
  status: number;
  code: string;
  userMessage: string;
  fieldErrors?: Record<string, string>;
  isStale?: boolean;
  canRetry?: boolean;
}

/**
 * Maps raw HTTP responses and backend error payloads into human-friendly,
 * non-technical ERP messages (Doc 02 §4).
 */
export function formatApiError(status: number, payload?: any): FriendlyApiError {
  const code = payload?.error?.code || payload?.code || `HTTP_${status}`;
  const rawMessage = payload?.error?.message || payload?.message || '';

  let userMessage = 'Something went wrong. Please try again.';
  let isStale = false;
  let canRetry = true;
  let fieldErrors: Record<string, string> | undefined = undefined;

  switch (status) {
    case 400:
      userMessage = 'Please check the highlighted fields.';
      canRetry = false;
      if (Array.isArray(payload?.message)) {
        fieldErrors = {};
        for (const msg of payload.message) {
          const parts = msg.split(' ');
          const field = parts[0];
          fieldErrors[field] = msg;
        }
      }
      break;

    case 401:
      userMessage = 'Your session ended. Please sign in again.';
      canRetry = false;
      break;

    case 403:
      userMessage = "You don't have permission to do this. Ask the Owner if you need access.";
      canRetry = false;
      break;

    case 404:
      userMessage = 'This record no longer exists or was moved.';
      canRetry = false;
      break;

    case 409:
      userMessage = 'Someone else updated this just now.';
      isStale = true;
      break;

    case 422:
      userMessage = rawMessage || "Action blocked by business policy — approval required.";
      break;

    case 429:
      userMessage = 'Too many attempts. Please wait a minute and try again.';
      break;

    default:
      if (status >= 500) {
        userMessage = "We couldn't reach the server. Your work is saved — try again.";
      }
      break;
  }

  return {
    status,
    code,
    userMessage,
    fieldErrors,
    isStale,
    canRetry,
  };
}

/**
 * Standard typed BFF fetch wrapper.
 * Unwraps { data, meta, error } envelope and auto-attaches Idempotency-Key on mutations.
 */
export async function apiFetch<T = any>(
  endpoint: string,
  options: RequestInit & { idempotencyKey?: string } = {},
): Promise<{ data: T; meta?: ApiEnvelope['meta'] }> {
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(
    (options.method || 'GET').toUpperCase(),
  );

  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  const url = `/api/bff/${cleanEndpoint}`;

  const headers = new Headers(options.headers);
  if (isMutation) {
    const key = options.idempotencyKey || generateIdempotencyKey();
    if (!headers.has('Idempotency-Key')) {
      headers.set('Idempotency-Key', key);
    }
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
  }

  try {
    const res = await fetch(url, {
      ...options,
      headers,
    });

    const json: ApiEnvelope<T> = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw formatApiError(res.status, json);
    }

    // Envelope unwrap
    if (json && typeof json === 'object' && ('data' in json || 'meta' in json)) {
      return {
        data: (json.data ?? json) as T,
        meta: json.meta,
      };
    }

    return { data: json as unknown as T };
  } catch (err: any) {
    if (err && err.status) {
      throw err;
    }
    // Network failure
    throw formatApiError(503, { message: err?.message || 'Network disconnected' });
  }
}
