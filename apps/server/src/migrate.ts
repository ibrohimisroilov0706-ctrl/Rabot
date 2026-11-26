// apps/server/src/migrate.ts
// db/migrations/*.sql fayllarini tartib bilan, har birini alohida tranzaksiyada qo'llaydi.
// Bir vaqtda ikki server ishga tushsa ham advisory lock tufayli migratsiya bir marta bajariladi.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './db.js';

export function defaultMigrationsDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // src/ yoki dist/ dan repo ildizidagi db/migrations ga
  return path.resolve(here, '../../../db/migrations');
}

export async function migrate(pool: Db, dir = defaultMigrationsDir()): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock(727274)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const done = new Set((await client.query<{ version: string }>('SELECT version FROM schema_migrations')).rows.map(r => r.version));
    const files = (await readdir(dir)).filter(f => /^\d+_.+\.sql$/.test(f)).sort();
    for (const f of files) {
      if (done.has(f)) continue;
      const sql = await readFile(path.join(dir, f), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [f]);
        await client.query('COMMIT');
        applied.push(f);
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`Migratsiya ${f} xato: ${(e as Error).message}`);
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(727274)').catch(() => {});
    client.release();
  }
  return applied;
}

// CLI: npm run migrate
if (/migrate\.(ts|js)$/.test(process.argv[1] ?? '')) {
  const { loadConfig } = await import('./config.js');
  const { createPool } = await import('./db.js');
  const cfg = loadConfig();
  const pool = createPool(cfg.DATABASE_URL, 2);
  const out = await migrate(pool, cfg.MIGRATIONS_DIR || undefined);
  console.log(out.length ? `Qo'llandi: ${out.join(', ')}` : 'Yangi migratsiya yo\'q');
  await pool.end();
}
