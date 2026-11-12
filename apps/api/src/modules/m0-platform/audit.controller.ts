import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import type { Knex } from 'knex';
import { InjectKnex } from 'nestjs-knex';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RequirePermission } from './rbac.service.js';

@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('audit-logs')
export class AuditController {
  constructor(@InjectKnex() private readonly knex: Knex) {}

  @Get()
  @RequirePermission('audit.view')
  @ApiOperation({ summary: 'List immutable audit logs with optional filters' })
  async listAuditLogs(
    @Query('userId') userId?: string,
    @Query('entityName') entityName?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('limit') limit = '50',
    @Query('offset') offset = '0',
  ) {
    const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const off = Math.max(Number(offset) || 0, 0);

    let baseQuery = this.knex('immutable_audit_logs as a')
      .leftJoin('users as u', 'a.user_id', 'u.id');

    if (userId) {
      baseQuery = baseQuery.where('a.user_id', userId);
    }
    if (entityName) {
      baseQuery = baseQuery.where('a.entity_name', entityName);
    }
    if (dateFrom) {
      baseQuery = baseQuery.where('a.timestamp', '>=', new Date(dateFrom));
    }
    if (dateTo) {
      baseQuery = baseQuery.where('a.timestamp', '<=', new Date(dateTo));
    }

    const countRes = await baseQuery.clone().count<{ count: string }>('* as count').first();
    const total = Number(countRes?.count ?? 0);

    const rows = await baseQuery
      .select(
        'a.id',
        'a.user_id',
        'u.full_name as user_name',
        'a.action',
        'a.entity_name',
        'a.entity_id',
        'a.old_value_json',
        'a.new_value_json',
        'a.ip_address',
        'a.timestamp',
      )
      .orderBy('a.timestamp', 'desc')
      .limit(lim)
      .offset(off);

    return {
      data: rows,
      meta: {
        total,
        limit: lim,
        offset: off,
      },
    };
  }
}

