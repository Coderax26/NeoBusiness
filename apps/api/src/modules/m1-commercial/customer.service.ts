import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import { DocNumberService } from '../m0-platform/doc-number.service.js';

/**
 * CustomerService — handles customer master CRUD and credit profile management.
 */
@Injectable()
export class CustomerService {
  private readonly logger = new Logger(CustomerService.name);

  constructor(
    @InjectKnex() private readonly knex: Knex,
    private readonly docNumber: DocNumberService,
  ) {}

  /**
   * Create a new customer with generated customer code.
   */
  async create(data: {
    customerCode: string;
    businessName: string;
    contactPerson?: string;
    phone: string;
    whatsappNo?: string;
    billingAddress: string;
    defaultSiteId?: string;
    gstin?: string;
    stateCode: string;
    creditLimit?: number;
    creditDays?: number;
    maxOverdueDays?: number;
    preferredDeliveryWindow?: string;
    priceTier?: string;
    isActive?: boolean;
    gpsLatLng?: string;
    userId: string;
  }) {
    const code = await this.docNumber.next('CUSTOMER', null, null);

    const [customer] = await this.knex('customers')
      .insert({
        customer_code: code,
        business_name: data.businessName,
        contact_person: data.contactPerson,
        phone: data.phone,
        whatsapp_no: data.whatsappNo,
        billing_address: data.billingAddress,
        default_site_id: data.defaultSiteId,
        gstin: data.gstin,
        state_code: data.stateCode,
        credit_limit: data.creditLimit ?? 100000,
        credit_days: data.creditDays ?? 15,
        max_overdue_days: data.maxOverdueDays ?? 15,
        preferred_delivery_window: data.preferredDeliveryWindow,
        price_tier: data.priceTier ?? 'STANDARD',
        is_active: data.isActive ?? true,
        gps_lat_lng: data.gpsLatLng ? JSON.parse(data.gpsLatLng) : null,
        created_by: data.userId,
        updated_by: data.userId,
      })
      .returning('*');

    this.logger.log(`Created customer ${code}: ${data.businessName}`);
    return customer;
  }

  /**
   * List customers with optional site scoping.
   */
  async findAll(filters: {
    siteId?: string;
    isActive?: boolean;
    search?: string;
  }) {
    const validSiteId =
      filters.siteId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(filters.siteId)
        ? filters.siteId
        : undefined;
    const query = this.knex('customers').select('*');

    if (validSiteId) {
      query.where('default_site_id', validSiteId);
    }
    if (filters.isActive !== undefined) {
      query.where('is_active', filters.isActive);
    }
    if (filters.search) {
      query.andWhere((qb) => {
        qb.whereILike('business_name', `%${filters.search}%`)
          .orWhereILike('customer_code', `%${filters.search}%`)
          .orWhereILike('phone', `%${filters.search}%`);
      });
    }

    return query.orderBy('created_at', 'desc');
  }

  /**
   * Get customer by ID.
   */
  async findById(id: string) {
    const customer = await this.knex('customers').where('id', id).first();
    if (!customer) throw new NotFoundException(`Customer ${id} not found`);
    return customer;
  }

  /**
   * Update customer profile (OPS_COORD or OWNER).
   */
  async update(
    id: string,
    data: Partial<{
      businessName: string;
      contactPerson: string;
      phone: string;
      whatsappNo: string;
      billingAddress: string;
      defaultSiteId: string;
      gstin: string;
      stateCode: string;
      preferredDeliveryWindow: string;
      priceTier: string;
      creditLimit: string | number;
      creditDays: number;
      creditHold: boolean;
      isActive: boolean;
      gpsLatLng: string;
      userId: string;
    }>,
  ) {
    const updateData: any = { updated_by: data.userId, updated_at: new Date() };

    if (data.businessName) updateData.business_name = data.businessName;
    if (data.contactPerson) updateData.contact_person = data.contactPerson;
    if (data.phone) updateData.phone = data.phone;
    if (data.whatsappNo !== undefined) updateData.whatsapp_no = data.whatsappNo;
    if (data.billingAddress) updateData.billing_address = data.billingAddress;
    if (data.defaultSiteId) updateData.default_site_id = data.defaultSiteId;
    if (data.gstin !== undefined) updateData.gstin = data.gstin;
    if (data.stateCode) updateData.state_code = data.stateCode;
    if (data.preferredDeliveryWindow !== undefined)
      updateData.preferred_delivery_window = data.preferredDeliveryWindow;
    if (data.priceTier) updateData.price_tier = data.priceTier;
    if (data.creditLimit !== undefined) updateData.credit_limit = String(data.creditLimit);
    if (data.creditDays !== undefined) updateData.credit_days = Number(data.creditDays);
    if (data.creditHold !== undefined) updateData.credit_hold = Boolean(data.creditHold);
    if (data.isActive !== undefined) updateData.is_active = data.isActive;
    if (data.gpsLatLng !== undefined)
      updateData.gps_lat_lng = data.gpsLatLng
        ? JSON.parse(data.gpsLatLng)
        : null;

    const [customer] = await this.knex('customers')
      .where('id', id)
      .update(updateData)
      .returning('*');

    if (!customer) throw new NotFoundException(`Customer ${id} not found`);
    return customer;
  }

