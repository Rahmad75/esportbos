import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

declare global {
  var _postgresPool: Pool | undefined;
}

function shouldUseSsl(connectionString: string): boolean {
  if (!connectionString) return false;
  try {
    const parsed = new URL(connectionString);
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
      return false;
    }
    if (parsed.searchParams.get('sslmode') === 'disable') {
      return false;
    }
    return true;
  } catch {
    return !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1');
  }
}

export const createPool = () => {
  if (!global._postgresPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      console.warn('[Database] DATABASE_URL is not set. Configure your Supabase PostgreSQL connection string in environment variables.');
    }

    const useSsl = shouldUseSsl(connectionString || '');
    global._postgresPool = new Pool({
      connectionString: connectionString || undefined,
      ssl: useSsl ? { rejectUnauthorized: false } : false,
      max: process.env.VERCEL ? 5 : 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000
    });

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL pool client:', err);
    });
  }
  return global._postgresPool;
};

const pool = createPool();
export const db = drizzle(pool, { schema });
