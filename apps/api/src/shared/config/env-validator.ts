/**
 * P4.5 Environment Configuration Validator
 *
 * Enforces strict secret, database, and CORS validation before accepting traffic
 * in staging/production environments.
 */

export interface EnvValidationResult {
  valid: boolean;
  environment: string;
  errors: string[];
  warnings: string[];
}

const WEAK_EXACT_SECRETS = new Set([
  'secret',
  'default',
  '123456',
  'password',
  'changeme',
]);

const WEAK_PLACEHOLDER_SUBSTRINGS = [
  'change_in_production',
  'dev_jwt_secret',
  'test-jwt-secret',
  'test-refresh-secret',
  'replace_with_',
];

function isWeakSecret(value: string): boolean {
  const lower = value.trim().toLowerCase();
  return (
    WEAK_EXACT_SECRETS.has(lower) ||
    WEAK_PLACEHOLDER_SUBSTRINGS.some((p) => lower.includes(p))
  );
}

export function validateEnvironmentConfig(
  env: Record<string, string | undefined> = process.env,
): EnvValidationResult {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!env.DATABASE_URL) {
    errors.push('DATABASE_URL is required');
  }

  const jwtSecret = env.JWT_SECRET ?? '';
  const jwtRefreshSecret = env.JWT_REFRESH_SECRET ?? '';

  if (nodeEnv === 'production') {
    for (const [label, secret] of [
      ['JWT_SECRET', jwtSecret],
      ['JWT_REFRESH_SECRET', jwtRefreshSecret],
    ] as const) {
      if (secret.length < 32) {
        errors.push(`${label} must be at least 32 characters in production`);
      }
      if (isWeakSecret(secret)) {
        errors.push(`${label} uses an insecure development/default placeholder`);
      }
    }

    if (jwtSecret && jwtSecret === jwtRefreshSecret) {
      errors.push('JWT_SECRET and JWT_REFRESH_SECRET must be distinct');
    }

    if (!env.ALLOWED_ORIGINS || env.ALLOWED_ORIGINS.trim() === '*') {
      errors.push('ALLOWED_ORIGINS must specify explicit origins (not *) in production');
    }

    if (!env.REDIS_URL) {
      errors.push('REDIS_URL is required in production');
    }
  } else {
    if (!jwtSecret) {
      warnings.push('JWT_SECRET is unset in non-production environment');
    }
    if (!env.ALLOWED_ORIGINS) {
      warnings.push('ALLOWED_ORIGINS is unset (CORS defaults to *) in dev');
    }
  }

  return {
    valid: errors.length === 0,
    environment: nodeEnv,
    errors,
    warnings,
  };
}

