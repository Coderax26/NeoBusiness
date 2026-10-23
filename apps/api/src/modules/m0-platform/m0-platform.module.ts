import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database.module.js';
import { AuthModule } from './auth.module.js';
import { ConfigService } from './config.service.js';
import { MigrationService } from './migration.service.js';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { PermissionService, RbacGuard } from './rbac.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

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
  ],
})
export class M0PlatformModule {}