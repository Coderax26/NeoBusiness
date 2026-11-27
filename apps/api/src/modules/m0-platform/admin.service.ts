import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import type { Knex } from 'knex';
import { InjectKnex } from 'nestjs-knex';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { ConfigService } from './config.service.js';
import {
  CreateUserDto,
  UpdateUserDto,
  CreateSiteDto,
  UpdateSiteDto,
  CreateLocationDto,
  UpdateBusinessRuleDto,
  UpdateApprovalPolicyDto,
} from './dto/admin.dto.js';

@Injectable()
export class AdminService {
  constructor(
    @InjectKnex() private readonly knex: Knex,
    private readonly configService: ConfigService,
  ) {}

  // ─── Users Management ───────────────────────────────────────────────────────

  async listUsers(filter: {
    role?: string;
    siteId?: string;
    isActive?: boolean | string;
    search?: string;
  }) {
    let query = this.knex('users as u')
      .leftJoin('sites as s', 'u.assigned_site_id', 's.id')
      .select(
        'u.id',
        'u.full_name',
        'u.phone',
        'u.role',
        'u.assigned_site_id',
        's.name as assigned_site_name',
        'u.preferred_language',
        'u.is_active',
        'u.last_login_at',
        'u.created_at',
        'u.updated_at',
        this.knex.raw('(u.pin_hash IS NOT NULL OR u.password_hash IS NOT NULL) as has_pin'),
      );

    if (filter.role) {
      query = query.where('u.role', filter.role);
    }
    if (filter.siteId) {
      query = query.where('u.assigned_site_id', filter.siteId);
    }
    if (filter.isActive !== undefined && filter.isActive !== '') {
      const active =
        filter.isActive === true || filter.isActive === 'true' || filter.isActive === '1';
      query = query.where('u.is_active', active);
    }
    if (filter.search) {
      const term = `%${filter.search}%`;
      query = query.where((q) => {
        q.whereILike('u.full_name', term).orWhereILike('u.phone', term);
      });
    }

    return query.orderBy('u.created_at', 'desc');
  }

  async getUserById(id: string) {
    const user = await this.knex('users as u')
      .leftJoin('sites as s', 'u.assigned_site_id', 's.id')
      .where('u.id', id)
      .select(
        'u.id',
        'u.full_name',
        'u.phone',
        'u.role',
        'u.assigned_site_id',
        's.name as assigned_site_name',
        'u.preferred_language',
        'u.is_active',
        'u.last_login_at',
        'u.created_at',
        'u.updated_at',
      )
      .first();

    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }

    const sites = await this.knex('user_site_access as usa')
      .join('sites as s', 'usa.site_id', 's.id')
      .where('usa.user_id', id)
      .select('s.id', 's.name', 's.site_type');

