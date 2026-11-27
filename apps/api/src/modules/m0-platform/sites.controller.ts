import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Knex } from 'knex';
import { InjectKnex } from 'nestjs-knex';
import { JwtAuthGuard } from './jwt-auth.guard.js';

@ApiTags('sites')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sites')
export class SitesController {
  constructor(@InjectKnex() private readonly knex: Knex) {}

  @Get()
  @ApiOperation({ summary: 'List active sites visible to current user' })
  async listVisibleSites(
    @Req() req: any,
    @Query('fulfillmentOnly') fulfillmentOnly?: string,
  ) {
    const role = String(req.user?.role || '').toUpperCase();
    const userSiteIds: string[] = Array.isArray(req.user?.siteIds)
      ? req.user.siteIds.filter(Boolean)
      : [];

    let query = this.knex('sites')
      .where('is_active', true)
      .select(
        'id',
        'name',
        'site_type',
        'site_code',
        'gstin',
        'address',
        'is_fulfillment_site',
        'is_active',
      );

    if (role !== 'OWNER') {
      if (userSiteIds.length === 0) return [];
      query = query.whereIn('id', userSiteIds);
    }

    if (fulfillmentOnly === 'true') {
      query = query.where('is_fulfillment_site', true);
    }

    const rows = await query.orderBy('name', 'asc');
    return rows.map((s: any) => ({
      ...s,
      type: s.site_type,
      siteType: s.site_type,
      code: s.site_code || s.id?.slice(0, 6)?.toUpperCase(),
      isFulfillmentSite: Boolean(s.is_fulfillment_site),
    }));
  }
}
