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
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../m0-platform/jwt-auth.guard.js';
import { RequirePermission } from '../m0-platform/rbac.service.js';
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
    return this.orderSvc.createOrder(
      dto.customerId,
      dto.fulfillmentSiteId,
      dto.lines.map((l) => ({
        itemId: l.itemId,
        qty: l.qty.toString(),
        requestedPrice: l.requestedPrice.toString(),
      })),
      req.user.id,
      dto.quoteId,
    );
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
      date?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    const limit = Math.min(q.limit ?? 50, 100);
    const offset = q.offset ?? 0;

    const query = this.orderSvc['knex']('sales_orders')
      .orderBy('created_at_idx', 'desc')
      .limit(limit)
      .offset(offset);

    if (q.status) query.andWhere('order_status', q.status);
    if (q.siteId) query.andWhere('fulfillment_site_id', q.siteId);
    if (q.date) {
      const date = new Date(q.date);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      query.andWhereBetween('created_at_idx', [date, nextDate]);
    }

    return query;
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
