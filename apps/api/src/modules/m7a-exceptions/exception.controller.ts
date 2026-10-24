import { Controller, Get, Post, Body, Param, Query, UseGuards, Req, NotFoundException, ConflictException } from '@nestjs/common';
import { ExceptionService } from './exception.service.js';
import { JwtAuthGuard } from '../m0-platform/jwt-auth.guard.js';
import { RequirePermission } from '../m0-platform/rbac.service.js';

/**
 * Query DTO for listing exceptions.
 */
interface ListExceptionsQuery {
  status?: string;    // PENDING | APPROVED | REJECTED | COUNTERED | EXPIRED
  type?: string;      // exception type filter
  limit?: number;     // default 50
  offset?: number;    // default 0
}

/**
 * Payload for resolving an exception.
 */
interface ResolveExceptionDto {
  action: 'APPROVED' | 'REJECTED' | 'COUNTERED';
  remarks: string;
  counter?: Record<string, unknown>;  // e.g. { proposedPrice: '89.50' } for COUNTERED
}

/**
 * ExceptionController — Owner-facing Exception Card API.
 *
 * - GET   /api/v1/exceptions           List pending/resolved cards (RLS-scoped)
 * - GET   /api/v1/exceptions/{id}      Single card detail
 * - POST  /api/v1/exceptions/{id}/resolve   Resolve (approve / reject / counter)
 *
 * RBAC: only OWNER, OPS_COORD, and the delegate can resolve.
 * RLS: GET endpoints are scoped to the caller's site_ids automatically.
 */
@Controller('exceptions')
@UseGuards(JwtAuthGuard)
export class ExceptionController {
  constructor(private readonly exceptionSvc: ExceptionService) {}

  /**
   * GET /exceptions?status=pending&type=PRICE_OVERRIDE&limit=50&offset=0
   *
   * Returns exception cards filtered by the query, automatically scoped
   * to the caller's accessible sites via RLS (SET LOCAL app.site_ids
   * by the RlsContextMiddleware).
   */
  @Get()
  @RequirePermission('exception.read')
  async list(@Query() q: ListExceptionsQuery): Promise<any[]> {
    const limit = Math.min(q.limit ?? 50, 100);
    const offset = q.offset ?? 0;

    const query = this.exceptionSvc['knex']('exception_approvals')
      .orderBy('expires_at', 'asc')
      .limit(limit)
      .offset(offset);

    if (q.status) query.andWhere('status', q.status);
    if (q.type) query.andWhere('exception_type', q.type);

    // RLS automatically restricts to the caller's site_ids
    return query;
  }

  /**
   * GET /exceptions/{id}
   *
   * Returns full card detail including context_payload, policy, approver.
   * Enforced by RLS — the user can only see cards in their site scope.
   */
  @Get(':id')
  @RequirePermission('exception.read')
  async getOne(@Param('id') id: string): Promise<any> {
    const card = await this.exceptionSvc['knex']('exception_approvals')
      .where({ id })
      .first(
        'id',
        'exception_type',
        'reference_table',
        'reference_id',
        'context_payload_json',
        'status',
        'priority',
        'value_at_risk',
        'owner_remarks',
        'resolved_by',
        'resolved_at',
        'expires_at',
        'escalated_to',
        'created_at',
      );

    if (!card) {
      throw new NotFoundException(`Exception ${id} not found`);
    }

    return card;
  }

  /**
   * POST /exceptions/{id}/resolve
   *
   * { action: 'APPROVED' | 'REJECTED' | 'COUNTERED', remarks: '...', counter?: {...} }
   *
   * Idempotent: resolving an already-resolved card returns the current status.
   */
  @Post(':id/resolve')
  @RequirePermission('exception.resolve')
  async resolve(
    @Param('id') id: string,
    @Body() dto: ResolveExceptionDto,
  ): Promise<{ status: string; exceptionId: string }> {
    const finalStatus = await this.exceptionSvc.resolve(
      id,
      dto.action,
      dto.remarks,
      dto.counter,
    );

    return { status: finalStatus, exceptionId: id };
  }
}
