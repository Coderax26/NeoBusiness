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
import { ChequeService } from './cheque.service.js';
import {
  DepositChequeDto,
  ClearChequeDto,
  BounceChequeDto,
  ReturnChequeDto,
  ListChequesQueryDto,
} from './dto/cheque.dto.js';

@ApiTags('M6 Finance — Cheque Register')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('cheques')
export class ChequeController {
  constructor(private readonly chequeService: ChequeService) {}

  @Get()
  @RequirePermission('receipt.verify_handover')
  @ApiOperation({ summary: 'List cheques with status and date filters' })
  @ApiResponse({ status: 200, description: 'Cheques list' })
  async list(@Query() query: ListChequesQueryDto, @Req() req: any) {
    const siteId = req.user.siteId;
    const cheques = await this.chequeService.listCheques(
      siteId,
      query.status,
      query.limit ?? 50,
    );
    return wrapResponse(cheques);
  }

  @Get(':id')
  @RequirePermission('receipt.verify_handover')
  @ApiOperation({ summary: 'Get cheque details' })
  @ApiResponse({ status: 200, description: 'Cheque details' })
  async getById(@Param('id') id: string) {
    const cheque = await this.chequeService.getCheque(id);
    if (!cheque) throw new NotFoundException(`Cheque ${id} not found`);
    return wrapResponse(cheque);
  }

  @Post(':id/deposit')
  @UseInterceptors(AuditInterceptor)
  @RequirePermission('receipt.verify_handover')
  @ApiOperation({ summary: 'Deposit cheque into bank with deposit slip reference' })
  @ApiResponse({ status: 200, description: 'Cheque marked DEPOSITED' })
  async deposit(
    @Param('id') id: string,
    @Body() dto: DepositChequeDto,
    @Req() req: any,
  ) {
    const result = await this.chequeService.depositCheque({
      chequeId: id,
      depositedBy: req.user.id,
      depositSlipNo: dto.depositSlipNo,
    });
    return wrapResponse(result);
  }

  @Post(':id/clear')
  @UseInterceptors(AuditInterceptor)
  @RequirePermission('receipt.verify_handover')
  @ApiOperation({ summary: 'Mark deposited cheque as CLEARED' })
  @ApiResponse({ status: 200, description: 'Cheque marked CLEARED' })
  async clear(
    @Param('id') id: string,
    @Body() dto: ClearChequeDto,
    @Req() req: any,
  ) {
    const result = await this.chequeService.clearCheque({
      chequeId: id,
      clearedBy: req.user.id,
    });
    return wrapResponse(result);
  }

  @Post(':id/bounce')
  @UseInterceptors(AuditInterceptor)
  @RequirePermission('receipt.verify_handover')
  @ApiOperation({
    summary:
      'Record cheque BOUNCE — reverses receipt allocations and restores invoice balance',
  })
  @ApiResponse({ status: 200, description: 'Cheque marked BOUNCED with reversals' })
  async bounce(
    @Param('id') id: string,
    @Body() dto: BounceChequeDto,
    @Req() req: any,
  ) {
    const result = await this.chequeService.bounceCheque({
      chequeId: id,
      bouncedBy: req.user.id,
      bounceReason: dto.bounceReason,
    });
    return wrapResponse(result);
  }

  @Post(':id/return')
  @UseInterceptors(AuditInterceptor)
  @RequirePermission('receipt.verify_handover')
  @ApiOperation({ summary: 'Return cheque to customer without deposit' })
  @ApiResponse({ status: 200, description: 'Cheque returned' })
  async returnCheque(
    @Param('id') id: string,
    @Body() dto: ReturnChequeDto,
    @Req() req: any,
  ) {
    const result = await this.chequeService.returnCheque({
      chequeId: id,
      returnedBy: req.user.id,
      returnReason: dto.reason,
    });
    return wrapResponse(result);
  }
}

