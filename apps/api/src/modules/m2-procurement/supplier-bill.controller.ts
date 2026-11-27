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
  BadRequestException,
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
import { resolveUserSiteId } from '../../shared/utils/user-site.util.js';
import { SupplierBillService } from './supplier-bill.service.js';
import {
  CreateSupplierBillDto,
  ApproveSupplierBillDto,
  RejectSupplierBillDto,
  ListSupplierBillsQueryDto,
} from './dto/supplier-bill.dto.js';
import { BillStatus, BillApprovalReason } from './supplier-bill.types.js';

@ApiTags('Procurement — Supplier Bills')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('procurement/supplier-bills')
export class SupplierBillController {
  constructor(
    private readonly billService: SupplierBillService,
    @InjectKnex() private readonly knex: Knex,
  ) { }

  @Post()
  @UseInterceptors(AuditInterceptor)
  @RequirePermission('po.create')
  @ApiOperation({ summary: 'Create a new supplier bill (DRAFT)' })
  @ApiResponse({ status: 201, description: 'Supplier bill created' })
  async create(@Body() dto: CreateSupplierBillDto, @Req() req: any) {
    const siteId = resolveUserSiteId(req.user, dto.siteId);
    if (!siteId) {
      throw new BadRequestException('Receiving siteId is required');
    }
    const items = [];

    for (const item of dto.items) {
      let itemName = item.itemName;
      let batchId = item.batchId;

      if (!itemName) {
        const itemRow = await this.knex('items')
          .where('id', item.itemId)
          .first('name');
        itemName = itemRow?.name || 'Material Item';
      }

      if (!batchId) {
        const batchRow = await this.knex('inventory_batches')
          .where('item_id', item.itemId)
          .first('id');
        batchId = batchRow?.id || '00000000-0000-0000-0000-000000000000';
      }

      const qtyNum = parseFloat(item.quantity);
      const rateNum = parseFloat(item.ratePerUnit);
      const taxRateNum = parseFloat(item.taxRate || '0');
      const subtotal = qtyNum * rateNum;
      const taxAmount =
        item.taxAmount || (subtotal * (taxRateNum / 100)).toFixed(2);
      const lineTotal =
        item.lineTotal || (subtotal + parseFloat(taxAmount)).toFixed(2);

      const finalItemName: string = itemName || 'Material Item';
      const finalBatchId: string =
        batchId || '00000000-0000-0000-0000-000000000000';

      items.push({
        item_id: item.itemId,
        batch_id: finalBatchId,
        item_name: finalItemName,
        quantity: item.quantity,
        rate_per_unit: item.ratePerUnit,
        tax_amount: taxAmount,
        line_total: lineTotal,
        tax_treatment: item.taxTreatment || 'TAXABLE',
        tax_rate: item.taxRate || '0',
      });
    }

    const bill = await this.billService.create(
      {
        supplier_id: dto.supplierId,
        po_id: dto.poId,
        site_id: siteId,
        bill_date: dto.billDate ? new Date(dto.billDate) : undefined,
        due_days: dto.dueDays,
        items,
      },
      req.user.id,
    );
    return wrapResponse(bill);
  }

  @Post(':id/submit')
  @UseInterceptors(AuditInterceptor)
  @RequirePermission('po.create')
  @ApiOperation({
    summary: 'Submit supplier bill for approval (DRAFT → PENDING_APPROVAL)',
  })
  @ApiResponse({ status: 200, description: 'Bill submitted' })
  async submit(@Param('id') id: string, @Req() req: any) {
    const bill = await this.billService.updateStatus(
      id,
      { status: BillStatus.PENDING_APPROVAL },
      req.user.id,
    );
    return wrapResponse(bill);
  }

  @Post(':id/approve')
  @UseInterceptors(AuditInterceptor)
  @RequirePermission('po.approve')
  @ApiOperation({
    summary:
      'Approve supplier bill (PENDING_APPROVAL → APPROVED; runs 3-way match, posts supplier ledger AP)',
  })
  @ApiResponse({ status: 200, description: 'Bill approved and AP posted' })
  async approve(
    @Param('id') id: string,
    @Body() dto: ApproveSupplierBillDto,
    @Req() req: any,
  ) {
    const reason =
      dto.reason === 'APPROVED_BY_SUPER_ADMIN'
        ? BillApprovalReason.APPROVED_BY_SUPER_ADMIN
        : BillApprovalReason.APPROVED_BY_OWNER;

    const bill = await this.billService.updateStatus(
      id,
      {
        status: BillStatus.APPROVED,
        reason,
      },
      req.user.id,
    );
    return wrapResponse(bill);
  }

  @Post(':id/reject')
  @UseInterceptors(AuditInterceptor)
  @RequirePermission('po.approve')
  @ApiOperation({ summary: 'Reject supplier bill (PENDING_APPROVAL → REJECTED)' })
  @ApiResponse({ status: 200, description: 'Bill rejected' })
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectSupplierBillDto,
    @Req() req: any,
  ) {
    const bill = await this.billService.updateStatus(
      id,
      {
        status: BillStatus.REJECTED,
        reason: dto.reason as any,
      },
      req.user.id,
    );
    return wrapResponse(bill);
  }

  @Get()
  @RequirePermission('po.read')
  @ApiOperation({ summary: 'List supplier bills with filters and pagination' })
  @ApiResponse({ status: 200, description: 'Supplier bills list' })
  async list(@Query() query: ListSupplierBillsQueryDto, @Req() req: any) {
    const rawSiteId =
      query.siteId ||
      (req.user.role === 'OWNER' ? undefined : resolveUserSiteId(req.user));
    const siteId =
      rawSiteId &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          rawSiteId,
        )
        ? rawSiteId
        : undefined;
    const result = await this.billService.list({
      supplier_id: query.supplierId,
      site_id: siteId,
      po_id: query.poId,
      status: query.status,
    });
    return wrapResponse(result);
  }

  @Get('ap/aging')
  @RequirePermission('po.read')
  @ApiOperation({ summary: 'Accounts Payable aging buckets by supplier' })
  @ApiResponse({ status: 200, description: 'AP aging summary' })
  async getApAging(@Query('siteId') siteId?: string) {
    const normalizedSiteId =
      siteId &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          siteId,
        )
        ? siteId
        : undefined;
    const result = await this.billService.getApAging(normalizedSiteId);
    return wrapResponse(result);
  }

  @Post(':id/pay')
  @UseInterceptors(AuditInterceptor)
  @RequirePermission('po.approve')
  @ApiOperation({ summary: 'Record payment for approved supplier bill (APPROVED → PAID)' })
  @ApiResponse({ status: 200, description: 'Bill marked as paid' })
  async pay(
    @Param('id') id: string,
    @Body() body: { paymentRef?: string; paidAmount?: number },
    @Req() req: any,
  ) {
    const bill = await this.billService.updateStatus(
      id,
      {
        status: BillStatus.PAID,
      },
      req.user.id,
    );
    return wrapResponse(bill);
  }

  @Get(':id')
  @RequirePermission('po.read')
  @ApiOperation({ summary: 'Get supplier bill details with lines' })
  @ApiResponse({ status: 200, description: 'Supplier bill detail' })
  async getById(@Param('id') id: string) {
    const bill = await this.billService.getById(id);
    if (!bill) throw new NotFoundException(`Supplier bill ${id} not found`);
    return wrapResponse(bill);
  }
}
