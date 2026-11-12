import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import type { Knex } from 'knex';
import { InjectKnex } from 'nestjs-knex';
import { v4 as uuidv4 } from 'uuid';
import { JwtAuthGuard } from './jwt-auth.guard.js';

@ApiTags('attachments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('attachments')
export class AttachmentsController {
  constructor(@InjectKnex() private readonly knex: Knex) {}

  @Post('presign')
  @ApiOperation({ summary: 'Generate pre-signed upload URL / record attachment metadata' })
  async presign(
    @Body()
    dto: {
      entityName: string;
      entityId: string;
      fileName: string;
      mimeType: string;
      fileSizeBytes?: number;
    },
    @Req() req: any,
  ) {
    const id = uuidv4();
    const sanitizedFileName = dto.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageKey = `attachments/${dto.entityName}/${dto.entityId}/${id}-${sanitizedFileName}`;

    const [attachment] = await this.knex('attachments')
      .insert({
        id,
        entity_name: dto.entityName,
        entity_id: dto.entityId,
        storage_key: storageKey,
        mime_type: dto.mimeType,
        file_size_bytes: dto.fileSizeBytes || null,
        uploaded_by: req.user?.id,
      })
      .returning('*');

    // In local dev/MinIO, pre-signed upload URL can point to MinIO or BFF proxy endpoint
    return {
      attachment,
      uploadUrl: `/api/v1/attachments/upload/${attachment.id}`,
      storageKey,
    };
  }

  @Get(':entity/:entityId')
  @ApiOperation({ summary: 'List attachments for a domain entity' })
  async listAttachments(
    @Param('entity') entityName: string,
    @Param('entityId') entityId: string,
  ) {
    return this.knex('attachments')
      .where({
        entity_name: entityName,
        entity_id: entityId,
      })
      .orderBy('created_at', 'desc');
  }
}

