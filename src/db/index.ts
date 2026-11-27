import dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

dotenv.config();

declare global {
  var _postgresPool: Pool | undefined;
  var _postgresPoolUrl: string | undefined;
}

function readCleanDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL || '';
  return raw.trim().replace(/^["']|["']$/g, '');
}

function parseSupabaseConnection(rawUrl: string): {
  connectionString?: string;
  ssl: false | { rejectUnauthorized: false };
} {
  if (!rawUrl) {
    return { connectionString: undefined, ssl: false };
  }

  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    const sslMode = (parsed.searchParams.get('sslmode') || '').toLowerCase();

    // Hapus sslmode dari query string agar pg-connection-string tidak menimpa opsi ssl rejectUnauthorized: false
    parsed.searchParams.delete('sslmode');

    const useSsl = !isLocal && sslMode !== 'disable';
    return {
      connectionString: parsed.toString(),
      ssl: useSsl ? { rejectUnauthorized: false } : false
    };
  } catch {
    const isLocal = rawUrl.includes('localhost') || rawUrl.includes('127.0.0.1');
    return {
      connectionString: rawUrl,
      ssl: isLocal ? false : { rejectUnauthorized: false }
    };
  }
}

export const createPool = () => {
  const cleanUrl = readCleanDatabaseUrl();
  if (!global._postgresPool || (cleanUrl && global._postgresPoolUrl !== cleanUrl)) {
    if (!cleanUrl) {
      console.warn('[Database] DATABASE_URL belum diatur di Environment Variables.');
    }

    const { connectionString, ssl } = parseSupabaseConnection(cleanUrl);
    const isVercel = Boolean(process.env.VERCEL);

    global._postgresPool = new Pool({
      connectionString,
      ssl,
      max: isVercel ? 1 : 10,
      idleTimeoutMillis: isVercel ? 5000 : 30000,
      connectionTimeoutMillis: isVercel ? 7000 : 15000,
      allowExitOnIdle: isVercel
    });
    global._postgresPoolUrl = cleanUrl;

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL pool client:', err);
    });
  }
  return global._postgresPool;
};

const pool = createPool();
export const db = drizzle(pool, { schema });
