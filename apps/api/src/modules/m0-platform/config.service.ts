import { Injectable, OnModuleInit } from '@nestjs/common';
import type { Knex } from 'knex';
import { InjectKnex } from 'nestjs-knex';

/**
 * ConfigService — reads configurable business thresholds from `business_rule_config`.
 * Caches values with TTL so DB hits are minimized; invalidated on config change.
 */
@Injectable()
export class ConfigService implements OnModuleInit {
  private cache = new Map<string, { value: unknown; expiresAt: number }>();
  private readonly defaultTtlMs = 5 * 60 * 1000; // 5 minutes

  constructor(@InjectKnex() private readonly knex: Knex) {}

  async onModuleInit(): Promise<void> {
    // Cache is warmed lazily on first access so migration order does not matter
    // (MigrationService runs its migrations in its own onModuleInit).
  }

  /**
   * Get a config value by key. Supports per-category overrides via scope.
   * @param key - Config key (e.g. 'min_margin_pct_default' or 'min_margin_pct_PROCESSED_FG')
   * @param scope - Scope to query: 'GLOBAL', 'SITE', or 'ITEM_CATEGORY'
   * @param scopeRef - Scope reference (site ID or category name) when scope is not GLOBAL
   */
  async get<T = unknown>(
    key: string,
    scope: 'GLOBAL' | 'SITE' | 'ITEM_CATEGORY' = 'GLOBAL',
    scopeRef?: string,
  ): Promise<T | null> {
    const cacheKey = scope === 'GLOBAL' ? key : `${key}:${scope}:${scopeRef}`;

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as T;
    }

    // Build query
    const query = this.knex('business_rule_config').where('key', key);

    if (scope === 'GLOBAL') {
      query.where('scope', 'GLOBAL');
    } else {
      query.where('scope', scope).andWhere('scope_ref', scopeRef);
    }

    const row = await query.first();

    if (!row) {
      // Fallback to global if category-specific not found
      if (scope !== 'GLOBAL') {
        return this.get<T>(key, 'GLOBAL');
      }
      return null;
    }

    // Parse JSON value
    let value = row.value_json;
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value);
      } catch {
        // Value is already a raw string
      }
    }

    // Cache it
    this.cache.set(cacheKey, {
      value,
      expiresAt: Date.now() + this.defaultTtlMs,
    });

    return value as T;
  }

  /**
   * Get a config value as a number (for thresholds like margin %, days, etc.)
   */
  async getNumber(
    key: string,
    scope: 'GLOBAL' | 'SITE' | 'ITEM_CATEGORY' = 'GLOBAL',
    scopeRef?: string,
  ): Promise<number | null> {
    const value = await this.get<unknown>(key, scope, scopeRef);
    if (value === null || value === undefined) return null;
    const num = Number(value);
    return Number.isNaN(num) ? null : num;
  }

  /**
   * Get a config value as a string.
   */
  async getString(
    key: string,
    scope: 'GLOBAL' | 'SITE' | 'ITEM_CATEGORY' = 'GLOBAL',
    scopeRef?: string,
  ): Promise<string | null> {
    const value = await this.get<unknown>(key, scope, scopeRef);
    if (value === null || value === undefined) return null;
    return String(value);
  }

  /**
   * Get the effective min margin for an item category.
   * Falls back to global default if no category override exists.
   */
  async getMinMarginPct(category?: string): Promise<number> {
    if (category) {
      const override = await this.getNumber(
        `min_margin_pct_${category}`,
        'ITEM_CATEGORY',
        category,
      );
      if (override !== null) return override;
    }
    const global = await this.getNumber('min_margin_pct_default', 'GLOBAL');
    return global ?? 0.1; // default 10%
  }

  /**
   * Invalidate cache for a specific key (called after config update).
   */
  invalidate(
    key: string,
    scope?: 'GLOBAL' | 'SITE' | 'ITEM_CATEGORY',
    scopeRef?: string,
  ): void {
    if (!scope) {
      // Invalidate all keys starting with this prefix
      for (const k of this.cache.keys()) {
        if (k.startsWith(key)) this.cache.delete(k);
      }
    } else {
      const cacheKey = scope === 'GLOBAL' ? key : `${key}:${scope}:${scopeRef}`;
      this.cache.delete(cacheKey);
    }
  }

  /**
   * Refresh entire cache from DB.
   */
  async refreshCache(): Promise<void> {
    this.cache.clear();
    const rows = await this.knex('business_rule_config').select(
      'key',
      'value_json',
      'scope',
      'scope_ref',
    );
    for (const row of rows) {
      const cacheKey =
        row.scope === 'GLOBAL'
          ? row.key
          : `${row.key}:${row.scope}:${row.scope_ref}`;
      const value =
        typeof row.value_json === 'string'
          ? JSON.parse(row.value_json)
          : row.value_json;
      this.cache.set(cacheKey, {
        value,
        expiresAt: Date.now() + this.defaultTtlMs,
      });
    }
  }
}
