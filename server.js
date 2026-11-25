const express = require('express');
const path = require('path');
const { createEconomyService, mountEconomyRoutes } = require('./economy-server');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const economyService = createEconomyService({ rootDir: __dirname });

function isTrustedCorsOrigin(origin, req) {
  if (!origin || typeof origin !== 'string') return false;
  let parsed;
  try {
    parsed = new URL(origin);
  } catch (_) {
    return false;
  }

  const hostHeader = String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  if (hostHeader && parsed.host.toLowerCase() === hostHeader) {
    return true;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  }

  if (parsed.protocol === 'https:') {
    if (
      hostname === 'esportbos.com' ||
      hostname.endsWith('.esportbos.com') ||
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

// Middleware CORS aman (validasi origin eksplisit + tangani preflight OPTIONS sebelum semua route/static)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && isTrustedCorsOrigin(origin, req)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Device-Id, X-Requested-With, X-Server-Sync-Ms');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  return next();
});

app.use(express.json({ limit: '3mb' }));

// Lindungi file internal server, ledger, dan aturan security dari akses static HTTP langsung
app.use((req, res, next) => {
  const reqPath = (req.path || '').toLowerCase();
  if (
    reqPath === '/data' ||
    reqPath.startsWith('/data/') ||
    reqPath === '/economy-server.js' ||
    reqPath === '/server.js' ||
    reqPath === '/package.json' ||
    reqPath === '/package-lock.json' ||
    reqPath === '/firestore.rules' ||
    reqPath === '/firebase-blueprint.json' ||
    reqPath === '/security_spec.md' ||
    reqPath.startsWith('/.')
  ) {
    return res.status(403).json({ error: 'Akses langsung ke file internal server ditolak.' });
  }
  return next();
});

app.use((req, res, next) => {
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

// Endpoint waktu server internal menggunakan new Date() agar bebas blokir CORS pihak ketiga
app.get('/api/server-time', (req, res) => {
  const now = new Date();
  return res.json({
    success: true,
    dateTime: now.toISOString(),
    nowMs: now.getTime(),
    timeZone: 'Asia/Jakarta',
    wibString: now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false })
  });
});

// Mount semua API route SEBELUM static middleware agar request POST/OPTIONS tidak bentrok dengan static handler
mountEconomyRoutes(app, economyService);

// Endpoint pengganti Supabase Edge Function: verify-captcha-
app.post('/api/verify-captcha', async (req, res) => {
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
    const result = await verifyRes.json();
    return res.json({ success: Boolean(result.success) });
  } catch (err) {
    console.error('Captcha verify error:', err);
    return res.status(500).json({ success: false, error: 'Captcha verification failed' });
  }
});

// Top-Up sekarang memakai verifikasi manual Admin (/api/economy/topup/request)
app.post('/api/create-payment', (req, res) => {
  return res.status(410).json({
    success: false,
    code: 'MANUAL_TOPUP_REQUIRED',
    error: 'Pembayaran otomatis dinonaktifkan. Gunakan halaman Pendanaan Klub untuk Top-Up QRIS DANA Bisnis / USDT Solana dengan verifikasi Admin.'
  });
});

app.use('/api', (req, res) => {
  return res.status(404).json({
    success: false,
    code: 'API_ROUTE_NOT_FOUND',
    error: `Endpoint API ${req.method} ${req.originalUrl} tidak ditemukan.`
  });
});

app.use(express.static(__dirname, {
  extensions: ['html']
}));

app.use('/firebase-sdk', express.static(path.join(__dirname, 'node_modules/firebase')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`EsportBos server running on http://0.0.0.0:${PORT}`);
});
