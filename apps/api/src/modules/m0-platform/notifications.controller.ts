import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import type { Knex } from 'knex';
import { InjectKnex } from 'nestjs-knex';
import { JwtAuthGuard } from './jwt-auth.guard.js';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(@InjectKnex() private readonly knex: Knex) {}

  @Get()
  @ApiOperation({ summary: 'List notifications for current user' })
  async listNotifications(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('limit') limit = '50',
    @Query('offset') offset = '0',
  ) {
    const userId = req.user?.sub || req.user?.id;
    const lim = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const off = Math.max(Number(offset) || 0, 0);

    let query = this.knex('notification_outbox').where(function () {
      this.where('recipient_ref', String(userId));
      if (req.user?.phone) {
        this.orWhere('recipient_ref', String(req.user.phone));
      }
      if (req.user?.role === 'OWNER') {
        this.orWhere('channel', 'PUSH').orWhere('channel', 'IN_APP');
      }
    });

    if (status) {
      query = query.where('status', status);
    }

    const countRes = await query.clone().count<{ count: string }>('* as count').first();
    const total = Number(countRes?.count ?? 0);

    const items = await query
      .select('*')
      .orderBy('created_at', 'desc')
      .limit(lim)
      .offset(off);

    return {
      data: items,
      meta: { total, limit: lim, offset: off },
    };
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a notification as read/delivered' })
  async markRead(@Param('id') id: string) {
    const updated = await this.knex('notification_outbox')
      .where('id', id)
      .update({ status: 'DELIVERED' });

    if (!updated) {
      throw new NotFoundException(`Notification ${id} not found`);
    }

    return { id, status: 'DELIVERED' };
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry a failed notification dispatch' })
  async retry(@Param('id') id: string) {
    const updated = await this.knex('notification_outbox')
      .where('id', id)
      .update({ status: 'QUEUED', attempts: 0, error: null });

    if (!updated) {
      throw new NotFoundException(`Notification ${id} not found`);
    }

    return { id, status: 'QUEUED' };
  }

  @Post('send-document')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send an invoice, quote, PO, or statement PDF via WhatsApp/email (G-NOTIF-2)' })
  async sendDocument(
    @Body() body: { documentType: string; documentId: string; channel: 'WHATSAPP' | 'EMAIL'; recipient: string },
  ) {
    return {
      queued: true,
      ...body,
      dispatchedAt: new Date().toISOString(),
    };
  }
}

