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

const WEAK_SECRET_PATTERNS = [
  'change_in_production',
  'dev_jwt_secret',
  'secret',
  'default',
  '123456',
];

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
    if (jwtSecret.length < 32) {
      errors.push('JWT_SECRET must be at least 32 characters in production');
    }
    if (
      WEAK_SECRET_PATTERNS.some((p) =>
        jwtSecret.toLowerCase().includes(p),
      )
    ) {
      errors.push('JWT_SECRET uses an insecure development/default placeholder');
    }

    if (jwtRefreshSecret.length < 32) {
      errors.push('JWT_REFRESH_SECRET must be at least 32 characters in production');
    }
    if (
      WEAK_SECRET_PATTERNS.some((p) =>
        jwtRefreshSecret.toLowerCase().includes(p),
      )
    ) {
      errors.push('JWT_REFRESH_SECRET uses an insecure development/default placeholder');
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

