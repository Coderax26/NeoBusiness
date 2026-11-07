import { Injectable } from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';

export interface EnqueuedCommand {
  id: string;
  driverId: string;
  siteId: string;
  commandType: 'DELIVERY' | 'DENIAL' | 'COD' | 'RETURNED' | 'EXPENSE' | 'ISSUE';
  payload: Record<string, unknown>;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'EXPIRED';
  priority: number;
  attemptNo: number;
  maxAttempts: number;
  idempotencyKey?: string;
  errorMessage?: string;
  resultJson?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  processedAt?: Date;
}

@Injectable()
export class EnqueuedCommandRepository {
  constructor(@InjectKnex() private readonly knex: Knex) {}

  async enqueue(
    command: Omit<
      EnqueuedCommand,
      'id' | 'createdAt' | 'updatedAt' | 'processedAt'
    >,
  ): Promise<string> {
    const [row] = await this.knex('delivery_command_queue')
      .insert({
        driver_id: command.driverId,
        site_id: command.siteId,
        command_type: command.commandType,
        payload: command.payload,
        status: command.status,
        priority: command.priority,
        attempt_no: command.attemptNo,
        max_attempts: command.maxAttempts,
        idempotency_key: command.idempotencyKey,
        error_message: command.errorMessage,
        result_json: command.resultJson,
        expires_at: command.expiresAt,
      })
      .returning('id');
    return String(row.id);
  }

  async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<EnqueuedCommand | null> {
    const row = await this.knex('delivery_command_queue')
      .where('idempotency_key', idempotencyKey)
      .first('*');
    return row ? this.mapRow(row) : null;
  }

  async dequeue(driverId: string, limit = 10): Promise<EnqueuedCommand[]> {
    const rows = await this.knex('delivery_command_queue')
      .where('driver_id', driverId)
      .where('status', 'PENDING')
      .where('expires_at', '>', new Date())
      .orderBy('priority', 'desc')
      .orderBy('created_at', 'asc')
      .limit(limit)
      .forUpdate()
      .skipLocked()
      .select('*');

    // Mark as PROCESSING
    const ids = rows.map((r) => r.id);
    if (ids.length > 0) {
      await this.knex('delivery_command_queue')
        .whereIn('id', ids)
        .update({ status: 'PROCESSING', updated_at: new Date() });
    }

    return rows.map((r) => this.mapRow(r));
  }

  async complete(
    commandId: string,
    result: Record<string, unknown>,
  ): Promise<void> {
    await this.knex('delivery_command_queue').where('id', commandId).update({
      status: 'COMPLETED',
      result_json: result,
      processed_at: new Date(),
      updated_at: new Date(),
    });
  }

  async fail(
    commandId: string,
    error: string,
    attemptNo: number,
  ): Promise<void> {
    const command = await this.knex('delivery_command_queue')
      .where('id', commandId)
      .first('max_attempts');

    const newStatus =
      attemptNo >= (command?.max_attempts ?? 3) ? 'FAILED' : 'PENDING';

    await this.knex('delivery_command_queue').where('id', commandId).update({
      status: newStatus,
      attempt_no: attemptNo,
      error_message: error,
      updated_at: new Date(),
    });
  }

  async getPendingCommands(driverId: string): Promise<EnqueuedCommand[]> {
    const rows = await this.knex('delivery_command_queue')
      .where('driver_id', driverId)
      .whereIn('status', ['PENDING', 'PROCESSING'])
      .where('expires_at', '>', new Date())
      .orderBy('priority', 'desc')
      .orderBy('created_at', 'asc')
      .select('*');
    return rows.map((r) => this.mapRow(r));
  }

  async markExpired(): Promise<number> {
    const result = await this.knex('delivery_command_queue')
      .where('status', 'PENDING')
      .where('expires_at', '<=', new Date())
      .update({ status: 'EXPIRED', updated_at: new Date() });
    return result;
  }

  async getStaleCommands(olderThanHours = 24): Promise<EnqueuedCommand[]> {
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    const rows = await this.knex('delivery_command_queue')
      .whereIn('status', ['PROCESSING', 'PENDING'])
      .where('updated_at', '<', cutoff)
      .select('*');
    return rows.map((r) => this.mapRow(r));
  }

  private mapRow(row: Record<string, unknown>): EnqueuedCommand {
    return {
      id: String(row.id),
      driverId: String(row.driver_id),
      siteId: String(row.site_id),
      commandType: row.command_type as EnqueuedCommand['commandType'],
      payload: row.payload as Record<string, unknown>,
      status: row.status as EnqueuedCommand['status'],
      priority: Number(row.priority),
      attemptNo: Number(row.attempt_no),
      maxAttempts: Number(row.max_attempts),
      idempotencyKey: row.idempotency_key as string | undefined,
      errorMessage: row.error_message as string | undefined,
      resultJson: row.result_json as Record<string, unknown> | undefined,
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
      expiresAt: row.expires_at as Date,
      processedAt: row.processed_at as Date | undefined,
    };
  }
}
