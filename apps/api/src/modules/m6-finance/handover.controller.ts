import {
  Controller,
  Get,
  Post,
  Body,
  Param,
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
import { HandoverService } from './handover.service.js';
import {
  InitiateHandoverDto,
  VerifyHandoverDto,
  ResolveDisputeDto,
  ListHandoversQueryDto,
} from './dto/handover.dto.js';

@ApiTags('M6 Finance — Cash Custody & Handover')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller()
export class HandoverController {
  constructor(private readonly handoverService: HandoverService) {}

  @Get('me/wallet')
  @RequirePermission('collection.log')
  @ApiOperation({
    summary:
      "Get agent's current virtual cash custody wallet balance and recent entries",
  })
  @ApiResponse({ status: 200, description: 'Agent wallet state' })
  async getMyWallet(@Req() req: any) {
    const wallet = await this.handoverService.getAgentWallet(
      req.user.id,
      req.user.siteId,
    );
    return wrapResponse(wallet);
  }

  @Get('custody/expected/:userId')
  @RequirePermission('receipt.verify_handover')
  @ApiOperation({
    summary:
      'Get expected physical cash/cheques to be handed over by a specific agent',
  })
  @ApiResponse({ status: 200, description: 'Expected handover breakdown' })
  async getExpectedHandover(
    @Param('userId') userId: string,
    @Req() req: any,
  ) {
    const expected = await this.handoverService.getExpectedHandover(
      userId,
      req.user.siteId,
    );
    return wrapResponse(expected);
  }

  @Post('handovers')
  @UseInterceptors(AuditInterceptor)
  @RequirePermission('collection.log')
  @ApiOperation({
    summary:
      'Initiate cash handover process (agent requests or cashier begins count)',
  })
  @ApiResponse({ status: 201, description: 'Handover initiated' })
  async initiateHandover(@Body() dto: InitiateHandoverDto, @Req() req: any) {
    const handedBy = dto.handedByUserId || req.user.id;
    const result = await this.handoverService.initiateHandover({
      siteId: req.user.siteId,
      handedByUserId: handedBy,
      receivedByUserId: dto.receivedByUserId || req.user.id,
      notes: dto.notes,
    });
    return wrapResponse(result);
  }

  @Post('handovers/:id/verify')
  @UseInterceptors(AuditInterceptor)
  @RequirePermission('receipt.verify_handover')
  @ApiOperation({
    summary:
      'Verify Cash Handover — clears agent wallet if matched or raises dispute if variance (BR-07)',
  })
  @ApiResponse({ status: 200, description: 'Handover verified or disputed' })
  async verifyHandover(
    @Param('id') id: string,
    @Body() dto: VerifyHandoverDto,
    @Req() req: any,
  ) {
    const result = await this.handoverService.verifyHandover({
      handoverId: id,
      receivedByUserId: req.user.id,
      countedAmount: dto.countedAmount,
      chequeCount: dto.chequeCount,
      notes: dto.notes,
    });
    return wrapResponse(result);
  }

  @Post('handovers/:id/resolve')
  @UseInterceptors(AuditInterceptor)
  @RequirePermission('exception.resolve')
  @ApiOperation({
    summary:
      'Owner resolution of disputed handover variance (posts ledger reversals and unblocks EOD)',
  })
  @ApiResponse({ status: 200, description: 'Dispute resolved' })
  async resolveDispute(
    @Param('id') id: string,
    @Body() dto: ResolveDisputeDto,
    @Req() req: any,
  ) {
    const result = await this.handoverService.resolveDispute({
      handoverId: id,
      resolvedByUserId: req.user.id,
      resolution: dto.action,
      adjustedAmount: dto.adjustedAmount,
    });
    return wrapResponse(result);
  }

  @Get('handovers')
  @RequirePermission('receipt.verify_handover')
  @ApiOperation({ summary: 'List handovers (pending, verified, disputed)' })
  @ApiResponse({ status: 200, description: 'Handovers list' })
  async list(@Query() query: ListHandoversQueryDto, @Req() req: any) {
    const siteId =
      query.siteId || (req.user.role === 'OWNER' ? undefined : req.user.siteId);
    const result = await this.handoverService.listHandovers({
      ...query,
      siteId,
    });
    return wrapResponse(result.items, {
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    });
  }

  @Get('handovers/:id')
  @RequirePermission('receipt.verify_handover')
  @ApiOperation({ summary: 'Get handover details' })
  @ApiResponse({ status: 200, description: 'Handover details' })
  async getById(@Param('id') id: string) {
    const handover = await this.handoverService.getHandover(id);
    return wrapResponse(handover);
  }
}

