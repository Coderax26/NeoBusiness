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
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import { JwtAuthGuard } from '../m0-platform/jwt-auth.guard.js';
import { RbacGuard, RequirePermission } from '../m0-platform/rbac.service.js';
import { AuditInterceptor } from '../../shared/interceptors/audit.interceptor.js';
import { wrapResponse } from '../../shared/utils/response-envelope.js';
import { Money } from '../../shared/utils/money.util.js';
import { CreditNoteService } from './credit-note.service.js';
import {
  CreateCreditNoteDto,
  RejectCreditNoteDto,
  CancelCreditNoteDto,
  ListCreditNotesQueryDto,
} from './dto/credit-note.dto.js';

@ApiTags('M6 Finance — Credit Notes & Rebates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('credit-notes')
export class CreditNoteController {
  constructor(
    private readonly creditNoteService: CreditNoteService,
    @InjectKnex() private readonly knex: Knex,
  ) {}

  @Post()
  @UseInterceptors(AuditInterceptor)
  @RequirePermission('order.request_override')
  @ApiOperation({
    summary:
      'Request a credit note (RETURN, DAMAGE, REBATE, WRITEOFF). Rebates & write-offs require owner approval.',
  })
  @ApiResponse({ status: 201, description: 'Credit note requested' })
  async create(@Body() dto: CreateCreditNoteDto, @Req() req: any) {
    const order = await this.knex('sales_orders')
      .where('id', dto.orderId)
      .first('customer_id', 'fulfillment_site_id');
    if (!order) {
      throw new NotFoundException(`Order ${dto.orderId} not found`);
    }

    const reasonMap: Record<string, 'RETURNED' | 'SOLD_QUIETLY' | 'ABNORMAL_DAMAGE' | 'EXPIRY' | 'OTHER'> = {
      RETURN: 'RETURNED',
      DAMAGE: 'ABNORMAL_DAMAGE',
      REBATE: 'SOLD_QUIETLY',
      WRITEOFF: 'OTHER',
    };

    let totalDebit = Money.zero();
    for (const l of dto.lines) {
      totalDebit = totalDebit.add(Money.of(l.unitPrice).mul(l.qty));
    }

    const result = await this.creditNoteService.createCreditNote({
      customerId: String(order.customer_id),
      siteId: String(order.fulfillment_site_id || req.user.siteId),
      orderId: dto.orderId,
      reasonType: reasonMap[dto.reason] || 'OTHER',
      lines: dto.lines.map((l) => ({
        itemId: l.itemId,
        qty: l.qty,
        unitPrice: l.unitPrice,
        reason: l.reason,
      })),
      totalDebit: totalDebit.toStorageString(),
      requestedBy: req.user.id,
    });
    return wrapResponse(result);
  }

  @Get()
  @RequirePermission('order.confirm_in_band')
  @ApiOperation({ summary: 'List credit notes with customer and status filters' })
  @ApiResponse({ status: 200, description: 'Credit notes list' })
  async list(@Query() query: ListCreditNotesQueryDto, @Req() req: any) {
    const siteId =
      query.siteId || (req.user.role === 'OWNER' ? undefined : req.user.siteId);
    const creditNotes = await this.creditNoteService.listCreditNotes(
      query.customerId,
      siteId,
      query.status,
    );
    return wrapResponse(creditNotes);
  }

  @Get(':id')
  @RequirePermission('order.confirm_in_band')
  @ApiOperation({ summary: 'Get credit note details with lines' })
  @ApiResponse({ status: 200, description: 'Credit note detail' })
  async getById(@Param('id') id: string) {
    const note = await this.creditNoteService.getCreditNote(id);
    if (!note) throw new NotFoundException(`Credit note ${id} not found`);
    return wrapResponse(note);
  }

  @Post(':id/approve')
  @UseInterceptors(AuditInterceptor)
  @RequirePermission('credit.override')
  @ApiOperation({
    summary:
      'Approve credit note (owner approval for rebates/writeoffs; posts CREDIT entry to customer ledger)',
  })
  @ApiResponse({ status: 200, description: 'Credit note approved and posted' })
  async approve(@Param('id') id: string, @Req() req: any) {
    const result = await this.creditNoteService.approveCreditNote(
      id,
      req.user.id,
    );
    return wrapResponse(result);
  }

  @Post(':id/reject')
  @UseInterceptors(AuditInterceptor)
  @RequirePermission('credit.override')
  @ApiOperation({ summary: 'Reject requested credit note' })
  @ApiResponse({ status: 200, description: 'Credit note rejected' })
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectCreditNoteDto,
    @Req() req: any,
  ) {
    const result = await this.creditNoteService.rejectCreditNote(
      id,
      req.user.id,
      dto.reason,
    );
    return wrapResponse(result);
  }

  @Post(':id/cancel')
  @UseInterceptors(AuditInterceptor)
  @RequirePermission('credit.override')
  @ApiOperation({ summary: 'Cancel credit note with reversing ledger adjustment' })
  @ApiResponse({ status: 200, description: 'Credit note cancelled' })
  async cancel(
    @Param('id') id: string,
    @Body() dto: CancelCreditNoteDto,
    @Req() req: any,
  ) {
    const result = await this.creditNoteService.cancelCreditNote(
      id,
      req.user.id,
      dto.reason,
    );
    return wrapResponse(result);
  }
}

