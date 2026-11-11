import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
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
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import { JwtAuthGuard } from '../m0-platform/jwt-auth.guard.js';
import { RbacGuard, RequirePermission } from '../m0-platform/rbac.service.js';
import { AuditInterceptor } from '../../shared/interceptors/audit.interceptor.js';
import { wrapResponse } from '../../shared/utils/response-envelope.js';
import { PTPService } from './ptp.service.js';
import {
  CreatePtpDto,
  UpdatePtpDto,
  ListPtpQueryDto,
} from './dto/ptp.dto.js';

@ApiTags('M6 Finance — Promise to Pay (PTP)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('ptp')
export class PtpController {
  constructor(
    private readonly ptpService: PTPService,
    @InjectKnex() private readonly knex: Knex,
  ) {}

  @Post()
  @UseInterceptors(AuditInterceptor)
  @RequirePermission('collection.log')
  @ApiOperation({
    summary:
      'Log customer Promise to Pay (mandatory when customer declines field payment)',
  })
  @ApiResponse({ status: 201, description: 'PTP logged' })
  async create(@Body() dto: CreatePtpDto, @Req() req: any) {
    const siteId = req.user.siteId;
    const ptp = await this.ptpService.createPTP({
      siteId,
      customerId: dto.customerId,
      invoiceId: dto.invoiceId,
      promisedDate: new Date(dto.promisedDate),
      reasonCode: dto.reasonCode,
      note: dto.note,
      loggedByUserId: req.user.id,
    });
    return wrapResponse(ptp);
  }

  @Patch(':id')
  @UseInterceptors(AuditInterceptor)
  @RequirePermission('collection.log')
  @ApiOperation({ summary: 'Update PTP status (mark KEPT or BROKEN)' })
  @ApiResponse({ status: 200, description: 'PTP updated' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePtpDto,
    @Req() req: any,
  ) {
    const updated = await this.ptpService.updatePTPStatus(
      id,
      dto.status,
      req.user.id,
    );
    return wrapResponse(updated);
  }

  @Get('due')
  @RequirePermission('collection.log')
  @ApiOperation({ summary: "Get PTPs due today for current site's follow-ups" })
  @ApiResponse({ status: 200, description: 'Due PTP list' })
  async getDueToday(@Query('date') date: string, @Req() req: any) {
    const ptps = await this.ptpService.getPTPsDueToday(req.user.siteId, date);
    return wrapResponse(ptps);
  }

  @Get()
  @RequirePermission('collection.log')
  @ApiOperation({ summary: 'List PTP follow-ups with filters' })
  @ApiResponse({ status: 200, description: 'PTP list' })
  async list(@Query() query: ListPtpQueryDto, @Req() req: any) {
    const ptps = await this.ptpService.getPTPs(req.user.siteId, {
      customerId: query.customerId,
      status: query.status,
      fromDate: query.fromDate,
      toDate: query.toDate,
    });
    return wrapResponse(ptps);
  }

  @Get(':id')
  @RequirePermission('collection.log')
  @ApiOperation({ summary: 'Get PTP details by ID' })
  @ApiResponse({ status: 200, description: 'PTP details' })
  async getById(@Param('id') id: string) {
    const ptp = await this.knex('ptp_followups')
      .where('id', id)
      .first('*');
    if (!ptp) throw new NotFoundException(`PTP ${id} not found`);
    return wrapResponse(ptp);
  }
}

