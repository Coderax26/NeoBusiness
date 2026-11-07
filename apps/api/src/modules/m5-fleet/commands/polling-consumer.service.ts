import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '../../m0-platform/config.service.js';
import {
  EnqueuedCommandRepository,
  EnqueuedCommand,
} from './enqueued-command.repository.js';
import { FleetService } from '../fleet.service.js';

@Injectable()
export class PollingConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PollingConsumerService.name);
  private interval: NodeJS.Timeout | undefined;
  private isProcessing = false;

  constructor(
    private readonly commandRepo: EnqueuedCommandRepository,
    private readonly fleetService: FleetService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    // Only start polling if enabled via config (disabled by default for production)
    const enabled = process.env.M5_POLLING_CONSUMER_ENABLED === 'true';
    if (!enabled) {
      this.logger.log(
        'PollingConsumerService: DISABLED (set M5_POLLING_CONSUMER_ENABLED=true to enable)',
      );
      return;
    }

    const intervalMs = Number(process.env.M5_POLLING_INTERVAL_MS ?? '30000'); // Default 30s
    this.logger.log(
      `PollingConsumerService started (interval: ${intervalMs}ms)`,
    );

    this.interval = setInterval(() => {
      this.processQueue().catch((err) => {
        this.logger.error(`Polling consumer error: ${err.message}`);
      });
    }, intervalMs);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
    }
    // Wait for any in-flight processing to complete
    while (this.isProcessing) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  async processQueue(): Promise<void> {
    if (this.isProcessing) {
      this.logger.debug('Polling consumer: already processing, skipping');
      return;
    }

    this.isProcessing = true;
    try {
      // Get all drivers with pending commands
      const drivers = await this.getDriversWithPendingCommands();

      for (const driverId of drivers) {
        await this.processDriverQueue(driverId);
      }

      // Mark expired commands
      const expiredCount = await this.commandRepo.markExpired();
      if (expiredCount > 0) {
        this.logger.log(`Marked ${expiredCount} commands as EXPIRED`);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async getDriversWithPendingCommands(): Promise<string[]> {
    // This would typically come from a driver registry or by scanning the queue
    // For now, we get distinct driver_ids from pending commands
    const knex = this.commandRepo['knex'] as any;
    const rows = await knex('delivery_command_queue')
      .whereIn('status', ['PENDING', 'PROCESSING'])
      .where('expires_at', '>', new Date())
      .distinct('driver_id')
      .pluck('driver_id');
    return rows.map((r: string) => r);
  }

  private async processDriverQueue(driverId: string): Promise<void> {
    const commands = await this.commandRepo.dequeue(driverId, 10);

    for (const command of commands) {
      await this.processCommand(command);
    }
  }

  private async processCommand(command: EnqueuedCommand): Promise<void> {
    const attemptNo = command.attemptNo + 1;

    try {
      this.logger.debug(
        `Processing command ${command.id} (${command.commandType}) for driver ${command.driverId}, attempt ${attemptNo}`,
      );

      let result: Record<string, unknown> = {};

      switch (command.commandType) {
        case 'DELIVERY': {
          // Handle delivery command from offline queue
          // Payload: { stopId, lines, epodMethod, epodPhotoUrl, epodSignatureUrl, epodOtpVerified, capturedAt, gpsLat, gpsLng, codCollectedAmount }
          const payload = command.payload as Record<string, unknown>;
          const idempotencyKey =
            command.idempotencyKey ?? `queue-${command.id}`;

          await this.fleetService.deliverStop(
            String(payload.stopId),
            {
              epodMethod: payload.epodMethod as any,
              epodPhotoUrl: payload.epodPhotoUrl as string,
              epodSignatureUrl: payload.epodSignatureUrl as string,
              epodOtpVerified: payload.epodOtpVerified as boolean,
              capturedAt: String(payload.capturedAt),
              gpsLat: Number(payload.gpsLat),
              gpsLng: Number(payload.gpsLng),
              lines: (payload.lines as any[]).map((l) => ({
                itemId: l.itemId,
                deliveredQty: l.deliveredQty,
                returnedQty: l.returnedQty,
                batchId: l.batchId,
                damaged: l.damaged,
                returnReason: l.returnReason,
              })),
              codCollectedAmount: payload.codCollectedAmount as number,
            },
            command.driverId,
            idempotencyKey,
          );
          result = { success: true };
          break;
        }

        case 'DENIAL': {
          // Handle failed stop (denial)
          const payload = command.payload as Record<string, unknown>;
          await this.fleetService.failStop(
            String(payload.stopId),
            {
              reasonCode: payload.reasonCode as string,
              notes: payload.notes as string,
            },
            command.driverId,
          );
          result = { success: true };
          break;
        }

        case 'COD': {
          // Handle COD collection update
          // This would typically be part of delivery command
          result = { success: true, note: 'COD handled in DELIVERY command' };
          break;
        }

        case 'RETURNED': {
          // Handle returned goods
          // This is typically part of DELIVERY command with returnedQty > 0
          result = {
            success: true,
            note: 'RETURNED handled in DELIVERY command',
          };
          break;
        }

        case 'EXPENSE': {
          // Handle trip expense
          const payload = command.payload as Record<string, unknown>;
          await this.fleetService.createExpense(
            String(payload.tripId),
            {
              type: payload.type as any,
              amount: Number(payload.amount),
              receiptAttachmentId: payload.receiptAttachmentId as string,
            },
            command.driverId,
          );
          result = { success: true };
          break;
        }

        case 'ISSUE': {
          // Handle issue report
          const payload = command.payload as Record<string, unknown>;
          await this.fleetService.createIssue(
            String(payload.tripId),
            {
              stopId: payload.stopId as string,
              category: payload.category as any,
              rejectedQty: payload.rejectedQty as number,
              valueAtRisk: Number(payload.valueAtRisk),
              photoAttachmentId: payload.photoAttachmentId as string,
            },
            command.driverId,
          );
          result = { success: true };
          break;
        }

        default:
          throw new Error(`Unknown command type: ${command.commandType}`);
      }

      await this.commandRepo.complete(command.id, result);
      this.logger.log(`Command ${command.id} completed successfully`);
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Command ${command.id} failed: ${error.message}`);

      if (attemptNo >= command.maxAttempts) {
        await this.commandRepo.fail(command.id, error.message, attemptNo);
        this.logger.warn(
          `Command ${command.id} marked FAILED after ${attemptNo} attempts`,
        );
      } else {
        // Will be retried on next poll (status reset to PENDING in fail())
        await this.commandRepo.fail(command.id, error.message, attemptNo);
        this.logger.warn(
          `Command ${command.id} will be retried (attempt ${attemptNo}/${command.maxAttempts})`,
        );
      }
    }
  }

  // Public method to manually trigger queue processing (for testing)
  async triggerProcess(): Promise<void> {
    await this.processQueue();
  }
}
