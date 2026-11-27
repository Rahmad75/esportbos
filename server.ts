import cors, { type CorsOptions } from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import {
  createEconomyPgService,
  getLondonTimeInfo,
  mountEconomyRoutes
} from './src/services/economy-pg.js';

const rootDir = process.cwd();

const app = express();
app.set('trust proxy', 1);
const PORT = Number(process.env.PORT || 3000);

const ALLOWED_CORS_ORIGINS = new Set([
  'https://esportbos.com',
  'https://www.esportbos.com',
  'https://esportbos-i2du.vercel.app'
]);

function isTrustedCorsOrigin(origin: string, req?: Request): boolean {
  if (!origin || typeof origin !== 'string') return false;
  if (ALLOWED_CORS_ORIGINS.has(origin)) return true;

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }

  if (req) {
    const hostHeader = String(req.headers['x-forwarded-host'] || req.headers.host || '')
      .split(',')[0]
      .trim()
      .toLowerCase();
    if (hostHeader && parsed.host.toLowerCase() === hostHeader) {
      return true;
    }
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  }

  if (parsed.protocol === 'https:') {
    if (
      hostname === 'esportbos.com' ||
      hostname.endsWith('.esportbos.com') ||
      hostname.endsWith('.pages.dev') ||
      hostname.endsWith('.vercel.app') ||
      hostname.endsWith('.onrender.com') ||
      hostname.endsWith('.run.app') ||
      hostname.endsWith('.aistudio.google.com') ||
      hostname.endsWith('.googleusercontent.com') ||
      hostname.endsWith('.web.app') ||
      hostname.endsWith('.firebaseapp.com')
    ) {
      return true;
    }
  }

  return false;
}

const buildCorsOptions = (req: Request): CorsOptions => ({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (isTrustedCorsOrigin(origin, req)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Device-Id',
    'X-Requested-With',
    'X-Server-Sync-Ms'
  ],
  maxAge: 86400,
  optionsSuccessStatus: 204
});

// Middleware CORS dipasang paling atas (sebelum semua route) dan menangani preflight OPTIONS
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Vary', 'Origin');
  return cors(buildCorsOptions(req))(req, res, next);
});
app.options('*', (req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Vary', 'Origin');
  return cors(buildCorsOptions(req))(req, res, next);
});

const economyService = createEconomyPgService({
  rootDir
});

app.use(express.json({ limit: '3mb' }));

// Lindungi file internal server, source TypeScript backend, dan aturan security dari akses HTTP langsung
app.use((req: Request, res: Response, next: NextFunction) => {
  const reqPath = (req.path || '').toLowerCase();
  if (
    reqPath === '/src' ||
    reqPath.startsWith('/src/') ||
    reqPath === '/data' ||
    reqPath.startsWith('/data/') ||
    reqPath === '/drizzle' ||
    reqPath.startsWith('/drizzle/') ||
    reqPath === '/vercel.json' ||
    reqPath === '/economy-server.js' ||
    reqPath === '/server.js' ||
    reqPath === '/server.ts' ||
    reqPath === '/package.json' ||
    reqPath === '/package-lock.json' ||
    reqPath === '/bun.lock' ||
    reqPath === '/tsconfig.json' ||
    reqPath === '/eslint.config.mjs' ||
    reqPath === '/firestore.rules' ||
    reqPath === '/firebase-blueprint.json' ||
    reqPath === '/security_spec.md' ||
    reqPath.startsWith('/.')
  ) {
    return res.status(403).json({ error: 'Akses langsung ke file internal server ditolak.' });
  }
  return next();
});

app.use((req: Request, res: Response, next: NextFunction) => {
  const reqPath = (req.path || '').toLowerCase();
  if (
    reqPath.startsWith('/api/') ||
    reqPath.endsWith('.html') ||
    reqPath.endsWith('.js') ||
    reqPath.endsWith('.json') ||
    reqPath === '/'
  ) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  return next();
});

// Endpoint waktu server resmi (Europe/London DST-aware GMT/BST + UTC)
const handleGetServerTime = (_req: Request, res: Response) => {
  const info = getLondonTimeInfo(Date.now());
  return res.json({
    success: true,
    ...info
  });
};
app.get('/api/server-time', handleGetServerTime);
app.get('/api/economy/server-time', handleGetServerTime);

// Mount seluruh route ekonomi berbasis PostgreSQL Cloud SQL SEBELUM static middleware
mountEconomyRoutes(app, economyService);

app.post('/api/verify-captcha', async (req: Request, res: Response) => {
  try {
    const { token } = req.body || {};
    if (typeof token !== 'string' || !token.trim() || token.length > 4096) {
      return res.status(400).json({ success: false, error: 'Invalid captcha token' });
    }

    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (!secret) {
      return res.json({ success: true, mode: 'client-token-check' });
    }

    const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token.trim() })
    });
    if (!verifyRes.ok) {
      return res.status(502).json({ success: false, error: 'Captcha service unavailable' });
    }
    const result = (await verifyRes.json()) as { success?: boolean };
    return res.json({ success: Boolean(result.success) });
  } catch (err) {
    console.error('Captcha verify error:', err);
    return res.status(500).json({ success: false, error: 'Captcha verification failed' });
  }
});

app.post('/api/create-payment', (_req: Request, res: Response) => {
  return res.status(410).json({
    success: false,
    code: 'MANUAL_TOPUP_REQUIRED',
    error: 'Pembayaran otomatis dinonaktifkan. Gunakan halaman Pendanaan Klub untuk Top-Up QRIS DANA Bisnis / USDT Solana dengan verifikasi Admin.'
  });
});

app.use('/api', (req: Request, res: Response) => {
  return res.status(404).json({
    success: false,
    code: 'API_ROUTE_NOT_FOUND',
    error: `Endpoint API ${req.method} ${req.originalUrl} tidak ditemukan.`
  });
});

app.use(
  express.static(rootDir, {
    extensions: ['html']
  })
);

app.use('/firebase-sdk', express.static(path.join(rootDir, 'node_modules/firebase')));

app.get('/', (_req: Request, res: Response) => {
  res.sendFile(path.join(rootDir, 'index.html'));
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Server Error]', err);
  if (res.headersSent) return;
  return res.status(500).json({
    success: false,
    code: 'INTERNAL_SERVER_ERROR',
    error: 'Terjadi kesalahan internal pada server.'
  });
});

if (!process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`EsportBos server running on http://0.0.0.0:${PORT}`);
  });
}

export default app;
