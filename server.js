const express = require('express');
const path = require('path');
const { createEconomyService, mountEconomyRoutes } = require('./economy-server');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const economyService = createEconomyService({ rootDir: __dirname });

app.use(express.json());

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

app.use(express.static(__dirname, {
  extensions: ['html']
}));

app.use('/firebase-sdk', express.static(path.join(__dirname, 'node_modules/firebase')));

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

// Endpoint pengganti Supabase Edge Function: created-payment
app.post('/api/create-payment', (req, res) => {
  try {
    const { packageId, amount, diamonds, gold } = req.body || {};
    const orderId = 'ESB-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7).toUpperCase();
    const paymentUrl = `/payment-callback.html?mock=success&orderId=${encodeURIComponent(orderId)}&packageId=${encodeURIComponent(packageId || 'starter')}&amount=${encodeURIComponent(amount || 0)}&diamonds=${encodeURIComponent(diamonds || 0)}&gold=${encodeURIComponent(gold || 0)}`;
    return res.json({ orderId, paymentUrl });
  } catch (err) {
    console.error('Create payment error:', err);
    return res.status(500).json({ error: 'Failed to create payment' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`EsportBos server running on http://0.0.0.0:${PORT}`);
});
