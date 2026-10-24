import { Module, Global, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database.module.js';
import { AuthModule } from './auth.module.js';
import { ConfigService } from './config.service.js';
import { MigrationService } from './migration.service.js';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { PermissionService, RbacGuard } from './rbac.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { DocNumberService } from './doc-number.service.js';
import { AuditInterceptor } from '../../shared/interceptors/audit.interceptor.js';
import { RlsContextMiddleware } from '../../shared/middleware/rls-context.middleware.js';
import { IdempotencyMiddleware } from '../../shared/middleware/idempotency.middleware.js';
import { OutboxService } from '../../shared/events/outbox.service.js';
import { OutboxRelay } from '../../shared/events/outbox-relay.service.js';

@Global()
@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AuthModule,
  ],
  providers: [
    ConfigService,
    MigrationService,
    AuthService,
    PermissionService,
    RbacGuard,
    JwtAuthGuard,
    DocNumberService,
    OutboxService,
    OutboxRelay,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
  controllers: [AuthController],
  exports: [
    DatabaseModule,
    AuthModule,
    ConfigService,
    MigrationService,
    AuthService,
    PermissionService,
    RbacGuard,
    JwtAuthGuard,
    DocNumberService,
    OutboxService,
    OutboxRelay,
  ],
})
export class M0PlatformModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RlsContextMiddleware, IdempotencyMiddleware)
      .forRoutes('*');
  }
}