    return { ...user, sites };
  }

  async createUser(dto: CreateUserDto, creatorId?: string) {
    const existing = await this.knex('users').where('phone', dto.phone).first();
    if (existing) {
      throw new ConflictException(`User with phone ${dto.phone} already exists`);
    }

    const id = uuidv4();
    const pinHash = dto.pin ? await bcrypt.hash(dto.pin, 10) : null;
    const passwordHash = dto.password ? await bcrypt.hash(dto.password, 10) : null;

    const [user] = await this.knex('users')
      .insert({
        id,
        full_name: dto.fullName,
        phone: dto.phone,
        role: dto.role,
        assigned_site_id: dto.assignedSiteId || null,
        pin_hash: pinHash,
        password_hash: passwordHash,
        preferred_language: dto.preferredLanguage || 'en',
        is_active: true,
        created_by: creatorId || null,
        updated_by: creatorId || null,
      })
      .returning([
        'id',
        'full_name',
        'phone',
        'role',
        'assigned_site_id',
        'preferred_language',
        'is_active',
        'created_at',
      ]);

    if (dto.assignedSiteId) {
      await this.knex('user_site_access')
        .insert({
          user_id: id,
          site_id: dto.assignedSiteId,
          granted_by: creatorId || null,
        })
        .onConflict(['user_id', 'site_id'])
        .ignore();
    }

    return user;
  }

  async updateUser(id: string, dto: UpdateUserDto, updaterId?: string) {
    const user = await this.knex('users').where('id', id).first();
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }

    const updateData: any = {
      updated_at: new Date(),
      updated_by: updaterId || null,
    };

    if (dto.fullName !== undefined) updateData.full_name = dto.fullName;
    if (dto.role !== undefined) updateData.role = dto.role;
    if (dto.assignedSiteId !== undefined) updateData.assigned_site_id = dto.assignedSiteId;
    if (dto.isActive !== undefined) updateData.is_active = dto.isActive;
    if (dto.preferredLanguage !== undefined) updateData.preferred_language = dto.preferredLanguage;

    const [updated] = await this.knex('users')
      .where('id', id)
      .update(updateData)
      .returning([
        'id',
        'full_name',
        'phone',
        'role',
        'assigned_site_id',
        'preferred_language',
        'is_active',
        'updated_at',
      ]);

    if (dto.assignedSiteId) {
      await this.knex('user_site_access')
        .insert({
          user_id: id,
          site_id: dto.assignedSiteId,
          granted_by: updaterId || null,
        })
        .onConflict(['user_id', 'site_id'])
        .ignore();
    }

    return updated;
  }

  async resetPin(id: string, pin: string, updaterId?: string) {
    const user = await this.knex('users').where('id', id).first();
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }

    const pinHash = await bcrypt.hash(pin, 10);
    await this.knex('users')
      .where('id', id)
      .update({
        pin_hash: pinHash,
        password_hash: null,
        updated_at: new Date(),
        updated_by: updaterId || null,
      });

    return { message: 'PIN reset successfully', userId: id };
  }

  // ─── Sites & Locations ──────────────────────────────────────────────────────

  async listSites(includeInactive = false) {
    let query = this.knex('sites').select('*');
    if (!includeInactive) {
      query = query.where('is_active', true);
    }
    return query.orderBy('name', 'asc');
  }

  async createSite(dto: CreateSiteDto, creatorId?: string) {
    const [site] = await this.knex('sites')
      .insert({
        id: uuidv4(),
        name: dto.name,
        site_type: dto.siteType,
        address: dto.address || null,
        is_active: true,
        created_by: creatorId || null,
        updated_by: creatorId || null,
      })
      .returning('*');
    return site;
  }

  async updateSite(id: string, dto: UpdateSiteDto, updaterId?: string) {
    const site = await this.knex('sites').where('id', id).first();
    if (!site) {
      throw new NotFoundException(`Site ${id} not found`);
    }

    const updateData: any = {
      updated_at: new Date(),
      updated_by: updaterId || null,
    };
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.siteType !== undefined) updateData.site_type = dto.siteType;
    if (dto.address !== undefined) updateData.address = dto.address;
    if (dto.isActive !== undefined) updateData.is_active = dto.isActive;

    const [updated] = await this.knex('sites').where('id', id).update(updateData).returning('*');
    return updated;
  }

  async listLocations(siteId?: string) {
    const validSiteId =
      siteId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(siteId)
        ? siteId
        : undefined;
    let query = this.knex('locations as l')
      .join('sites as s', 'l.site_id', 's.id')
      .select('l.*', 's.name as site_name');

    if (validSiteId) {
      query = query.where('l.site_id', validSiteId);
    }
    return query.where('l.is_active', true).orderBy('l.name', 'asc');
  }

  async createLocation(dto: CreateLocationDto, creatorId?: string) {
    const site = await this.knex('sites').where('id', dto.siteId).first();
    if (!site) {
      throw new NotFoundException(`Site ${dto.siteId} not found`);
    }

    const [loc] = await this.knex('locations')
      .insert({
        id: uuidv4(),
        site_id: dto.siteId,
        name: dto.name,
        location_type: dto.locationType,
        vehicle_id: dto.vehicleId || null,
        is_active: true,
        created_by: creatorId || null,
        updated_by: creatorId || null,
      })
      .returning('*');
    return loc;
  }

  // ─── Roles & Permissions ────────────────────────────────────────────────────

  async listRoles() {
    const rows = await this.knex('role_permissions')
      .select('role', 'permission_code', 'scope')
      .orderBy('role', 'asc')
      .orderBy('permission_code', 'asc');

    const roleMap = new Map<string, { role: string; permissions: string[] }>();
    for (const r of rows) {
      if (!roleMap.has(r.role)) {
        roleMap.set(r.role, { role: r.role, permissions: [] });
      }
      roleMap.get(r.role)!.permissions.push(r.permission_code);
    }

    return Array.from(roleMap.values());
  }

  // ─── Business Rules & Approvals Config ──────────────────────────────────────

  async listBusinessRules() {
    return this.knex('business_rule_config').select('*').orderBy('key', 'asc');
  }

  async updateBusinessRule(key: string, dto: UpdateBusinessRuleDto, updaterId?: string) {
    const existing = await this.knex('business_rule_config').where('key', key).first();
    if (!existing) {
      throw new NotFoundException(`Business rule config '${key}' not found`);
    }

    const valueJson =
      typeof dto.valueJson === 'object' ? JSON.stringify(dto.valueJson) : dto.valueJson;

    const [updated] = await this.knex('business_rule_config')
      .where('key', key)
      .update({
        value_json: valueJson,
        description: dto.description || existing.description,
        updated_by: updaterId || null,
        updated_at: new Date(),
      })
      .returning('*');

    this.configService.invalidate(key);
    return updated;
  }

  async listApprovalPolicies() {
    return this.knex('approval_policies as ap')
      .leftJoin('users as u1', 'ap.delegate_user_id', 'u1.id')
      .leftJoin('users as u2', 'ap.second_escalation_user_id', 'u2.id')
      .select(
        'ap.*',
        'u1.full_name as delegate_user_name',
        'u2.full_name as second_escalation_user_name',
      )
      .orderBy('ap.exception_type', 'asc');
  }

  async updateApprovalPolicy(
    exceptionType: string,
    dto: UpdateApprovalPolicyDto,
    updaterId?: string,
  ) {
    const policy = await this.knex('approval_policies')
      .where('exception_type', exceptionType)
      .first();
    if (!policy) {
      throw new NotFoundException(`Approval policy for '${exceptionType}' not found`);
    }

    const updateData: any = {
      updated_at: new Date(),
      updated_by: updaterId || null,
    };

    if (dto.canDelegate !== undefined) updateData.can_delegate = dto.canDelegate;
    if (dto.delegateUserId !== undefined) updateData.delegate_user_id = dto.delegateUserId;
    if (dto.delegateValueCapInr !== undefined) {
      updateData.delegate_value_cap_inr = dto.delegateValueCapInr;
    }
    if (dto.escalationWaitMinutes !== undefined) {
      updateData.escalation_wait_minutes = dto.escalationWaitMinutes;
    }
    if (dto.secondEscalationUserId !== undefined) {
      updateData.second_escalation_user_id = dto.secondEscalationUserId;
    }

    const [updated] = await this.knex('approval_policies')
      .where('exception_type', exceptionType)
      .update(updateData)
      .returning('*');

    return updated;
  }

  async listDocSequences() {
    return this.knex('doc_sequences').select('*').orderBy('doc_type', 'asc');
  }

  async getCompanyProfile() {
    const row = await this.knex('business_rule_config')
      .where({ key: 'COMPANY_PROFILE', scope: 'GLOBAL' })
      .first();
    const defaults = {
      legalName: 'NeoAgro Dairy & Feeds Pvt. Ltd.',
      gstin: '27AAACN1234F1Z5',
      pan: 'AAACN1234F',
      timezone: 'Asia/Kolkata',
    };
    if (!row?.value_json) return defaults;
    return { ...defaults, ...(row.value_json as Record<string, unknown>) };
  }

  async updateCompanyProfile(body: Record<string, unknown>, updaterId?: string) {
    const current = await this.getCompanyProfile();
    const next = { ...current, ...body };
    const exists = await this.knex('business_rule_config')
      .where({ key: 'COMPANY_PROFILE', scope: 'GLOBAL' })
      .first();
    if (exists) {
      await this.knex('business_rule_config')
        .where({ key: 'COMPANY_PROFILE', scope: 'GLOBAL' })
        .update({
          value_json: next,
          updated_by: updaterId || null,
          updated_at: new Date(),
        });
    } else {
      await this.knex('business_rule_config').insert({
        key: 'COMPANY_PROFILE',
        value_json: next,
        scope: 'GLOBAL',
        scope_ref: null,
        description: 'Company legal profile & invoice header',
        updated_by: updaterId || null,
        updated_at: new Date(),
      });
    }
    return { ...next, updatedAt: new Date().toISOString() };
  }

  async listNotificationTemplates() {
    let rows = await this.knex('notification_templates').orderBy('code', 'asc');
    if (rows.length === 0) {
      const defaults = [
        {
          id: uuidv4(),
          code: 'ORDER_CONFIRM_WA',
          channel: 'WHATSAPP',
          language: 'en',
          title: 'Order Confirmed',
          body: 'Dear {{customer}}, order {{order_no}} for ₹{{amount}} is confirmed.',
          wa_template_id: 'WA_TMPL_901',
          is_active: true,
        },
        {
          id: uuidv4(),
          code: 'OTP_LOGIN_SMS',
          channel: 'SMS',
          language: 'en',
          title: 'Login Verification PIN',
          body: 'Your NeoBus verification OTP is {{otp}}.',
          wa_template_id: 'DLT_1107169',
          is_active: true,
        },
      ];
      for (const tpl of defaults) {
        const exists = await this.knex('notification_templates').where({ code: tpl.code }).first();
        if (!exists) {
          await this.knex('notification_templates').insert(tpl);
        }
      }
      rows = await this.knex('notification_templates').orderBy('code', 'asc');
    }
    return { data: rows };
  }

  async updateNotificationTemplate(code: string, body: Record<string, unknown>) {
    const updateData: Record<string, unknown> = {};
    if (body.channel !== undefined) updateData.channel = body.channel;
    if (body.language !== undefined) updateData.language = body.language;
    if (body.title !== undefined) updateData.title = body.title;
    if (body.body !== undefined) updateData.body = body.body;
    if (body.wa_template_id !== undefined || body.providerId !== undefined) {
      updateData.wa_template_id = body.wa_template_id ?? body.providerId;
    }
    if (body.is_active !== undefined) updateData.is_active = body.is_active;

    const existing = await this.knex('notification_templates').where({ code }).first();
    if (existing) {
      const [updated] = await this.knex('notification_templates')
        .where({ code })
        .update(updateData)
        .returning('*');
      return { ...updated, updatedAt: new Date().toISOString() };
    }
    const [inserted] = await this.knex('notification_templates')
      .insert({
        id: uuidv4(),
        code,
        channel: String(body.channel || 'WHATSAPP'),
        language: String(body.language || 'en'),
        title: String(body.title || code),
        body: String(body.body || ''),
        wa_template_id: (body.wa_template_id ?? body.providerId ?? null) as string | null,
        is_active: body.is_active !== undefined ? Boolean(body.is_active) : true,
      })
      .returning('*');
    return { ...inserted, updatedAt: new Date().toISOString() };
  }

  async getSystemHealth() {
    let dbOk = true;
    try {
      await this.knex.raw('SELECT 1');
    } catch {
      dbOk = false;
    }
    const [outboxRes, queuedNotifRes, failedNotifRes] = await Promise.all([
      this.knex('outbox_events').whereNull('published_at').count('* as c').first(),
      this.knex('notification_outbox').where('status', 'QUEUED').count('* as c').first(),
      this.knex('notification_outbox').where('status', 'FAILED').count('* as c').first(),
    ]);
    return {
      status: dbOk ? 'HEALTHY' : 'DEGRADED',
      dbConnected: dbOk,
      outboxQueueDepth: Number((outboxRes as any)?.c ?? 0) + Number((queuedNotifRes as any)?.c ?? 0),
      failedNotificationsCount: Number((failedNotifRes as any)?.c ?? 0),
      lastCheckedAt: new Date().toISOString(),
      version: '0.7.0',
    };
  }

  async getRolloutConfig() {
    const row = await this.knex('business_rule_config')
      .where({ key: 'ROLLOUT_CONFIG', scope: 'GLOBAL' })
      .first();
    const defaults = {
      releaseStage: 'R3',
      budgets: [
        { metric: 'API P95 Latency', current: '48 ms', budget: '< 250 ms' },
        { metric: 'Web First Load JS', current: '103 kB', budget: '< 200 kB' },
        { metric: 'UAT SUS Score', current: '84 / 100', budget: '>= 75' },
        { metric: 'Zero Mock Policy', current: '100% Live', budget: '100%' },
      ],
      scenarios: [
        { id: 'E1', name: 'Quote -> Order -> Dispatch -> Invoice -> Collection', phases: 'F4, F8, F9', status: 'PASS' },
        { id: 'E2', name: 'Requisition -> PO -> Blind GRN -> Supplier Bill 3-Way', phases: 'F5, F6', status: 'PASS' },
        { id: 'E3', name: 'BOM -> Work Order -> Consumption -> Output -> Stock', phases: 'F7, F6', status: 'PASS' },
        { id: 'E4', name: 'Owner Control Tower Pulse & Exception Approval', phases: 'F10, F0', status: 'PASS' },
      ],
      setupSteps: [],
    };
    if (!row?.value_json) return defaults;
    return { ...defaults, ...(row.value_json as Record<string, unknown>) };
  }

  async updateRolloutConfig(body: Record<string, unknown>, updaterId?: string) {
    const current = await this.getRolloutConfig();
    const next = { ...current, ...body };
    const exists = await this.knex('business_rule_config')
      .where({ key: 'ROLLOUT_CONFIG', scope: 'GLOBAL' })
      .first();
    if (exists) {
      await this.knex('business_rule_config')
        .where({ key: 'ROLLOUT_CONFIG', scope: 'GLOBAL' })
        .update({
          value_json: next,
          updated_by: updaterId || null,
          updated_at: new Date(),
        });
    } else {
      await this.knex('business_rule_config').insert({
        key: 'ROLLOUT_CONFIG',
        value_json: next,
        scope: 'GLOBAL',
        scope_ref: null,
        description: 'Rollout readiness & setup wizard progress',
        updated_by: updaterId || null,
        updated_at: new Date(),
      });
    }
    return next;
  }
}

