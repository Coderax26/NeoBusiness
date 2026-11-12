import { Module, Global, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database.module.js';
import { AuthModule } from './auth.module.js';
import { ConfigService } from './config.service.js';
import { MigrationService } from './migration.service.js';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { AdminService } from './admin.service.js';
import { AdminController } from './admin.controller.js';
import { AuditController } from './audit.controller.js';
import { NotificationsController } from './notifications.controller.js';
import { SearchController } from './search.controller.js';
import { AttachmentsController } from './attachments.controller.js';
import { EventsController } from './events.controller.js';
import { PermissionService, RbacGuard } from './rbac.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { DocNumberService } from './doc-number.service.js';
import { PdfGeneratorService } from '../../shared/services/pdf-generator.service.js';
import { AuditInterceptor } from '../../shared/interceptors/audit.interceptor.js';
import { RlsContextMiddleware } from '../../shared/middleware/rls-context.middleware.js';
import { IdempotencyMiddleware } from '../../shared/middleware/idempotency.middleware.js';
import { OutboxService } from '../../shared/events/outbox.service.js';
import { OutboxRelay } from '../../shared/events/outbox-relay.service.js';
import { ObservabilityService } from '../../shared/observability/observability.service.js';
import { CorrelationMiddleware } from '../../shared/observability/correlation.middleware.js';
import { PilotReconciliationService } from '../../shared/observability/pilot-reconciliation.service.js';

@Global()
@Module({
  imports: [ConfigModule, DatabaseModule, AuthModule],
  providers: [
    ConfigService,
    MigrationService,
    AuthService,
    AdminService,
    PermissionService,
    RbacGuard,
    JwtAuthGuard,
    DocNumberService,
    PdfGeneratorService,
    OutboxService,
    OutboxRelay,
    ObservabilityService,
    PilotReconciliationService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
  controllers: [
    AuthController,
    AdminController,
    AuditController,
    NotificationsController,
    SearchController,
    AttachmentsController,
    EventsController,
  ],
  exports: [
    DatabaseModule,
    AuthModule,
    ConfigService,
    MigrationService,
    AuthService,
    AdminService,
    PermissionService,
    RbacGuard,
    JwtAuthGuard,
    DocNumberService,
    PdfGeneratorService,
    OutboxService,
    OutboxRelay,
    ObservabilityService,
    PilotReconciliationService,
  ],
})
export class M0PlatformModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CorrelationMiddleware, RlsContextMiddleware, IdempotencyMiddleware)
      .forRoutes('*');
  }
}
