import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  Res,
  UseInterceptors,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../m0-platform/jwt-auth.guard.js';
import { RbacGuard, RequirePermission } from '../m0-platform/rbac.service.js';
import { AuditInterceptor } from '../../shared/interceptors/audit.interceptor.js';
import { wrapResponse } from '../../shared/utils/response-envelope.js';
import { resolveUserSiteId } from '../../shared/utils/user-site.util.js';
import { EodService } from './eod.service.js';
import {
  InitiateEodDto,
  SignOffEodDto,
} from './dto/eod.dto.js';

@ApiTags('M6 Finance — End of Day (EOD) Closing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('eod')
export class EodController {
  constructor(private readonly eodService: EodService) {}

  @Post('start')
  @UseInterceptors(AuditInterceptor)
  @RequirePermission('eod.signoff')
  @ApiOperation({
    summary:
      'Start 10-minute EOD closing workflow (evaluates all 4 checklist gates)',
  })
  @ApiResponse({ status: 201, description: 'EOD process initiated' })
  async initiateClosing(@Body() dto: InitiateEodDto, @Req() req: any) {
    const siteId = resolveUserSiteId(req.user, dto.siteId) || '';
    const result = await this.eodService.initiateClosing(
      siteId,
      req.user.id,
      dto.date,
    );
    return wrapResponse(result);
  }

  @Get(':date')
  @RequirePermission('eod.signoff')
  @ApiOperation({ summary: 'Get EOD status for a specific date and site' })
  @ApiResponse({ status: 200, description: 'EOD record status' })
  async getByDate(@Param('date') date: string, @Req() req: any) {
    const siteId = resolveUserSiteId(req.user) || '';
    const eod = await this.eodService.getEODBySiteDate(siteId, date);
    if (!eod) {
      throw new NotFoundException(`No EOD initiated for ${date} at site ${siteId}`);
    }
    return wrapResponse(eod);
  }

  @Get(':date/checklist')
  @RequirePermission('eod.signoff')
  @ApiOperation({
    summary:
      'Evaluate the 4 EOD closing checklist items (trips, wallets, invoices, cash position)',
  })
  @ApiResponse({ status: 200, description: '4-check evaluation status' })
  async getChecklist(@Param('date') date: string, @Req() req: any) {
    const siteId = resolveUserSiteId(req.user) || '';
    const eod = await this.eodService.getEODBySiteDate(siteId, date);
    if (!eod) {
      throw new NotFoundException(`No EOD initiated for ${date} at site ${siteId}`);
    }
    const checklist = await this.eodService.getChecklist(String(eod.id));
    return wrapResponse(checklist);
  }

  @Post(':date/signoff')
  @UseInterceptors(AuditInterceptor)
  @RequirePermission('eod.signoff')
  @ApiOperation({
    summary:
      'Owner EOD final sign-off (freezes day, triggers accounting export; blocks if any check red)',
  })
  @ApiResponse({ status: 200, description: 'EOD signed off' })
  async signOff(
    @Param('date') date: string,
    @Body() dto: SignOffEodDto,
    @Req() req: any,
  ) {
    const siteId = resolveUserSiteId(req.user) || '';
    const eod = await this.eodService.getEODBySiteDate(siteId, date);
    if (!eod) {
      throw new NotFoundException(`No EOD initiated for ${date} at site ${siteId}`);
    }
    const result = await this.eodService.signOff(String(eod.id), req.user.id);
    return wrapResponse(result);
  }

  @Get(':date/deposit-slip')
  @RequirePermission('eod.signoff')
  @ApiOperation({ summary: 'Generate bank deposit slip breakdown' })
  @ApiResponse({ status: 200, description: 'Deposit slip data' })
  async getDepositSlip(@Param('date') date: string, @Req() req: any) {
    const slip = await this.eodService.generateDepositSlip(
      resolveUserSiteId(req.user) || '',
      date,
    );
    return wrapResponse(slip);
  }

  @Get(':date/deposit-slip/pdf')
  @RequirePermission('eod.signoff')
  @ApiOperation({ summary: 'Download generated Bank Deposit Slip PDF' })
  @ApiResponse({ status: 200, description: 'Bank deposit slip PDF stream' })
  async downloadDepositSlipPdf(
    @Param('date') date: string,
    @Req() req: any,
    @Res() res: Response,
  ): Promise<void> {
    const pdfBuffer = await this.eodService.generateDepositSlipPdf(
      req.user.siteId,
      date,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="DepositSlip-${date}.pdf"`,
    );
    res.send(pdfBuffer);
  }
}

