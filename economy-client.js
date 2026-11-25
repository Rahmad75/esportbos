import { auth, getCurrentUserOnce } from './firebase-config.js';
import { apiFetch } from './api-config.js';

async function getIdTokenOrThrow() {
  const user = auth.currentUser || await getCurrentUserOnce();
  if (!user) {
    throw new Error('Silakan login terlebih dahulu.');
  }
  return user.getIdToken();
}

function getClientDeviceId() {
  try {
    const key = 'esportbos_device_id';
    let id = localStorage.getItem(key);
    if (!id) {
      id = `DEV-${Math.random().toString(36).slice(2, 10).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
      localStorage.setItem(key, id);
    }
    return id;
  } catch (_) {
    return 'DEV-BROWSER-ANON';
  }
}

let lastServerNowMs = null;
let lastSyncPerfMs = null;

export async function syncServerTime() {
  const res = await apiFetch('/api/server-time', {
    method: 'GET',
    cache: 'no-store'
  });
  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    data = null;
  }
  const serverNowMs = Number(data?.nowMs || (data?.dateTime ? new Date(data.dateTime).getTime() : NaN));
  if (!res.ok || !data?.success || !Number.isFinite(serverNowMs) || serverNowMs <= 0) {
    lastServerNowMs = null;
    lastSyncPerfMs = null;
    if (typeof window !== 'undefined') {
      window.__SERVER_TIME_SYNCED__ = false;
    }
    throw new Error('Gagal sinkronisasi waktu server (/api/server-time). Transaksi ditolak demi keamanan.');
  }

  lastServerNowMs = serverNowMs;
  lastSyncPerfMs = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : 0;
  if (typeof window !== 'undefined') {
    window.__SERVER_TIME_SYNCED__ = true;
    window.__SERVER_NOW_MS__ = serverNowMs;
    window.__SERVER_TIME_ZONE__ = data.timeZone || 'Europe/London';
  }
  return {
    serverNowMs,
    dateTime: data.dateTime || new Date(serverNowMs).toISOString(),
    timeZone: data.timeZone || 'Europe/London',
    londonDate: data.londonDate || null,
    londonTime: data.londonTime || null,
    londonZoneAbbr: data.londonZoneAbbr || 'GMT',
    wibResetTime: data.wibResetTime || '07:00 WIB'
  };
}

export async function requireServerTime(maxAgeMs = 60000) {
  const perfNow = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : 0;
  if (lastServerNowMs !== null && lastSyncPerfMs !== null && (perfNow - lastSyncPerfMs) >= 0 && (perfNow - lastSyncPerfMs) <= maxAgeMs) {
    const estimatedMs = Math.round(lastServerNowMs + (perfNow - lastSyncPerfMs));
    return {
      serverNowMs: estimatedMs,
      dateTime: new Date(estimatedMs).toISOString(),
      timeZone: 'Europe/London'
    };
  }
  return syncServerTime();
}

async function economyRequest(path, method = 'GET', body = null) {
  const token = await getIdTokenOrThrow();
  const headers = {
    Authorization: `Bearer ${token}`,
    'X-Device-Id': getClientDeviceId()
  };

  if (method !== 'GET') {
    const srvTime = await requireServerTime();
    headers['X-Server-Sync-Ms'] = String(srvTime.serverNowMs);
  }

  const options = {
    method,
    cache: 'no-store',
    headers
  };
  if (body !== null && method !== 'GET') {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const res = await apiFetch(path, options);
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

export async function startServerMatch(payload = {}) {
  return economyRequest('/api/match/start', 'POST', payload);
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

export async function fetchAdminEconomyDashboard() {
  return economyRequest('/api/economy/admin/dashboard', 'GET');
}

export async function approveAdminWithdraw(withdrawId, txHash = '') {
  return economyRequest('/api/economy/admin/withdraw/approve', 'POST', { withdrawId, txHash });
}

export async function rejectAdminWithdraw(withdrawId, reason = '') {
  return economyRequest('/api/economy/admin/withdraw/reject', 'POST', { withdrawId, reason });
}

export async function clearAdminSecurityFlag(targetUid) {
  return economyRequest('/api/economy/admin/security/unflag', 'POST', { targetUid });
}

export async function fetchTopupConfig() {
  const res = await apiFetch('/api/economy/topup/config');
  const data = await res.json();
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || 'Gagal memuat konfigurasi Top-Up.');
  }
  return data;
}

export async function fetchMyTopupRequests() {
  return economyRequest('/api/economy/topup/my-requests', 'GET');
}

export async function submitManualTopupRequest(payload) {
  return economyRequest('/api/economy/topup/request', 'POST', payload);
}

export async function fetchAdminTopupQueue() {
  return economyRequest('/api/economy/admin/topup/queue', 'GET');
}

export async function approveAdminTopup(topupId) {
  return economyRequest('/api/economy/admin/topup/approve', 'POST', { topupId });
}

export async function rejectAdminTopup(topupId, reason = '') {
  return economyRequest('/api/economy/admin/topup/reject', 'POST', { topupId, reason });
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
