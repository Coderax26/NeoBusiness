export interface ApiResponseEnvelope<T> {
  data: T;
  meta?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function wrapResponse<T>(
  data: T,
  meta?: Record<string, unknown>,
): ApiResponseEnvelope<T> {
  return meta !== undefined ? { data, meta } : { data };
}

