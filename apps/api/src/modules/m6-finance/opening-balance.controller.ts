import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
  Res,
  UseInterceptors,
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
import { OpeningBalanceService } from './opening-balance.service.js';
import {
  OpeningBalanceDraftDto,
  OpeningBalanceImportDto,
  OpeningBalanceReverseDto,
} from './dto/opening-balance.dto.js';

@ApiTags('M6 Finance — Sub-Ledger Opening Balances')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('finance/opening-balances')
export class OpeningBalanceController {
  constructor(private readonly obService: OpeningBalanceService) {}

  @Get('template')
  @RequirePermission('config.edit')
  @ApiOperation({ summary: 'Get CSV template headers for importing opening balances' })
  @ApiResponse({ status: 200, description: 'CSV template file' })
  getTemplate(@Res() res: Response): void {
    const csvContent = this.obService.getTemplate();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="opening_balances_template.csv"',
    );
    res.send(csvContent);
  }

  @Post('draft')
  @RequirePermission('config.edit')
  @ApiOperation({
    summary:
      'Validate draft opening balance records and check party references without committing',
  })
  @ApiResponse({ status: 200, description: 'Validation summary' })
  async validateDraft(@Body() dto: OpeningBalanceDraftDto) {
    const summary = await this.obService.validateDraft(dto.rows);
    return wrapResponse(summary);
  }

  @Post('import')
  @UseInterceptors(AuditInterceptor)
  @RequirePermission('config.edit')
  @ApiOperation({
    summary:
      'Commit validated opening balance entries to customer/supplier sub-ledgers',
  })
  @ApiResponse({ status: 201, description: 'Balances imported' })
  async importBalances(
    @Body() dto: OpeningBalanceImportDto,
    @Req() req: any,
  ) {
    const siteId = resolveUserSiteId(req.user, dto.siteId) || '';
    const result = await this.obService.importBalances(
      dto.rows,
      siteId,
      req.user.id,
    );
    return wrapResponse(result);
  }

  @Post('reverse')
  @UseInterceptors(AuditInterceptor)
  @RequirePermission('config.edit')
  @ApiOperation({ summary: 'Reverse previously imported opening balance' })
  @ApiResponse({ status: 200, description: 'Opening balance reversed' })
  async reverseOpeningBalance(
    @Body() dto: OpeningBalanceReverseDto,
    @Req() req: any,
  ) {
    const siteId = resolveUserSiteId(req.user, dto.siteId) || '';
    const result = await this.obService.reverseOpeningBalance(
      dto.partyId,
      dto.entityType,
      siteId,
      req.user.id,
      dto.reason,
    );
    return wrapResponse(result);
  }
}

