import { Injectable, OnModuleInit } from '@nestjs/common';
import type { Knex } from 'knex';
import { InjectKnex } from 'nestjs-knex';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Split a SQL script into individual statements.
 * Handles line comments, block comments, single-quoted string
 * literals, and dollar-quoted strings.
 */
function splitSql(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];

    // Line comment --
    if (ch === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end;
      continue;
    }

    // Block comment /* */
    if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }

    // Dollar-quoted string $tag$...$tag$ or $$...$$
    if (ch === '$') {
      let j = i + 1;
      while (j < sql.length && sql[j] === '$') {
        j++;
      }
      // j now points past the run of dollar signs
      let k = j;
      while (k < sql.length && /[A-Za-z0-9_]/.test(sql[k])) {
        k++;
      }
      // A valid opening tag is $tag$ (optional tag) or $$ (empty tag)
      let tag: string | null = null;
      if (k < sql.length && sql[k] === '$') {
        tag = sql.slice(i, k + 1); // e.g. $body$
      } else if (j > i + 1) {
        tag = sql.slice(i, j); // e.g. $$
      }
      if (tag) {
        const close = sql.indexOf(tag, i + tag.length);
        if (close !== -1) {
          current += sql.slice(i, close + tag.length);
          i = close + tag.length;
          continue;
        }
      }
    }

    // Single-quoted string '...' with '' escaping
    if (ch === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      current += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }

    // Statement terminator ;
    if (ch === ';') {
      current += ch;
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  // Remaining text
  const trimmed = current.trim();
  if (trimmed) statements.push(trimmed);

  return statements;
}

/**
 * MigrationService — runs SQL migrations from db/migrations/ directory.
 * Uses knex_migrations table to track which migrations have been applied.
 */
@Injectable()
export class MigrationService implements OnModuleInit {
  constructor(@InjectKnex() private readonly knex: Knex) {}

  async onModuleInit(): Promise<void> {
    await this.runMigrations();
  }

  /**
   * Run all pending migrations in order.
   */
  async runMigrations(): Promise<void> {
    await this.ensureMigrationsTable();

    const applied = await this.getAppliedMigrations();
    const appliedSet = new Set(applied);

    const migrationFiles = this.getMigrationFiles();

    for (const file of migrationFiles) {
      const migrationName = path.basename(file, '.sql');

      if (appliedSet.has(migrationName)) {
        continue;
      }

      console.log(`[Migration] Applying: ${migrationName}`);

      const sql = fs.readFileSync(file, 'utf-8');

      await this.knex.transaction(async (trx) => {
        const statements = splitSql(sql);
        for (const stmt of statements) {
          if (stmt.trim()) {
            await trx.raw(stmt);
          }
        }
        await trx('knex_migrations').insert({
          name: migrationName,
          batch: await this.getNextBatchNumber(trx),
          migration_time: new Date(),
        });
      });

      console.log(`[Migration] Applied: ${migrationName}`);
    }

    console.log('[Migration] All migrations up to date');
  }

  private async getAppliedMigrations(): Promise<string[]> {
    const rows = await this.knex('knex_migrations').select('name');
    return rows.map((r) => r.name);
  }

  private async getNextBatchNumber(trx: Knex.Transaction): Promise<number> {
    const row = await trx('knex_migrations').max('batch as maxBatch').first();
    return (row?.maxBatch ?? 0) + 1;
  }

  private async ensureMigrationsTable(): Promise<void> {
    const exists = await this.knex.schema.hasTable('knex_migrations');
    if (!exists) {
      await this.knex.schema.createTable('knex_migrations', (table) => {
        table.increments('id').primary();
        table.string('name').notNullable();
        table.integer('batch').notNullable();
        table.timestamp('migration_time').notNullable().defaultTo(this.knex.fn.now());
      });
    }
  }

  private getMigrationFiles(): string[] {
    const migrationsDir = path.resolve(process.cwd(), '..', '..', 'db', 'migrations');

    if (!fs.existsSync(migrationsDir)) {
      console.warn(`[Migration] Migrations directory not found: ${migrationsDir}`);
      return [];
    }

    const files = fs.readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => path.join(migrationsDir, f))
      .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));

    return files;
  }

  async getStatus(): Promise<{ applied: string[]; pending: string[] }> {
    await this.ensureMigrationsTable();
    const applied = await this.getAppliedMigrations();
    const allFiles = this.getMigrationFiles().map((f) => path.basename(f, '.sql'));
    const pending = allFiles.filter((f) => !applied.includes(f));
    return { applied, pending };
  }
}