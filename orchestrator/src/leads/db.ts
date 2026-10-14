import fs from 'node:fs';
import path from 'node:path';
import { SQLITE_SCHEMA } from './schema.ts';

/**
 * Ελάχιστο κοινό interface για SQLite (dry-run, τοπικά, tests) και Postgres (Supabase).
 * Placeholders πάντα `?`· ο driver Postgres τα μετατρέπει σε `$1, $2, …`.
 * JSON αποθηκεύεται ως κείμενο (στο Postgres το jsonb το δέχεται)· στην ανάγνωση γίνεται parse.
 */
export type Row = Record<string, unknown>;

export interface Db {
  readonly kind: 'sqlite' | 'postgres';
  all<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T = Row>(sql: string, params?: unknown[]): Promise<T | undefined>;
  run(sql: string, params?: unknown[]): Promise<number>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

type SqliteValue = null | number | bigint | string | Uint8Array;
const toSqlite = (v: unknown): SqliteValue => {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'bigint') return v;
  if (v instanceof Date) return v.toISOString();
  return JSON.stringify(v);
};

export async function openSqlite(file: string): Promise<Db> {
  const { DatabaseSync } = await import('node:sqlite');
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('pragma journal_mode = wal; pragma foreign_keys = on; pragma synchronous = normal;');
  db.exec(SQLITE_SCHEMA);
  let depth = 0;
  const api: Db = {
    kind: 'sqlite',
    async all<T>(sql: string, params: unknown[] = []) {
      return db.prepare(sql).all(...params.map(toSqlite)) as T[];
    },
    async get<T>(sql: string, params: unknown[] = []) {
      return db.prepare(sql).get(...params.map(toSqlite)) as T | undefined;
    },
    async run(sql: string, params: unknown[] = []) {
      return Number(db.prepare(sql).run(...params.map(toSqlite)).changes);
    },
    async transaction<T>(fn: () => Promise<T>) {
      if (depth > 0) return fn();
      depth++;
      db.exec('begin');
      try {
        const r = await fn();
        db.exec('commit');
        return r;
      } catch (err) {
        db.exec('rollback');
        throw err;
      } finally {
        depth--;
      }
    },
    async close() {
      db.close();
    },
  };
  return api;
}

/** Postgres (Supabase) μέσω απευθείας σύνδεσης. Το schema το φτιάχνουν τα migrations, όχι αυτός ο κώδικας. */
export async function openPostgres(connectionString: string): Promise<Db> {
  const pg = await import('pg');
  const pool = new pg.default.Pool({ connectionString, max: 4, ssl: { rejectUnauthorized: false } });
  let client: import('pg').PoolClient | null = null;
  const q = (sql: string) => {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  };
  const exec = async (sql: string, params: unknown[]) => {
    const values = params.map((v) => (v !== null && typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : v));
    return (client ?? pool).query(q(sql), values);
  };
  return {
    kind: 'postgres',
    async all<T>(sql: string, params: unknown[] = []) {
      return (await exec(sql, params)).rows as T[];
    },
    async get<T>(sql: string, params: unknown[] = []) {
      return (await exec(sql, params)).rows[0] as T | undefined;
    },
    async run(sql: string, params: unknown[] = []) {
      return (await exec(sql, params)).rowCount ?? 0;
    },
    async transaction<T>(fn: () => Promise<T>) {
      if (client) return fn();
      client = await pool.connect();
      try {
        await client.query('begin');
        const r = await fn();
        await client.query('commit');
        return r;
      } catch (err) {
        await client.query('rollback');
        throw err;
      } finally {
        client.release();
        client = null;
      }
    },
    async close() {
      await pool.end();
    },
  };
}

/** JSON πεδίο από τη βάση: στο SQLite είναι string, στο Postgres ήδη object. */
export function json<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  }
  return v as T;
}
