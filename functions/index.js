const os = require('node:os');
const path = require('node:path');
const express = require('express');
const functions = require('firebase-functions/v1');
const { createEconomyService, mountEconomyRoutes, getLondonTimeInfo } = require('./economy-server');

const app = express();
app.set('trust proxy', 1);

const economyService = createEconomyService({
  rootDir: __dirname,
  dataDir: path.join(os.tmpdir(), 'esportbos-data')
});

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
      hostname.endsWith('.github.io') ||
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

// Middleware CORS aman + preflight OPTIONS
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

// Normalisasi path agar kompatibel baik lewat Firebase Hosting Rewrites (/api/...)
// maupun akses langsung ke https://asia-southeast1-eighth-thought-94cnq.cloudfunctions.net/api/...
app.use((req, res, next) => {
  if (req.url === '/' || req.url === '') {
    req.url = '/api';
  } else if (!req.url.startsWith('/api/') && req.url !== '/api') {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }
  return next();
});

app.use(express.json({ limit: '3mb' }));

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  return next();
});

// Endpoint waktu server resmi (Europe/London GMT/BST + UTC)
const handleGetServerTime = (req, res) => {
  const info = getLondonTimeInfo(Date.now());
  return res.json({
    success: true,
    ...info
  });
};
app.get('/api/server-time', handleGetServerTime);
app.get('/api/economy/server-time', handleGetServerTime);

// Mount seluruh route ekonomi, match, withdraw, topup, kyc, dan admin
mountEconomyRoutes(app, economyService);

// Endpoint verifikasi Turnstile captcha
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

// Top-Up manual memakai verifikasi Admin
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

exports.api = functions.region('asia-southeast1').https.onRequest(app);
