export interface RedisConnectionConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Resolves BullMQ/IORedis connection parameters from `REDIS_URL` (or `REDIS_HOST` / `REDIS_PORT`).
 * Avoids hardcoded `localhost:6379` in containerized/Coolify deployments.
 */
export function getRedisConnection(): RedisConnectionConfig {
  const redisUrl = process.env.REDIS_URL?.trim();
  const configuredHost = process.env.REDIS_HOST?.trim();

  if (redisUrl && !redisUrl.includes('${')) {
    try {
      const parsed = new URL(redisUrl);
      const dbPath = parsed.pathname?.replace('/', '');
      const parsedHost = parsed.hostname || 'localhost';
      const hasContainerHost =
        configuredHost !== undefined &&
        configuredHost.length > 0 &&
        !LOCAL_HOSTS.has(configuredHost.toLowerCase());
      const host =
        hasContainerHost && LOCAL_HOSTS.has(parsedHost.toLowerCase())
          ? configuredHost
          : parsedHost;

      return {
        host,
        port: Number(parsed.port || 6379),
        ...(parsed.username
          ? { username: decodeURIComponent(parsed.username) }
          : {}),
        ...(parsed.password
          ? { password: decodeURIComponent(parsed.password) }
          : {}),
        ...(dbPath && !Number.isNaN(Number(dbPath))
          ? { db: Number(dbPath) }
          : {}),
      };
    } catch {
      // Fall through to host/port env variables
    }
  }
  return {
    host: configuredHost || 'localhost',
    port: Number(process.env.REDIS_PORT || 6379),
    ...(process.env.REDIS_PASSWORD
      ? { password: process.env.REDIS_PASSWORD }
      : {}),
  };
}
