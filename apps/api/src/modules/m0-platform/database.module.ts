import { Module, Global } from '@nestjs/common';
import { KnexModule } from 'nestjs-knex';

@Global()
@Module({
  imports: [
    KnexModule.forRootAsync({
      imports: [],
      useFactory: () => ({
        config: {
          client: 'pg',
          connection: process.env.DATABASE_URL
            ? {
                connectionString: process.env.DATABASE_URL,
                keepAlive: true,
                keepAliveInitialDelayMillis: 10_000,
                connectionTimeoutMillis: 10_000,
              }
            : undefined,
          pool: {
            min: Number(process.env.DB_POOL_MIN ?? 2),
            max: Number(process.env.DB_POOL_MAX ?? 25),
            acquireTimeoutMillis: 30_000,
            idleTimeoutMillis: 30_000,
            reapIntervalMillis: 1_000,
          },
          migrations: {
            directory: './db/migrations',
            tableName: 'knex_migrations',
            loadExtensions: ['.sql'],
          },
        },
      }),
    }),
  ],
  exports: [KnexModule],
})
export class DatabaseModule {}
