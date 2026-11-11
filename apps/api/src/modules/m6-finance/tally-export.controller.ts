import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  UseInterceptors,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../m0-platform/jwt-auth.guard.js';
import { RbacGuard, RequirePermission } from '../m0-platform/rbac.service.js';
import { AuditInterceptor } from '../../shared/interceptors/audit.interceptor.js';
import { wrapResponse } from '../../shared/utils/response-envelope.js';
import { TallyExportService } from './tally-export.service.js';
import {
  TriggerTallyExportDto,
  ListTallyBatchesQueryDto,
} from './dto/tally-export.dto.js';

@ApiTags('M6 Finance — Accounting Bridge & Tally Prime Export')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('tally')
export class TallyExportController {
  constructor(private readonly tallyService: TallyExportService) {}

  @Post('export')
  @UseInterceptors(AuditInterceptor)
  @RequirePermission('config.edit')
  @ApiOperation({
    summary:
      'Trigger Tally XML export batch generation for sales invoices, purchase bills, and receipts',
  })
  @ApiResponse({ status: 201, description: 'Export job executed' })
  async triggerExport(@Body() dto: TriggerTallyExportDto) {
    await this.tallyService.exportTallyXml();
    return wrapResponse({ message: 'Tally export triggered successfully' });
  }

  @Get('batches')
  @RequirePermission('config.edit')
  @ApiOperation({ summary: 'List historical Tally export batches' })
  @ApiResponse({ status: 200, description: 'Batch history' })
  async listBatches(
    @Query() query: ListTallyBatchesQueryDto,
    @Req() req: any,
  ) {
    const siteId =
      query.siteId || (req.user.role === 'OWNER' ? undefined : req.user.siteId);
    const batches = await this.tallyService.getExportHistory(
      siteId,
      query.limit,
    );
    return wrapResponse(batches);
  }

  @Get('batches/:id')
  @RequirePermission('config.edit')
  @ApiOperation({ summary: 'Get details and voucher breakdown for an export batch' })
  @ApiResponse({ status: 200, description: 'Batch details' })
  async getBatchDetails(@Param('id') id: string) {
    const batch = await this.tallyService.getBatchDetails(id);
    if (!batch) throw new NotFoundException(`Tally batch ${id} not found`);
    return wrapResponse(batch);
  }
}

