import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
  NotFoundException,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../m0-platform/jwt-auth.guard.js';
import { RbacGuard, RequirePermission } from '../m0-platform/rbac.service.js';
import { PdfGeneratorService } from '../../shared/services/pdf-generator.service.js';
import { POService } from './po.service.js';
import { CreatePODto, ConfirmQuantitiesDto } from './dto/po.dto.js';

@ApiTags('Procurement - Purchase Orders')
@ApiBearerAuth()
@Controller('procurement/purchase-orders')
@UseGuards(JwtAuthGuard, RbacGuard)
export class POController {
  constructor(private readonly poService: POService) {}

  @Post()
  @RequirePermission('po.create')
  @ApiOperation({ summary: 'Create a new purchase order (DRAFT)' })
  @ApiResponse({ status: 201, description: 'PO created' })
  async create(
    @Body() dto: CreatePODto,
    @Query('userId') userId?: string,
    @Req() req?: any,
  ) {
    const actorId = userId || req?.user?.sub || req?.user?.id;
    const linesWithUser = dto.lines.map((line) => ({
      ...line,
      userId: actorId,
    }));
    return this.poService.create({
      supplierId: dto.supplierId,
      receivingSiteId: dto.receivingSiteId,
      lines: linesWithUser,
      expectedDelivery: dto.expectedDelivery,
      linkedSalesOrderId: dto.linkedSalesOrderId,
      userId: actorId,
    });
  }

  @Get()
  @RequirePermission('po.read')
  @ApiOperation({ summary: 'List purchase orders' })
  @ApiResponse({ status: 200, description: 'List of POs' })
  async list(
    @Query('status') status?: string,
    @Query('supplierId') supplierId?: string,
    @Query('siteId') siteId?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.poService.list({ status, supplierId, siteId, limit, offset });
  }

  @Get(':id')
  @RequirePermission('po.read')
  @ApiOperation({ summary: 'Get PO by ID with lines' })
  @ApiResponse({ status: 200, description: 'PO details with lines' })
  async getById(@Param('id') id: string) {
    const po = await this.poService.getById(id);
    const lines = await this.poService.getLines(id);
    return { ...po, lines };
  }

  @Get(':id/pdf')
  @RequirePermission('po.read')
  @ApiOperation({ summary: 'Generate Purchase Order PDF (G-DOC-4)' })
  async getPdf(@Param('id') id: string, @Res() res: any) {
    const po = await this.poService.getById(id);
    if (!po) throw new NotFoundException(`PO ${id} not found`);
    const lines = await this.poService.getLines(id);

    const supplier = await this.poService['knex']('suppliers').where('id', po.supplier_id).first();
    const site = await this.poService['knex']('sites').where('id', po.receiving_site_id).first();

    const pdfGen = new PdfGeneratorService();
    const buffer = await pdfGen.generatePurchaseOrder({
      poNo: po.po_no,
      poDate: new Date(po.created_at).toISOString().split('T')[0],
      expectedDelivery: po.expected_delivery
        ? new Date(po.expected_delivery).toISOString().split('T')[0]
        : undefined,
      supplierName: supplier?.company_name || 'Supplier',
      supplierGstin: supplier?.gstin,
      siteName: site?.name || 'NeoBus',
      lines: lines.map((l: any) => {
        const qtyStr = String(l.orderedQty ?? l.ordered_qty ?? '0');
        const priceStr = String(l.unitPrice ?? l.unit_price ?? '0');
        const computedTotal = (
          parseFloat(qtyStr) * parseFloat(priceStr)
        ).toFixed(2);
        return {
          itemName: l.itemName || l.item_name || 'Item',
          qty: qtyStr,
          unitPrice: priceStr,
          lineTotal: String(l.line_total ?? computedTotal),
        };
      }),
      totalAmount: String(po.total_amount || '0'),
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="PO-${po.po_no}.pdf"`);
    res.send(buffer);
  }

  @Get(':id/lines')
  @RequirePermission('po.read')
  @ApiOperation({ summary: 'Get PO lines' })
  @ApiResponse({ status: 200, description: 'PO lines' })
  async getLines(@Param('id') id: string) {
    return this.poService.getLines(id);
  }

  @Post(':id/confirm-quantities')
  @RequirePermission('po.confirm')
  @ApiOperation({
    summary: 'Confirm quantities and prices (BR-03 price spike check)',
  })
  @ApiResponse({ status: 200, description: 'Quantities confirmed' })
  async confirmQuantities(
    @Param('id') poId: string,
    @Body() dto: ConfirmQuantitiesDto,
    @Query('userId') userId?: string,
    @Req() req?: any,
  ) {
    const actorId = userId || req?.user?.sub || req?.user?.id;
    return this.poService.confirmQuantities({
      poId,
      confirmations: dto.confirmations.map((c) => ({ ...c, userId: actorId })),
    });
  }

  @Post(':id/issue')
  @RequirePermission('po.issue')
  @ApiOperation({ summary: 'Issue PO (DRAFT/PENDING_APPROVAL -> ISSUED)' })
  @ApiResponse({ status: 200, description: 'PO issued' })
  async issuePO(
    @Param('id') poId: string,
    @Query('userId') userId?: string,
    @Req() req?: any,
  ) {
    const actorId = userId || req?.user?.sub || req?.user?.id;
    return this.poService.issuePO({ poId, userId: actorId });
  }

  @Post(':id/cancel')
  @RequirePermission('po.cancel')
  @ApiOperation({ summary: 'Cancel PO' })
  @ApiResponse({ status: 200, description: 'PO cancelled' })
  async cancelPO(
    @Param('id') poId: string,
    @Query('userId') userId?: string,
    @Query('reason') queryReason?: string,
    @Body() body?: { reason?: string },
    @Req() req?: any,
  ) {
    const actorId = userId || req?.user?.sub || req?.user?.id;
    const reason = body?.reason || queryReason;
    return this.poService.cancelPO(poId, actorId, reason);
  }

  @Get('sales-order/:salesOrderId')
  @RequirePermission('po.read')
  @ApiOperation({ summary: 'Get POs linked to a sales order' })
  @ApiResponse({ status: 200, description: 'Linked POs' })
  async getPOsForSalesOrder(@Param('salesOrderId') salesOrderId: string) {
    return this.poService.getPOsForSalesOrder(salesOrderId);
  }
}
