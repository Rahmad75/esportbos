import { auth, getCurrentUserOnce } from './firebase-config.js';

async function getIdTokenOrThrow() {
  const user = auth.currentUser || await getCurrentUserOnce();
  if (!user) {
    throw new Error('Silakan login terlebih dahulu.');
  }
  return user.getIdToken();
}

async function economyRequest(path, method = 'GET', body = null) {
  const token = await getIdTokenOrThrow();
  const options = {
    method,
    headers: {
      Authorization: `Bearer ${token}`
    }
  };
  if (body !== null && method !== 'GET') {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const res = await fetch(path, options);
  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    data = null;
  }

  if (!res.ok || !data?.success) {
    const err = new Error(data?.error || `Server menolak permintaan (${res.status})`);
    err.status = res.status;
    err.code = data?.code || 'ECONOMY_REQUEST_FAILED';
    throw err;
  }
  return data;
}

export async function fetchServerWallet() {
  return economyRequest('/api/economy/wallet', 'GET');
}

export async function fetchServerLedger(limit = 100) {
  return economyRequest(`/api/economy/ledger?limit=${encodeURIComponent(limit)}`, 'GET');
}

export async function claimServerMatchReward({ result, opponent, matchId }) {
  return economyRequest('/api/economy/match-reward', 'POST', { result, opponent, matchId });
}

export async function executeServerConversion({ direction, amount }) {
  return economyRequest('/api/economy/convert', 'POST', { direction, amount });
}

export async function settleServerWeeklySink() {
  return economyRequest('/api/economy/weekly-sink', 'POST', {});
}

export async function requestServerWithdraw(amount) {
  return economyRequest('/api/economy/withdraw-request', 'POST', amount !== undefined ? { amount } : {});
}

export async function fetchServerWithdrawStatus() {
  return economyRequest('/api/economy/withdraw-status', 'GET');
}

export async function submitServerKyc(payload) {
  return economyRequest('/api/economy/kyc/submit', 'POST', payload);
}

export async function executeServerSpend(payload) {
  return economyRequest('/api/economy/spend', 'POST', payload);
}

export async function adminResetServerWallet() {
  return economyRequest('/api/economy/admin/reset', 'POST', {});
}

export function applyServerWalletToDOM(wallet) {
  if (!wallet) return;
  const d = Number(wallet.diamond || 0);
  const g = Number(wallet.gold || 0);
  const c = Number(wallet.currency || 0);

  const map = [
    ['diamondBalance', d, 4],
    ['totalDiamond', d, 4],
    ['saldoDiamond', d, 4],
    ['withdrawBalance', d, 4],
    ['goldBalance', g, 4],
    ['totalGold', g, 4],
    ['saldoGold', g, 4],
    ['currencyBalance', c, 2],
    ['totalCurrency', c, 2],
    ['saldoCurrency', c, 2]
  ];
  for (const [id, val, maxFrac] of map) {
    const el = document.getElementById(id);
    if (el) el.textContent = val.toLocaleString('id-ID', { maximumFractionDigits: maxFrac });
  }
  document.querySelectorAll('[data-balance="diamond"]').forEach(el => {
    el.textContent = d.toLocaleString('id-ID', { maximumFractionDigits: 4 });
  });
  document.querySelectorAll('[data-balance="gold"]').forEach(el => {
    el.textContent = g.toLocaleString('id-ID', { maximumFractionDigits: 4 });
  });
  document.querySelectorAll('[data-balance="currency"]').forEach(el => {
    el.textContent = c.toLocaleString('id-ID', { maximumFractionDigits: 2 });
  });
}
