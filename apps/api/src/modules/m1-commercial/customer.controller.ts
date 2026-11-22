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
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../m0-platform/jwt-auth.guard.js';
import { RequirePermission } from '../m0-platform/rbac.service.js';
import { CustomerService } from './customer.service.js';
import {
  CreateCustomerDto,
  UpdateCustomerDto,
  CreditOverrideDto,
  CreateCustomerContactDto,
  CreateCommunicationLogDto,
} from './dto/customer.dto.js';

@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomerController {
  constructor(private readonly customerSvc: CustomerService) {}

  /**
   * POST /customers - Create customer (OPS_COORD creates, OWNER can override credit)
   */
  @Post()
  @RequirePermission('customer.modify')
  async create(@Body() dto: CreateCustomerDto, @Req() req: any) {
    return this.customerSvc.create({
      customerCode: dto.customerCode,
      businessName: dto.businessName,
      contactPerson: dto.contactPerson,
      phone: dto.phone,
      whatsappNo: dto.whatsappNo,
      billingAddress: dto.billingAddress,
      defaultSiteId: dto.defaultSiteId,
      gstin: dto.gstin,
      stateCode: dto.stateCode,
      creditLimit: dto.creditLimit,
      creditDays: dto.creditDays,
      maxOverdueDays: dto.maxOverdueDays,
      preferredDeliveryWindow: dto.preferredDeliveryWindow,
      priceTier: dto.priceTier,
      isActive: dto.isActive,
      gpsLatLng: dto.gpsLatLng,
      userId: req.user.id,
    });
  }

  /**
   * GET /customers - List customers (RLS-scoped via M0 middleware)
   */
  @Get()
  @RequirePermission('customer.view')
  async list(
    @Query() q: { siteId?: string; isActive?: string; search?: string },
  ) {
    return this.customerSvc.findAll({
      siteId: q.siteId,
      isActive:
        q.isActive === 'true'
          ? true
          : q.isActive === 'false'
            ? false
            : undefined,
      search: q.search,
    });
  }

  /**
   * GET /customers/:id - Get customer detail
   */
  @Get(':id')
  @RequirePermission('customer.view')
  async getOne(@Param('id') id: string) {
    return this.customerSvc.findById(id);
  }

  /**
   * PATCH /customers/:id - Update customer profile
   */
  @Patch(':id')
  @RequirePermission('customer.modify')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @Req() req: any,
  ) {
    return this.customerSvc.update(id, {
      businessName: dto.businessName,
      contactPerson: dto.contactPerson,
      phone: dto.phone,
      whatsappNo: dto.whatsappNo,
      billingAddress: dto.billingAddress,
      defaultSiteId: dto.defaultSiteId,
      gstin: dto.gstin,
      stateCode: dto.stateCode,
      preferredDeliveryWindow: dto.preferredDeliveryWindow,
      priceTier: dto.priceTier,
      isActive: dto.isActive,
      gpsLatLng: dto.gpsLatLng,
      userId: req.user.id,
    });
  }

  /**
   * PATCH /customers/:id/credit - Credit override (OWNER only)
   */
  @Patch(':id/credit')
  @RequirePermission('customer.credit_override')
  async overrideCredit(
    @Param('id') id: string,
    @Body() dto: CreditOverrideDto,
    @Req() req: any,
  ) {
    return this.customerSvc.overrideCredit(id, {
      creditLimit: dto.creditLimit,
      creditDays: dto.creditDays,
      maxOverdueDays: dto.maxOverdueDays,
      creditHold: dto.creditHold,
      userId: req.user.id,
    });
  }

  /**
   * POST /customers/:id/contacts - Add contact
   */
  @Post(':id/contacts')
  @RequirePermission('customer.modify')
  async addContact(
    @Param('id') id: string,
    @Body() dto: CreateCustomerContactDto,
    @Req() req: any,
  ) {
    return this.customerSvc.addContact(id, {
      name: dto.name,
      phone: dto.phone,
      role: dto.role,
      isPrimary: dto.isPrimary,
      userId: req.user.id,
    });
  }

  /**
   * GET /customers/:id/contacts - List contacts
   */
  @Get(':id/contacts')
  @RequirePermission('customer.view')
  async getContacts(@Param('id') id: string) {
    return this.customerSvc.getContacts(id);
  }

  /**
   * POST /customers/:id/communication - Log communication
   */
  @Post(':id/communication')
  @RequirePermission('customer.modify')
  async logCommunication(
    @Param('id') id: string,
    @Body() dto: CreateCommunicationLogDto,
    @Req() req: any,
  ) {
    return this.customerSvc.logCommunication(id, {
      channel: dto.channel,
      note: dto.note,
      userId: req.user.id,
    });
  }

  /**
   * GET /customers/:id/communication - Get communication log
   */
  @Get(':id/communication')
  @RequirePermission('customer.view')
  async getCommunicationLog(
    @Param('id') id: string,
    @Query('limit') limit?: number,
  ) {
    return this.customerSvc.getCommunicationLog(id, limit);
  }

  /**
   * GET /customers/:id/price-memory?item_id= - Price memory (last 5 sales)
   */
  @Get(':id/price-memory')
  @RequirePermission('customer.view')
  async getPriceMemory(
    @Param('id') id: string,
    @Query('item_id') itemId: string,
    @Query('limit') limit?: number,
  ) {
    if (!itemId)
      throw new BadRequestException('item_id query parameter required');
    return this.customerSvc.getPriceMemory(id, itemId, limit ?? 5);
  }

  @Get(':id/followups')
  @RequirePermission('customer.view')
  @ApiOperation({ summary: 'List customer follow-up reminders (G-M1-4)' })
  async listFollowups(@Param('id') id: string) {
    const rows = await this.customerSvc['knex']('ptp_followups as pf')
      .leftJoin('users as u', 'pf.logged_by_user_id', 'u.id')
      .where('pf.customer_id', id)
      .select('pf.*', 'u.full_name as logged_by_name')
      .orderBy('pf.promised_date', 'asc');
    return { customerId: id, data: rows };
  }

  @Post(':id/followups')
  @RequirePermission('customer.modify')
  @ApiOperation({ summary: 'Schedule a customer follow-up reminder (G-M1-4)' })
  async createFollowup(
    @Param('id') id: string,
    @Body() body: { dueDate: string; note: string; reasonCode?: string },
    @Req() req: any,
  ) {
    const knex = this.customerSvc['knex'];
    const cust = await knex('customers').where('id', id).first('id', 'default_site_id');
    const siteId = cust?.default_site_id || req.user?.siteId;
    const userId = String(req.user?.sub || req.user?.id);
    const [inserted] = await knex('ptp_followups')
      .insert({
        site_id: siteId,
        customer_id: id,
        promised_date: body.dueDate || new Date().toISOString().split('T')[0],
        reason_code: body.reasonCode || 'FOLLOWUP',
        note: body.note || '',
        logged_by_user_id: userId,
        status: 'OPEN',
        updated_by: userId,
      })
      .returning('*');
    return inserted;
  }

  @Patch(':id/followups/:followupId')
  @RequirePermission('customer.modify')
  @ApiOperation({ summary: 'Complete or update a customer follow-up reminder (G-M1-4)' })
  async updateFollowup(
    @Param('id') id: string,
    @Param('followupId') followupId: string,
    @Body() body: { status?: string; note?: string },
    @Req() req: any,
  ) {
    const userId = String(req.user?.sub || req.user?.id || '');
    const updates: Record<string, unknown> = { updated_at: new Date(), updated_by: userId || null };
    if (body.status !== undefined) updates.status = body.status;
    if (body.note !== undefined) updates.note = body.note;
    const [updated] = await this.customerSvc['knex']('ptp_followups')
      .where({ id: followupId, customer_id: id })
      .update(updates)
      .returning('*');
    return updated ?? { id: followupId, customerId: id, ...body };
  }
}
