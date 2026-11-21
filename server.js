const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname, {
  extensions: ['html']
}));

app.use('/firebase-sdk', express.static(path.join(__dirname, 'node_modules/firebase')));

// Endpoint pengganti Supabase Edge Function: verify-captcha-
app.post('/api/verify-captcha', async (req, res) => {
  try {
    const { token } = req.body || {};
    const secret = process.env.TURNSTILE_SECRET_KEY;

    if (!secret) {
      return res.json({ success: Boolean(token), mode: 'client-token-check' });
    }

    const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token || '' })
    });
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
