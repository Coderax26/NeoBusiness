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
          connection: process.env.DATABASE_URL,
          pool: { min: 2, max: 10 },
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
