// apps/server/src/db.ts
// PostgreSQL ulanishi va tranzaksiya yordamchisi.
// Barcha o'yin holatini o'zgartiradigan amallar tx() ichida bajariladi.

import pg from 'pg';

export type Db = pg.Pool;
export interface Tx {
  query<R = Record<string, any>>(text: string, params?: unknown[]): Promise<{ rows: R[]; rowCount: number | null }>;
}

export function createPool(url: string, max: number): Db {
  const pool = new pg.Pool({ connectionString: url, max });
  pool.on('error', err => console.error('[db] kutilmagan xato', err));
  return pool;
}

/** Serializatsiya to'qnashuvi yoki deadlock bo'lsa 3 martagacha qayta uriniladi. */
export async function tx<T>(pool: Db, fn: (t: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const out = await fn(client as unknown as Tx);
      await client.query('COMMIT');
      return out;
    } catch (e: any) {
      await client.query('ROLLBACK').catch(() => {});
      if ((e?.code === '40001' || e?.code === '40P01') && attempt < 3) continue;
      throw e;
    } finally {
      client.release();
    }
  }
}

export async function one<R = Record<string, any>>(t: Tx | Db, sql: string, params: unknown[] = []): Promise<R | undefined> {
  const r = await (t as Tx).query<R>(sql, params);
  return r.rows[0];
}

export async function many<R = Record<string, any>>(t: Tx | Db, sql: string, params: unknown[] = []): Promise<R[]> {
  const r = await (t as Tx).query<R>(sql, params);
  return r.rows;
}
