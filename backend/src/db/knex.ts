import { readdirSync } from 'node:fs';
import path from 'node:path';
import knex, { Knex } from 'knex';
import { env } from '../config/env';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Extension-agnostic migration source. Migrations are recorded by bare name
 * ("20250101000001_init"), so the same history is valid whether they were applied
 * via `tsx` (.ts, dev) or from the compiled build (.js, Docker/production).
 */
const migrationSource: Knex.MigrationSource<string> = {
  async getMigrations() {
    return readdirSync(MIGRATIONS_DIR)
      .filter((f) => /\.(ts|js)$/.test(f) && !f.endsWith('.d.ts'))
      .map((f) => f.replace(/\.(ts|js)$/, ''))
      .sort();
  },
  getMigrationName: (name) => name,
  getMigration: async (name) => require(path.join(MIGRATIONS_DIR, name)) as Knex.Migration,
};

export const dbConfig: Knex.Config = {
  client: 'mysql2',
  connection: {
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    timezone: 'Z',
    charset: 'utf8mb4',
  },
  pool: { min: 1, max: 15 },
  migrations: { migrationSource },
};

export const db: Knex = knex(dbConfig);