  /**
   * Credit override (OWNER only) - update credit limit, days, hold flag.
   */
  async overrideCredit(
    id: string,
    data: {
      creditLimit: number;
      creditDays: number;
      maxOverdueDays?: number;
      creditHold?: boolean;
      userId: string;
    },
  ) {
    const [customer] = await this.knex('customers')
      .where('id', id)
      .update({
        credit_limit: data.creditLimit,
        credit_days: data.creditDays,
        max_overdue_days: data.maxOverdueDays ?? 15,
        credit_hold: data.creditHold ?? false,
        updated_by: data.userId,
        updated_at: new Date(),
      })
      .returning('*');

    if (!customer) throw new NotFoundException(`Customer ${id} not found`);
    this.logger.log(`Credit overridden for customer ${id} by ${data.userId}`);
    return customer;
  }

  /**
   * Add a contact to customer.
   */
  async addContact(
    customerId: string,
    data: {
      name: string;
      phone: string;
      role: string;
      isPrimary?: boolean;
      userId: string;
    },
  ) {
    await this.findById(customerId);

    // If this is primary, unset other primaries
    if (data.isPrimary) {
      await this.knex('customer_contacts')
        .where('customer_id', customerId)
        .update({ is_primary: false });
    }

    const [contact] = await this.knex('customer_contacts')
      .insert({
        customer_id: customerId,
        name: data.name,
        phone: data.phone,
        role: data.role,
        is_primary: data.isPrimary ?? false,
        created_by: data.userId,
        updated_by: data.userId,
      })
      .returning('*');

    return contact;
  }

  /**
   * Get customer contacts.
   */
  async getContacts(customerId: string) {
    await this.findById(customerId);
    return this.knex('customer_contacts')
      .where('customer_id', customerId)
      .orderBy('is_primary', 'desc')
      .orderBy('created_at', 'desc');
  }

  /**
   * Log communication.
   */
  async logCommunication(
    customerId: string,
    data: {
      channel: string;
      note: string;
      userId: string;
    },
  ) {
    await this.findById(customerId);

    if (!['CALL', 'WHATSAPP', 'VISIT'].includes(data.channel)) {
      throw new BadRequestException(`Invalid channel: ${data.channel}`);
    }

    const [log] = await this.knex('communication_log')
      .insert({
        customer_id: customerId,
        channel: data.channel,
        note: data.note,
        user_id: data.userId,
        created_by: data.userId,
        updated_by: data.userId,
      })
      .returning('*');

    return log;
  }

  /**
   * Get communication log for customer.
   */
  async getCommunicationLog(customerId: string, limit = 50) {
    await this.findById(customerId);
    return this.knex('communication_log')
      .where('customer_id', customerId)
      .orderBy('at', 'desc')
      .limit(limit);
  }

  /**
   * Get price memory for customer+item (last 5 confirmed sales).
   */
  async getPriceMemory(customerId: string, itemId: string, limit = 5) {
    const rows = await this.knex('sales_orders as so')
      .join('sales_order_lines as sol', 'so.id', 'sol.order_id')
      .where('so.customer_id', customerId)
      .where('sol.item_id', itemId)
      .where('so.order_status', 'CONFIRMED')
      .orderBy('so.created_at_idx', 'desc')
      .limit(limit)
      .select(
        'so.created_at_idx as date',
        'so.id as orderId',
        'sol.ordered_qty as qty',
        'sol.quoted_unit_price as unitPrice',
      );

    return rows.map((r) => ({
      date: r.date,
      qty: r.qty,
      unitPrice: r.unitPrice,
      orderId: r.orderId,
    }));
  }
}
