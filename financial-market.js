import { signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  updateDoc,
  where
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {
  auth,
  db,
  ensureFirestoreReady,
  FALLBACK_AVATAR_URL,
  getCurrentUserOnce,
  getOrCreateProfile,
  getOrCreateTeam,
  getSafeUserAvatarUrl,
  handleFirestoreError,
  OperationType,
  withFirestoreRetry
} from './firebase-config.js';
import {
  advanceMarketTurn,
  formatTurnNotification,
  loadMarketState,
  syncMarketWithMatches
} from './market-engine.js';

let currentUserId = null;
let userBalances = { diamond: 0, gold: 0, currency: 0 };
let currentMarketState = loadMarketState().state;
let currentExchange = 'currency-gold';

function getDynamicRates(state) {
  const d2g = state.diamondToGold;
  const g2c = state.goldToCurrency;
  return {
    'currency-gold': { from: 'Currency', to: 'Gold', rate: g2c, fee: 0 },
    'gold-currency': { from: 'Gold', to: 'Currency', rate: 1 / g2c, fee: 0 },
    'diamond-gold': { from: 'Diamond', to: 'Gold', rate: d2g, fee: 0 },
    'gold-diamond': { from: 'Gold', to: 'Diamond', rate: 1 / d2g, fee: 0 },
    'diamond-currency': { from: 'Diamond', to: 'Currency', rate: d2g / g2c, fee: 0 },
    'currency-diamond': { from: 'Currency', to: 'Diamond', rate: g2c / d2g, fee: 0 }
  };
}

function updateBalanceDisplays() {
  document.querySelectorAll('[data-balance="diamond"]').forEach(el => {
    el.textContent = userBalances.diamond.toLocaleString('id-ID', { maximumFractionDigits: 2 });
  });
  document.querySelectorAll('[data-balance="gold"]').forEach(el => {
    el.textContent = userBalances.gold.toLocaleString('id-ID', { maximumFractionDigits: 2 });
  });
  document.querySelectorAll('[data-balance="currency"]').forEach(el => {
    el.textContent = userBalances.currency.toLocaleString('id-ID', { maximumFractionDigits: 2 });
  });
  const wdEl = document.getElementById('withdrawBalance');
  if (wdEl) wdEl.textContent = userBalances.diamond.toLocaleString('id-ID', { maximumFractionDigits: 2 });
}

function formatPrice(value, decimals = 4) {
  return Number(value).toFixed(decimals);
}

function showMarketNotification(message, variant = 'info') {
  const el = document.getElementById('marketNotification');
  if (!el || !message) return;
  const borderColor = variant === 'up' ? '#22c55e' : variant === 'down' ? '#f97316' : '#00d4ff';
  el.style.display = 'block';
  el.style.borderLeftColor = borderColor;
  el.textContent = `📈 ${message}`;
}

function showExchangeFeedback(message, isError = false) {
  const el = document.getElementById('exchangeFeedback');
  if (!el) return;
  el.style.display = 'block';
  el.style.background = isError ? 'rgba(239, 68, 68, 0.16)' : 'rgba(34, 197, 94, 0.16)';
  el.style.border = `1px solid ${isError ? '#ef4444' : '#22c55e'}`;
  el.style.color = isError ? '#fca5a5' : '#86efac';
  el.textContent = message;
}

function renderMarketUI(state) {
  currentMarketState = state;

  const badge = document.getElementById('marketTurnBadge');
  if (badge) badge.textContent = `TURN #${state.turn}`;

  const headerDiamond = document.getElementById('headerDiamondRate');
  if (headerDiamond) headerDiamond.textContent = formatPrice(state.diamondToGold, 4);

  const headerGold = document.getElementById('headerGoldRate');
  if (headerGold) headerGold.textContent = formatPrice(state.goldToCurrency, 5);

  const legendDiamond = document.getElementById('legendDiamondPrice');
  if (legendDiamond) legendDiamond.textContent = formatPrice(state.diamondToGold, 4);

  const legendGold = document.getElementById('legendGoldPrice');
  if (legendGold) legendGold.textContent = formatPrice(state.goldToCurrency, 5);

  const quickPreview = document.getElementById('quickExchangePreview');
  if (quickPreview) {
    const goldOut = (10000 * state.goldToCurrency).toFixed(2);
    quickPreview.textContent = `10.000 Currency = ${goldOut} Gold`;
  }

  drawTurnMarketChart(state);
  renderMarketHistory(state.history || []);
  refreshExchangePanel();
}

function renderMarketHistory(history) {
  const container = document.getElementById('marketHistoryList');
  if (!container) return;

  const recentFive = history.slice(-5).reverse();
  if (recentFive.length === 0) {
    container.innerHTML = '<p style="color:#8da4cf; font-size:13px; margin:0;">Belum ada riwayat perubahan turn.</p>';
    return;
  }

  container.innerHTML = recentFive.map(item => {
    const dPct = Number(item.diamondChangePct || 0);
    const gPct = Number(item.goldChangePct || 0);
    const dSign = dPct > 0 ? '+' : '';
    const gSign = gPct > 0 ? '+' : '';
    const dColor = dPct > 0 ? '#4ade80' : dPct < 0 ? '#f87171' : '#9db2d9';
    const causeText = item.cause || 'Next Turn';

    return `
      <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:8px; padding:10px 14px; background:#0b1733; border:1px solid #1d3566; border-radius:8px; font-size:13px; color:#dbeafe;">
        <div>
          <strong style="color:#00d4ff;">Turn #${item.turn}:</strong>
          <span>Diamond/Gold ${Number(item.prevDiamondToGold).toFixed(2)} ke ${Number(item.diamondToGold).toFixed(2)}</span>
          <span style="color:${dColor}; font-weight:700;">(${dSign}${dPct.toFixed(1)}%)</span>
          <span style="color:#64748b; margin:0 6px;">•</span>
          <span style="color:#fde68a;">Gold/Currency ${Number(item.prevGoldToCurrency).toFixed(5)} ke ${Number(item.goldToCurrency).toFixed(5)} (${gSign}${gPct.toFixed(1)}%)</span>
        </div>
        <div style="color:#9db2d9; font-size:12px; font-weight:600;">Penyebab: <span style="color:#fff;">${causeText}</span></div>
      </div>
    `;
  }).join('');
}

function drawTurnMarketChart(state) {
  const canvas = document.getElementById('marketChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;

  const history = (state.history && state.history.length > 0)
    ? state.history
    : [{ turn: state.turn, diamondToGold: state.diamondToGold, goldToCurrency: state.goldToCurrency }];

  ctx.clearRect(0, 0, width, height);

  // Dark blue background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
  bgGrad.addColorStop(0, '#071229');
  bgGrad.addColorStop(1, '#0c1b3b');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  const leftPad = 50;
  const rightPad = 165;
  const topPad = 32;
  const bottomPad = 36;
  const plotLeft = leftPad;
  const plotRight = width - rightPad;
  const plotTop = topPad;
  const plotBottom = height - bottomPad;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;

  // Grid lines
  ctx.strokeStyle = '#182d59';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = plotTop + (plotHeight * i) / 4;
    ctx.beginPath();
    ctx.moveTo(plotLeft, y);
    ctx.lineTo(plotRight, y);
    ctx.stroke();
  }

  const vSteps = Math.min(10, Math.max(4, history.length - 1));
  for (let i = 0; i <= vSteps; i++) {
    const x = plotLeft + (plotWidth * i) / vSteps;
    ctx.beginPath();
    ctx.moveTo(x, plotTop);
    ctx.lineTo(x, plotBottom);
    ctx.stroke();
  }

  // Compute Y ranges independently so both lines remain legible across turns
  const diamondVals = history.map(h => Number(h.diamondToGold));
  const goldVals = history.map(h => Number(h.goldToCurrency));

  const dMinRaw = Math.min(...diamondVals);
  const dMaxRaw = Math.max(...diamondVals);
  const dSpan = Math.max(dMaxRaw - dMinRaw, 0.08);
  const dMin = dMinRaw - dSpan * 0.45;
  const dMax = dMaxRaw + dSpan * 0.25;

  const gMinRaw = Math.min(...goldVals);
  const gMaxRaw = Math.max(...goldVals);
  const gSpan = Math.max(gMaxRaw - gMinRaw, 0.008);
  const gMin = gMinRaw - gSpan * 0.25;
  const gMax = gMaxRaw + gSpan * 0.45;

  const getY = (val, min, max) => {
    const ratio = (val - min) / Math.max(max - min, 1e-9);
    return plotBottom - ratio * plotHeight;
  };

  const getX = (index, total) => {
    if (total <= 1) return plotRight;
    return plotLeft + (index / (total - 1)) * plotWidth;
  };

  const drawSeries = (vals, min, max, strokeColor) => {
    const pts = vals.map((v, i) => ({ x: getX(i, vals.length), y: getY(v, min, max), val: v }));

    if (pts.length === 1) {
      // Single initial point at right edge with subtle dashed baseline from left
      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = strokeColor;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(plotLeft, pts[0].y);
      ctx.lineTo(pts[0].x, pts[0].y);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.save();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      pts.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
      ctx.restore();

      // Small history vertex dots
      ctx.fillStyle = strokeColor;
      for (let i = 0; i < pts.length - 1; i++) {
        ctx.beginPath();
        ctx.arc(pts[i].x, pts[i].y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Static dot at right edge
    const last = pts[pts.length - 1];
    ctx.save();
    ctx.fillStyle = '#071229';
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(last.x, last.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = strokeColor;
    ctx.beginPath();
    ctx.arc(last.x, last.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    return last;
  };

  const lastDiamondPt = drawSeries(diamondVals, dMin, dMax, '#00d4ff');
  const lastGoldPt = drawSeries(goldVals, gMin, gMax, '#ffd700');

  // Price labels at the right edge (prevent vertical overlap)
  let labelDiamondY = lastDiamondPt.y;
  let labelGoldY = lastGoldPt.y;
  if (Math.abs(labelDiamondY - labelGoldY) < 30) {
    if (labelDiamondY <= labelGoldY) {
      labelDiamondY = Math.max(plotTop + 14, labelDiamondY - 14);
      labelGoldY = Math.min(plotBottom - 14, labelDiamondY + 30);
    } else {
      labelGoldY = Math.max(plotTop + 14, labelGoldY - 14);
      labelDiamondY = Math.min(plotBottom - 14, labelGoldY + 30);
    }
  }

  const drawPriceTag = (x, y, text, color) => {
    ctx.save();
    ctx.font = 'bold 12px monospace';
    const textWidth = ctx.measureText(text).width;
    const boxW = textWidth + 16;
    const boxH = 24;
    const boxX = x + 12;
    const boxY = Math.min(Math.max(y - boxH / 2, 6), height - boxH - 6);

    ctx.fillStyle = '#112247';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, boxX + 8, boxY + boxH / 2);
    ctx.restore();
  };

  drawPriceTag(lastDiamondPt.x, labelDiamondY, `D/G ${Number(state.diamondToGold).toFixed(4)}`, '#00d4ff');
  drawPriceTag(lastGoldPt.x, labelGoldY, `G/C ${Number(state.goldToCurrency).toFixed(5)}`, '#ffd700');

  // Turn X-axis labels
  ctx.fillStyle = '#7f98c7';
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  if (history.length === 1) {
    ctx.fillText(`T${history[0].turn}`, plotRight, height - 12);
  } else {
    const labelCount = Math.min(6, history.length);
    for (let i = 0; i < labelCount; i++) {
      const idx = Math.round((i / (labelCount - 1)) * (history.length - 1));
      const x = getX(idx, history.length);
      ctx.fillText(`T${history[idx].turn}`, x, height - 12);
    }
  }
  ctx.textAlign = 'left';
}

function refreshExchangePanel() {
  const rates = getDynamicRates(currentMarketState);
  const config = rates[currentExchange];
  if (!config) return;

  const fromLabel = document.getElementById('fromLabel');
  const toLabel = document.getElementById('toLabel');
  const rateInfo = document.getElementById('rateInfo');
  const feeInfo = document.getElementById('feeInfo');
  const fromBalance = document.getElementById('fromBalance');

  if (fromLabel) fromLabel.textContent = `Dari (${config.from})`;
  if (toLabel) toLabel.textContent = `Ke (${config.to})`;

  const formattedRate = config.rate < 0.5
    ? config.rate.toFixed(5)
    : config.rate.toFixed(4);
  if (rateInfo) {
    rateInfo.textContent = `Kurs Turn #${currentMarketState.turn}: 1 ${config.from} = ${formattedRate} ${config.to}`;
  }
  if (feeInfo) feeInfo.textContent = 'Biaya: 0% (Kurs Turn Saat Ini)';

  const balanceKey = config.from.toLowerCase();
  if (fromBalance) {
    fromBalance.textContent = `Saldo: ${(userBalances[balanceKey] || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 })} ${config.from}`;
  }

  calculateExchange();
}

function setExchangeDirection(direction, btn, preserveAmount = false) {
  currentExchange = direction;

  document.querySelectorAll('.direction-tab').forEach(b => {
    b.classList.remove('active');
    b.style.background = '#1e3260';
    b.style.color = 'white';
  });
  if (btn) {
    btn.classList.add('active');
    btn.style.background = '#00d4ff';
    btn.style.color = '#000';
  }

  const amountEl = document.getElementById('exchangeAmount');
  if (amountEl && !preserveAmount) {
    amountEl.value = direction === 'currency-gold' ? '10000' : '';
  }

  refreshExchangePanel();
}

function applyQuickExchange10k() {
  const tabBtn = document.querySelector('.direction-tab[data-direction="currency-gold"]');
  setExchangeDirection('currency-gold', tabBtn, true);
  const amountEl = document.getElementById('exchangeAmount');
  if (amountEl) amountEl.value = '10000';
  calculateExchange();
}

function calculateExchange() {
  const amountEl = document.getElementById('exchangeAmount');
  const resultEl = document.getElementById('exchangeResult');
  if (!amountEl || !resultEl) return;

  const amount = parseFloat(amountEl.value) || 0;
  const rates = getDynamicRates(currentMarketState);
  const config = rates[currentExchange];
  if (!config || amount <= 0) {
    resultEl.value = '';
    return;
  }

  const netAmount = amount * (1 - config.fee);
  const result = netAmount * config.rate;
  resultEl.value = result.toFixed(2);
}

function handleNextTurn() {
  const { state, latestEntry } = advanceMarketTurn('Next Turn');
  renderMarketUI(state);
  const pct = Number(latestEntry?.diamondChangePct || 0);
  showMarketNotification(formatTurnNotification(latestEntry), pct >= 0 ? 'up' : 'down');
}

async function handleLogout() {
  await signOut(auth);
  window.location.href = 'index.html';
}

async function executeExchange() {
  const amount = parseFloat(document.getElementById('exchangeAmount').value);
  if (!amount || amount <= 0) {
    showExchangeFeedback('❌ Masukkan jumlah yang valid!', true);
    return;
  }

  const rates = getDynamicRates(currentMarketState);
  const config = rates[currentExchange];
  const feeAmount = amount * config.fee;
  const netAmount = amount - feeAmount;
  const result = Number((netAmount * config.rate).toFixed(2));

  const fromKey = config.from.toLowerCase();
  const toBalanceKey = config.to.toLowerCase();

  if ((userBalances[fromKey] || 0) < amount) {
    showExchangeFeedback(`❌ Saldo ${config.from} tidak cukup! Saldo Anda: ${(userBalances[fromKey] || 0).toLocaleString('id-ID')}`, true);
    return;
  }

  const fromField = fromKey === 'diamond' ? 'diamonds' : fromKey;
  const toField = toBalanceKey === 'diamond' ? 'diamonds' : toBalanceKey;

  const updates = {
    updated_at: new Date().toISOString(),
    [fromField]: Number((userBalances[fromKey] - amount).toFixed(2)),
    [toField]: Number((userBalances[toBalanceKey] + result).toFixed(2))
  };

  try {
    await withFirestoreRetry(() => updateDoc(doc(db, 'profiles', currentUserId), updates), 3, 1000);
    await withFirestoreRetry(() => addDoc(collection(db, 'transactions'), {
      user_id: currentUserId,
      type: 'exchange',
      from_currency: config.from,
      to_currency: config.to,
      amount_from: amount,
      amount_to: result,
      fee: feeAmount,
      market_turn: currentMarketState.turn,
      status: 'completed',
      created_at: new Date().toISOString()
    }), 3, 1000);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'profiles/transactions');
    showExchangeFeedback('❌ Gagal memproses exchange ke server. Coba lagi.', true);
    return;
  }

  userBalances[fromKey] = updates[fromField];
  userBalances[toBalanceKey] = updates[toField];
  updateBalanceDisplays();

  const { state, latestEntry } = advanceMarketTurn('Exchange');
  renderMarketUI(state);
  const pct = Number(latestEntry?.diamondChangePct || 0);
  showMarketNotification(formatTurnNotification(latestEntry), pct >= 0 ? 'up' : 'down');
  showExchangeFeedback(`✅ Berhasil menukar ${amount.toLocaleString('id-ID')} ${config.from} menjadi ${result.toFixed(2)} ${config.to} pada Turn #${state.turn - 1}!`, false);

  await loadTransactions();
}

async function requestWithdraw() {
  const netRequired = 2500;
  const grossRequired = Math.ceil(netRequired / 0.85);

  if (userBalances.diamond < grossRequired) {
    showExchangeFeedback(`❌ Saldo Diamond tidak cukup untuk withdraw (butuh ${grossRequired.toLocaleString('id-ID')} Diamond gross).`, true);
    return;
  }

  if (!window.confirm(`Yakin ingin request withdraw ${grossRequired.toLocaleString('id-ID')} Diamond?\n\n(Net yang diterima: ${netRequired.toLocaleString('id-ID')} Diamond ≈ Rp 500.000)`)) return;

  const newBalance = userBalances.diamond - grossRequired;
  try {
    await withFirestoreRetry(() => updateDoc(doc(db, 'profiles', currentUserId), {
      diamonds: newBalance,
      updated_at: new Date().toISOString()
    }), 3, 1000);
    userBalances.diamond = newBalance;

    await withFirestoreRetry(() => addDoc(collection(db, 'transactions'), {
      user_id: currentUserId,
      type: 'withdraw',
      from_currency: 'Diamond',
      amount_from: grossRequired,
      amount_to: netRequired,
      fee: grossRequired - netRequired,
      status: 'pending',
      created_at: new Date().toISOString()
    }), 3, 1000);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'profiles/transactions');
    return;
  }

  updateBalanceDisplays();
  showExchangeFeedback('✅ Permintaan Withdraw berhasil diajukan! Admin akan memproses dalam 1x24 jam.', false);
  await loadTransactions();
}

async function loadTransactions() {
  const list = document.getElementById('transactionList');
  if (!currentUserId || !list) return;

  let data = [];
  try {
    const q = query(collection(db, 'transactions'), where('user_id', '==', currentUserId));
    const snap = await withFirestoreRetry(() => getDocs(q), 3, 1000);
    data = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 10);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'transactions');
    list.innerHTML = '<p style="text-align:center; color:#f87171; padding:20px;">Gagal memuat transaksi dari server.</p>';
    return;
  }

  if (!data || data.length === 0) {
    list.innerHTML = '<p style="text-align:center; color:#9db2d9; padding:20px;">Belum ada transaksi.</p>';
    return;
  }

  list.innerHTML = data.map(t => {
    const date = new Date(t.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    let desc = '';
    if (t.type === 'exchange') {
      desc = `Exchange: ${Number(t.amount_from).toLocaleString('id-ID')} ${t.from_currency} → ${parseFloat(t.amount_to).toFixed(2)} ${t.to_currency}`;
    } else if (t.type === 'withdraw') {
      desc = `Withdraw: ${Number(t.amount_from).toLocaleString('id-ID')} ${t.from_currency} (Net: ${Number(t.amount_to).toLocaleString('id-ID')})`;
    } else {
      desc = `${t.type}: ${t.amount_to} ${t.to_currency || ''}`;
    }

    const statusColor = t.status === 'completed' ? '#28a745' : (t.status === 'pending' ? '#ffc107' : '#ff6b6b');

    return `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:15px; border-bottom:1px solid #1e3566; color:white;">
        <div>
          <div style="font-weight:bold; color:#00d4ff;">${desc}</div>
          <div style="font-size:12px; color:#9db2d9;">${date}</div>
        </div>
        <div style="text-align:right;">
          <span style="background:${statusColor}; color:#000; padding:4px 8px; border-radius:4px; font-size:12px; font-weight:bold;">${t.status.toUpperCase()}</span>
        </div>
      </div>
    `;
  }).join('');
}

document.addEventListener('DOMContentLoaded', async function() {
  // Immediately render turn-based market from localStorage (resumes without resetting)
  const initialLoad = loadMarketState();
  renderMarketUI(initialLoad.state);
  if (initialLoad.advancedByGameTurn > 0 && initialLoad.latestEntry) {
    const pct = Number(initialLoad.latestEntry.diamondChangePct || 0);
    showMarketNotification(formatTurnNotification(initialLoad.latestEntry), pct >= 0 ? 'up' : 'down');
  }

  const defaultTab = document.querySelector('.direction-tab[data-direction="currency-gold"]');
  setExchangeDirection('currency-gold', defaultTab, false);

  try {
    const user = await getCurrentUserOnce();
    if (!user) { window.location.href = 'index.html'; return; }
    currentUserId = user.uid;

    await ensureFirestoreReady(3, 1000);

    const profile = await withFirestoreRetry(() => getOrCreateProfile(user), 3, 1000);
    const team = await withFirestoreRetry(() => getOrCreateTeam(user, profile?.club_name), 3, 1000);

    if (profile) {
      const username = profile.username || user.email.split('@')[0];
      document.getElementById('userName').textContent = username;
      const navAvatar = document.getElementById('navAvatar');
      if (navAvatar) {
        navAvatar.onerror = () => { navAvatar.onerror = null; navAvatar.src = FALLBACK_AVATAR_URL; };
        navAvatar.src = getSafeUserAvatarUrl(profile, username);
      }

      userBalances = {
        diamond: profile.diamonds || 0,
        gold: profile.gold || 0,
        currency: profile.currency || 0
      };
      updateBalanceDisplays();
      refreshExchangePanel();
    }

    if (team) {
      document.getElementById('clubName').textContent = team.team_name;
      document.getElementById('clubRank').textContent = `${team.wins || 0}W - ${team.draws || 0}D - ${team.losses || 0}L`;
      document.getElementById('popularityText').textContent = `Popularitas: ${team.popularity || 0}%`;
      document.getElementById('popularityBar').style.width = `${team.popularity || 0}%`;
      document.getElementById('moralText').textContent = `Moral: ${team.moral || 0}%`;
      document.getElementById('moralBar').style.width = `${team.moral || 0}%`;

      const totalMatches = (team.wins || 0) + (team.draws || 0) + (team.losses || 0);
      const matchSync = syncMarketWithMatches(totalMatches);
      if (matchSync.advancedCount > 0) {
        renderMarketUI(matchSync.state);
        if (matchSync.latestEntry) {
          const pct = Number(matchSync.latestEntry.diamondChangePct || 0);
          showMarketNotification(formatTurnNotification(matchSync.latestEntry), pct >= 0 ? 'up' : 'down');
        }
      }
    }

    await loadTransactions();
  } catch (err) {
    console.error('Financial market error:', err);
  }
});

window.handleLogout = handleLogout;
window.setExchangeDirection = setExchangeDirection;
window.applyQuickExchange10k = applyQuickExchange10k;
window.calculateExchange = calculateExchange;
window.executeExchange = executeExchange;
window.requestWithdraw = requestWithdraw;
window.handleNextTurn = handleNextTurn;
