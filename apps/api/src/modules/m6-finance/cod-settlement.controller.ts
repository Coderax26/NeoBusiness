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
import { resolveUserSiteId } from '../../shared/utils/user-site.util.js';
import { CodSettlementService } from './cod-settlement.service.js';
import {
  ListPendingCodQueryDto,
  SettleCodStopDto,
} from './dto/cod-settlement.dto.js';

@ApiTags('M6 Finance — COD Settlement')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('cod-settlements')
export class CodSettlementController {
  constructor(private readonly codService: CodSettlementService) {}

  @Get('pending')
  @RequirePermission('receipt.verify_handover')
  @ApiOperation({
    summary:
      'List pending cash on delivery stops requiring settlement into driver wallet',
  })
  @ApiResponse({ status: 200, description: 'Pending COD stops' })
  async listPending(@Query() query: ListPendingCodQueryDto, @Req() req: any) {
    const siteId =
      query.siteId ||
      (req.user.role === 'OWNER' ? undefined : resolveUserSiteId(req.user));
    const stops = await this.codService.listPendingCodStops(siteId);
    return wrapResponse(stops);
  }

  @Post(':stopId/settle')
  @UseInterceptors(AuditInterceptor)
  @RequirePermission('receipt.verify_handover')
  @ApiOperation({
    summary:
      'Manually trigger COD settlement for a completed delivery stop (idempotent)',
  })
  @ApiResponse({ status: 200, description: 'COD settled into receipt' })
  async settleStop(
    @Param('stopId') stopId: string,
    @Body() dto: SettleCodStopDto,
    @Req() req: any,
  ) {
    const siteId = resolveUserSiteId(req.user, dto.siteId) || '';
    const receipt = await this.codService.settleStopById(stopId, siteId);
    return wrapResponse(receipt);
  }

  @Get(':id')
  @RequirePermission('receipt.verify_handover')
  @ApiOperation({ summary: 'Get COD settlement receipt detail' })
  @ApiResponse({ status: 200, description: 'Settlement receipt' })
  async getById(@Param('id') id: string) {
    const receipt = await this.codService.getSettlement(id);
    return wrapResponse(receipt);
  }
}

