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
  Res,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../m0-platform/jwt-auth.guard.js';
import { RequirePermission } from '../m0-platform/rbac.service.js';
import { PdfGeneratorService } from '../../shared/services/pdf-generator.service.js';
import { OrderService } from './order.service.js';
import {
  CreateOrderDto,
  ConfirmOrderDto,
  RequestOverrideDto,
  AcceptCounterDto,
  CancelOrderDto,
} from './dto/order.dto.js';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrderController {
  constructor(private readonly orderSvc: OrderService) {}

  /**
   * POST /orders - Create order (DRAFT)
   */
  @Post()
  @RequirePermission('order.create')
  async create(@Body() dto: CreateOrderDto, @Req() req: any) {
    const created = await this.orderSvc.createOrder(
      dto.customerId,
      dto.fulfillmentSiteId,
      dto.lines.map((l) => ({
        itemId: l.itemId,
        qty: l.qty.toString(),
        requestedPrice: l.requestedPrice.toString(),
      })),
      req.user.id,
      dto.quoteId,
      dto.deliveryDate,
      dto.deliveryTimeWindow,
    );

    if (dto.autoSubmit) {
      try {
        const confirmed = await this.orderSvc.confirm(
          created.orderId,
          'Submitted from Quick Order Entry',
          req.user.id,
        );
        return {
          ...created,
          status: confirmed.status,
        };
      } catch (err) {
        if (
          err instanceof BadRequestException &&
          err.message.toLowerCase().includes('below floor')
        ) {
          const override = await this.orderSvc.requestOverride(
            created.orderId,
            'Requested price below daily floor',
            req.user.id,
          );
          return {
            ...created,
            status: 'PENDING_APPROVAL',
            exceptionIds: [override.exceptionId],
          };
        }
        throw err;
      }
    }

    return created;
  }

  /**
   * POST /orders/:id/confirm - Confirm order (in-band only)
   */
  @Post(':id/confirm')
  @RequirePermission('order.confirm_in_band')
  async confirm(
    @Param('id') id: string,
    @Body() dto: ConfirmOrderDto,
    @Req() req: any,
  ) {
    return this.orderSvc.confirm(id, dto.remarks, req.user.id);
  }

  /**
   * POST /orders/:id/request-override - Request price override (below floor)
   */
  @Post(':id/request-override')
  @RequirePermission('order.request_override')
  async requestOverride(
    @Param('id') id: string,
    @Body() dto: RequestOverrideDto,
    @Req() req: any,
  ) {
    return this.orderSvc.requestOverride(id, dto.reason, req.user.id);
  }

  /**
   * POST /orders/:id/accept-counter - Accept counter price
   */
  @Post(':id/accept-counter')
  @RequirePermission('order.confirm_in_band')
  async acceptCounter(
    @Param('id') id: string,
    @Body() dto: AcceptCounterDto,
    @Req() req: any,
  ) {
    return this.orderSvc.acceptCounter(id, dto.remarks, req.user.id);
  }

  /**
   * POST /orders/:id/cancel - Cancel order (releases reservations)
   */
  @Post(':id/cancel')
  @RequirePermission('order.manage')
  async cancel(
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
    @Req() req: any,
  ) {
    return this.orderSvc.cancel(id, dto.reason, req.user.id);
  }

  /**
   * GET /orders - List orders (RLS-scoped)
   */
  @Get()
  @RequirePermission('order.view')
  async list(
    @Query()
    q: {
      status?: string;
      siteId?: string;
      customerId?: string;
      deliveryDate?: string;
      date?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    const limit = Math.min(Number(q.limit) || 50, 100);
    const offset = Number(q.offset) || 0;
    const validSiteId =
      q.siteId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q.siteId)
        ? q.siteId
        : undefined;

    const knex = this.orderSvc['knex'];
    const query = knex('sales_orders as so')
      .leftJoin('customers as c', 'so.customer_id', 'c.id')
      .leftJoin('sites as s', 'so.fulfillment_site_id', 's.id')
      .select(
        'so.*',
        'c.business_name as customer_name',
        'c.customer_code as customer_code',
        's.name as site_name',
        knex.raw(
          '(SELECT COUNT(*)::int FROM sales_order_lines sol WHERE sol.order_id = so.id) as lines_count',
        ),
      )
      .orderBy('so.created_at_idx', 'desc')
      .limit(limit)
      .offset(offset);

    if (q.status) query.andWhere('so.order_status', q.status);
    if (validSiteId) query.andWhere('so.fulfillment_site_id', validSiteId);
    if (q.customerId) query.andWhere('so.customer_id', q.customerId);
    if (q.deliveryDate) query.andWhere('so.delivery_date', q.deliveryDate);
    if (q.date) {
      const date = new Date(q.date);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      query.andWhereBetween('so.created_at_idx', [date, nextDate]);
    }

    const orders = await query;
    if (orders.length === 0) return [];

    const orderIds = orders.map((o: any) => o.id);
    const allLines = await knex('sales_order_lines as sol')
      .leftJoin('items as i', 'sol.item_id', 'i.id')
      .whereIn('sol.order_id', orderIds)
      .select('sol.*', 'i.name as item_name', 'i.sku_code', 'i.primary_uom');

    const linesByOrder = new Map<string, any[]>();
    for (const l of allLines) {
      const k = String(l.order_id);
      if (!linesByOrder.has(k)) linesByOrder.set(k, []);
      linesByOrder.get(k)!.push(l);
    }

    return orders.map((o: any) => ({
      ...o,
      lines: linesByOrder.get(String(o.id)) || [],
    }));
  }

  /**
   * GET /orders/summary - Orders KPI strip summary (G-M1-1)
   */
  @Get('summary')
  @RequirePermission('order.view')
  async getSummary(@Query('siteId') siteId?: string) {
    const validSiteId =
      siteId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(siteId)
        ? siteId
        : undefined;
    const knex = this.orderSvc['knex'];
    let query = knex('sales_orders');
    if (validSiteId) query = query.where('fulfillment_site_id', validSiteId);

    const rows = await query
      .select('order_status')
      .count('* as count')
      .groupBy('order_status');
    const counts: Record<string, number> = {};
    for (const r of rows) {
      counts[r.order_status] = Number(r.count);
    }
    return {
      counts,
      totalOrders: Object.values(counts).reduce((a, b) => a + b, 0),
    };
  }

  /**
   * GET /orders/:id/pdf - Server-rendered Order PDF (G-DOC-1)
   */
  @Get(':id/pdf')
  @RequirePermission('order.view')
  async getPdf(@Param('id') id: string, @Res() res: any) {
    const knex = this.orderSvc['knex'];
    const order = await knex('sales_orders').where('id', id).first();
    if (!order) throw new NotFoundException(`Order ${id} not found`);

    const customer = await knex('customers').where('id', order.customer_id).first();
    const site = await knex('sites').where('id', order.fulfillment_site_id).first();
    const lines = await knex('sales_order_lines as sol')
      .leftJoin('items as i', 'sol.item_id', 'i.id')
      .where('sol.order_id', id)
      .select('sol.*', 'i.name as item_name');

    const pdfGen = new PdfGeneratorService();
    const buffer = await pdfGen.generateOrder({
      orderNo: order.order_no,
      orderDate: new Date(order.created_at_idx).toISOString().split('T')[0],
      customerName: customer?.business_name || 'Customer',
      customerGstin: customer?.gstin,
      siteName: site?.name || 'NeoBus',
      lines: lines.map((l: any) => ({
        itemName: l.item_name || 'Item',
        qty: String(l.ordered_qty ?? 0),
        unitPrice: String(l.quoted_unit_price ?? '0'),
        lineTotal: String(l.line_total || '0'),
      })),
      totalAmount: String(order.total_amount || '0'),
      status: order.order_status,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Order-${order.order_no}.pdf"`);
    res.send(buffer);
  }

  /**
   * GET /orders/:id - Get order detail
   */
  @Get(':id')
  @RequirePermission('order.view')
  async getOne(@Param('id') id: string) {
    const order = await this.orderSvc['knex']('sales_orders')
      .where('id', id)
      .first();
    if (!order) throw new NotFoundException(`Order ${id} not found`);

    const lines = await this.orderSvc['knex']('sales_order_lines').where(
      'order_id',
      id,
    );
    const statusLog = await this.orderSvc['knex']('order_status_log')
      .where('order_id', id)
      .orderBy('at', 'desc');

    return { ...order, lines, statusLog };
  }

  /**
   * GET /orders/:id/evaluate-credit - Evaluate credit for an order
   */
  @Post(':id/evaluate-credit')
  @RequirePermission('order.create')
  async evaluateCredit(@Param('id') id: string, @Req() req: any) {
    return this.orderSvc.evaluateOrderCredit(id, req.user.id);
  }
}
