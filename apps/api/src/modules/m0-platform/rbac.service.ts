import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Knex } from 'knex';
import { InjectKnex } from 'nestjs-knex';

export const PERMISSIONS_METADATA = 'permissions';

/**
 * Decorator to require permissions on a controller method.
 * Usage: @RequirePermission('order.create', 'order.confirm_in_band')
 */
export function RequirePermission(...permissions: string[]) {
  return (target: object, key: string | symbol, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata(PERMISSIONS_METADATA, permissions, descriptor.value);
  };
}

/**
 * Permission matrix loaded from role_permissions table.
 * Cached; refreshed on config change.
 */
@Injectable()
export class PermissionService {
  private cache = new Map<string, Set<string>>();
  private loadedAt = 0;
  private readonly ttl = 60 * 1000; // 1 minute

  constructor(@InjectKnex() private readonly knex: Knex) {}

  async getPermissions(role: string): Promise<Set<string>> {
    const now = Date.now();
    const cached = this.cache.get(role);
    if (cached && now - this.loadedAt < this.ttl) {
      return cached;
    }

    const rows = await this.knex('role_permissions')
      .where('role', role)
      .select('permission_code');

    const perms = new Set(rows.map((r) => r.permission_code));
    this.cache.set(role, perms);
    this.loadedAt = now;
    return perms;
  }

  async hasPermission(role: string, permission: string): Promise<boolean> {
    const perms = await this.getPermissions(role);
    return perms.has(permission);
  }

  async hasPermissions(role: string, permissions: string[]): Promise<boolean> {
    const perms = await this.getPermissions(role);
    return permissions.every((p) => perms.has(p));
  }

  invalidate(): void {
    this.cache.clear();
    this.loadedAt = 0;
  }
}

/**
 * Guard that enforces RBAC permissions.
 */
@Injectable()
export class RbacGuard implements CanActivate {
  private readonly logger = new Logger(RbacGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly permissionService: PermissionService,
  ) {}

  async activate(ctx: ExecutionContext): Promise<boolean> {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // Owner has all permissions
    if (user.role === 'OWNER') {
      return true;
    }

    // Get required permissions from decorator
    const requiredPermissions = this.reflector.get<string[]>(
      PERMISSIONS_METADATA,
      ctx.getHandler(),
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true; // no permissions required
    }

    const hasAll = await this.permissionService.hasPermissions(user.role, requiredPermissions);
    if (!hasAll) {
      throw new ForbiddenException(
        `Insufficient permissions. Required: ${requiredPermissions.join(', ')}`,
      );
    }

    return true;
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    return this.activate(ctx);
  }
}