import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Req, NotFoundException, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../m0-platform/jwt-auth.guard.js';
import { RequirePermission } from '../m0-platform/rbac.service.js';
import { CustomerService } from './customer.service.js';
import { CreateCustomerDto, UpdateCustomerDto, CreditOverrideDto, CreateCustomerContactDto, CreateCommunicationLogDto } from './dto/customer.dto.js';

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
  async list(@Query() q: { siteId?: string; isActive?: string; search?: string }) {
    return this.customerSvc.findAll({
      siteId: q.siteId,
      isActive: q.isActive === 'true' ? true : q.isActive === 'false' ? false : undefined,
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
  async update(@Param('id') id: string, @Body() dto: UpdateCustomerDto, @Req() req: any) {
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
  async overrideCredit(@Param('id') id: string, @Body() dto: CreditOverrideDto, @Req() req: any) {
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
  async addContact(@Param('id') id: string, @Body() dto: CreateCustomerContactDto, @Req() req: any) {
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
  async logCommunication(@Param('id') id: string, @Body() dto: CreateCommunicationLogDto, @Req() req: any) {
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
  async getCommunicationLog(@Param('id') id: string, @Query('limit') limit?: number) {
    return this.customerSvc.getCommunicationLog(id, limit);
  }

  /**
   * GET /customers/:id/price-memory?item_id= - Price memory (last 5 sales)
   */
  @Get(':id/price-memory')
  @RequirePermission('customer.view')
  async getPriceMemory(@Param('id') id: string, @Query('item_id') itemId: string, @Query('limit') limit?: number) {
    if (!itemId) throw new BadRequestException('item_id query parameter required');
    return this.customerSvc.getPriceMemory(id, itemId, limit ?? 5);
  }
}