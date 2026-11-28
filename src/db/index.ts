import { drizzle } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import * as schema from './schema.js';

function findDatabaseUrlEntry(): { key: string | null; value: string } {
  const candidates = ['DATABASE_URL', 'POSTGRES_PRISMA_URL', 'POSTGRES_URL', 'SUPABASE_DB_URL'];
  for (const name of candidates) {
    const val = process.env[name];
    if (typeof val === 'string' && val.trim()) {
      return { key: name, value: val };
    }
  }

  for (const [k, v] of Object.entries(process.env)) {
    const norm = k.trim().toUpperCase();
    if (candidates.includes(norm) && typeof v === 'string' && v.trim()) {
      return { key: k, value: v };
    }
  }

  return { key: null, value: '' };
}

const dbEnvKeys = Object.keys(process.env).filter((k) =>
  /DATABASE|POSTGRES|SUPABASE|DB_/i.test(k)
);
const initialDbEntry = findDatabaseUrlEntry();
console.log(
  'Cek URL:',
  initialDbEntry.value ? 'Ada' : 'Kosong',
  '| KeyDipakai:',
  initialDbEntry.key || '-',
  '| VERCEL_ENV:',
  process.env.VERCEL_ENV || 'non-vercel',
  '| KeyTerkait:',
  JSON.stringify(dbEnvKeys)
);

declare global {
  var _postgresClient: Sql | undefined;
  var _postgresClientUrl: string | undefined;
}

export function readCleanDatabaseUrl(): string {
  const { value } = findDatabaseUrlEntry();
  return value.trim().replace(/^["']|["']$/g, '');
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

    // Hapus parameter query khusus PgBouncer/Prisma/SSL agar postgres.js tidak mengirimkannya sebagai startup parameter Postgres
    for (const param of [
      'sslmode',
      'pgbouncer',
      'connection_limit',
      'pool_timeout',
      'connect_timeout',
      'schema',
      'supa'
    ]) {
      parsed.searchParams.delete(param);
    }

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
