export interface RedisConnectionConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
}

/**
 * Resolves BullMQ/IORedis connection parameters from `REDIS_URL` (or `REDIS_HOST` / `REDIS_PORT`).
 * Avoids hardcoded `localhost:6379` in containerized/Coolify deployments.
 */
export function getRedisConnection(): RedisConnectionConfig {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      const parsed = new URL(redisUrl);
      const dbPath = parsed.pathname?.replace('/', '');
      return {
        host: parsed.hostname || 'localhost',
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
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT || 6379),
    ...(process.env.REDIS_PASSWORD
      ? { password: process.env.REDIS_PASSWORD }
      : {}),
  };
}
