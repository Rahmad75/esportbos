import dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import * as schema from './schema.js';

dotenv.config();

declare global {
  var _postgresClient: Sql | undefined;
  var _postgresClientUrl: string | undefined;
}

export function readCleanDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL || '';
  return raw.trim().replace(/^["']|["']$/g, '');
}

export function isDatabaseConfigured(): boolean {
  return Boolean(readCleanDatabaseUrl());
}

function parseSupabaseConnection(rawUrl: string): {
  connectionString: string;
  ssl: false | { rejectUnauthorized: false };
} {
  if (!rawUrl) {
    return {
      connectionString: 'postgresql://postgres:postgres@127.0.0.1:5432/postgres',
      ssl: false
    };
  }

  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    const sslMode = (parsed.searchParams.get('sslmode') || '').toLowerCase();

    // Hapus sslmode dari query string agar opsi ssl: { rejectUnauthorized: false } dipakai konsisten
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

export const createClient = (): Sql => {
  const cleanUrl = readCleanDatabaseUrl();
  if (!global._postgresClient || (cleanUrl && global._postgresClientUrl !== cleanUrl)) {
    if (!cleanUrl) {
      console.warn('[Database] DATABASE_URL belum diatur di Environment Variables.');
    }

    const { connectionString, ssl } = parseSupabaseConnection(cleanUrl);
    const isVercel = Boolean(process.env.VERCEL);

    global._postgresClient = postgres(connectionString, {
      prepare: false, // Wajib false untuk Supabase Transaction Pooler (port 6543)
      ssl,
      max: isVercel ? 1 : 10,
      idle_timeout: isVercel ? 20 : 30,
      connect_timeout: isVercel ? 7 : 15
    });
    global._postgresClientUrl = cleanUrl;
  }
  return global._postgresClient;
};

const client = createClient();
export const db = drizzle(client, { schema });
export { client };
