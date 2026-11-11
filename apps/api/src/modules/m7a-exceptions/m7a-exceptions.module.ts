import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../m0-platform/database.module.js';
import { AuthModule } from '../m0-platform/auth.module.js';
import { OutboxService } from '../../shared/events/outbox.service.js';
import {
  EXCEPTION_PORT,
  NOTIFY_PORT,
} from '../../shared/ports/ports.interface.js';
import { ExceptionService } from './exception.service.js';
import { NotificationService } from './notification.service.js';
import { ExceptionController } from './exception.controller.js';
import { DeviceController } from './device.controller.js';

/**
 * M7a — Exception Engine + Notification Hub.
 *
 * Replaces the ExceptionPort and NotifyPort stubs with real
 * implementations, and exposes the owner-facing exception API.
 *
 * @Global() so every module can inject ExceptionService /
 * NotificationService directly without importing this module.
 */
@Global()
@Module({
  imports: [ConfigModule, DatabaseModule, AuthModule],
  providers: [
    ExceptionService,
    NotificationService,
    // Wire the real implementations as the global port tokens,
    // replacing the stubs that were used during M0/M1 prototyping.
    {
      provide: EXCEPTION_PORT,
      useExisting: ExceptionService,
    },
    {
      provide: NOTIFY_PORT,
      useExisting: NotificationService,
    },
    OutboxService,
  ],
  controllers: [ExceptionController, DeviceController],
  exports: [
    ExceptionService,
    NotificationService,
    OutboxService,
    EXCEPTION_PORT,
    NOTIFY_PORT,
  ],
})
export class M7aExceptionsModule {}
