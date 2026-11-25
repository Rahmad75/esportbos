import { signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  addDoc,
  collection
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
  withFirestoreRetry
} from './firebase-config.js';
import {
  convertCurrencyToGold,
  convertGoldToDiamond,
  getWithdrawSummary,
  loadEconomyConfig
} from './economy-config.js';
import {
  advanceMarketTurn,
  formatTurnNotification,
  loadMarketState,
  syncMarketWithMatches
} from './market-engine.js';
import {
  applyServerWalletToDOM,
  executeServerConversion,
  fetchServerLedger,
  fetchServerWithdrawStatus,
  requestServerWithdraw,
  submitServerKyc
} from './economy-client.js';

let currentUserId = null;
let userBalances = { diamond: 0, gold: 0, currency: 0 };
let economyConfig = null;
let currentMarketState = null;
let currentExchange = 'currency-gold';

function getDynamicRates(cfg) {
  const diamondToGold = Number(cfg.rates.diamondToGold);
  const goldToCurrency = Number(cfg.rates.goldToCurrency);
  const currencyToGoldFee = Number(cfg.fees.currencyToGoldFeePercent);
  const goldToDiamondFee = Number(cfg.fees.goldToDiamondFeePercent);
  const reverseBlocked = !cfg.fees.allowReverseDiamondToCurrencyWithoutFeeAndCap && !cfg.fees.reverseConversion?.enabled;

  return {
    'currency-gold': {
      from: 'Currency',
      to: 'Gold',
      rate: 1 / goldToCurrency,
      feePercent: currencyToGoldFee,
      blocked: false
    },
    'gold-diamond': {
      from: 'Gold',
      to: 'Diamond',
      rate: 1 / diamondToGold,
      feePercent: goldToDiamondFee,
      blocked: false
    },
    'diamond-currency': {
      from: 'Diamond',
      to: 'Currency',
      rate: Number(cfg.rates.diamondToCurrency),
      feePercent: 0,
      blocked: reverseBlocked
    }
  };
}

function updateBalanceDisplays() {
  document.querySelectorAll('[data-balance="diamond"]').forEach(el => {
    el.textContent = userBalances.diamond.toLocaleString('id-ID', { maximumFractionDigits: 4 });
  });
  document.querySelectorAll('[data-balance="gold"]').forEach(el => {
    el.textContent = userBalances.gold.toLocaleString('id-ID', { maximumFractionDigits: 4 });
  });
  document.querySelectorAll('[data-balance="currency"]').forEach(el => {
    el.textContent = userBalances.currency.toLocaleString('id-ID', { maximumFractionDigits: 2 });
  });
  const wdEl = document.getElementById('withdrawBalance');
  if (wdEl) wdEl.textContent = userBalances.diamond.toLocaleString('id-ID', { maximumFractionDigits: 4 });
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

function renderWithdrawPolicyUI(cfg) {
  const wd = getWithdrawSummary(cfg, cfg.withdraw.minDiamond);
  const subtitle = document.getElementById('withdrawSubtitle');
  if (subtitle) {
    subtitle.textContent = `Minimum WD: ${wd.minDiamond} Diamond | Fee: ${wd.feePercent}% (terima bersih ${wd.netUsdt} USDT) | Cooldown: ${wd.cooldownDays} hari | Umur akun min: ${wd.minAccountAgeDays} hari | Sistem: ${wd.processingMode.toUpperCase()} (wajib KYC, maks ${wd.maxActiveRequests} request aktif)`;
  }

  const minEl = document.getElementById('minWithdrawAmount');
  if (minEl) minEl.textContent = `${wd.minDiamond} Diamond`;

  const feeEl = document.getElementById('withdrawFeeLabel');
  if (feeEl) feeEl.textContent = `${wd.feePercent}% (-${wd.feeDiamond} Diamond)`;

  const netEl = document.getElementById('withdrawNetUsdt');
  if (netEl) netEl.textContent = `${wd.netUsdt} USDT`;
}

function renderMarketUI(state) {
  currentMarketState = state;
  if (!economyConfig) return;

  const badge = document.getElementById('marketTurnBadge');
  if (badge) badge.textContent = `TURN #${state.turn}`;

  const d2g = Number(economyConfig.rates.diamondToGold);
  const g2c = Number(economyConfig.rates.goldToCurrency);

  const headerDiamond = document.getElementById('headerDiamondRate');
  if (headerDiamond) headerDiamond.textContent = `${d2g.toLocaleString('id-ID')} Gold`;

  const headerGold = document.getElementById('headerGoldRate');
  if (headerGold) headerGold.textContent = `${g2c.toLocaleString('id-ID')} Currency`;

  const legendDiamond = document.getElementById('legendDiamondPrice');
  if (legendDiamond) legendDiamond.textContent = `1 D = ${d2g.toLocaleString('id-ID')} G`;

  const legendGold = document.getElementById('legendGoldPrice');
  if (legendGold) legendGold.textContent = `1 G = ${g2c.toLocaleString('id-ID')} C`;

  const exSub = document.getElementById('exchangeSubtitle');
  if (exSub) {
    exSub.textContent = `Konversi satu arah: Currency → Gold (fee ${economyConfig.fees.currencyToGoldFeePercent}%) dan Gold → Diamond (fee ${economyConfig.fees.goldToDiamondFeePercent}%). Konversi balik Diamond → Currency diblokir tanpa fee & cap.`;
  }

  const quickPreview = document.getElementById('quickExchangePreview');
  if (quickPreview) {
    const sampleCurrency = Number(economyConfig.matchReward.perMatchCurrency);
    const conv = convertCurrencyToGold(economyConfig, sampleCurrency);
    quickPreview.textContent = `${sampleCurrency.toLocaleString('id-ID')} Currency (1 Match) → ${conv.netGold.toFixed(2)} Gold (setelah fee ${conv.feePercent}%)`;
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
    const causeText = item.cause || 'Next Turn';
    return `
      <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:8px; padding:10px 14px; background:#0b1733; border:1px solid #1d3566; border-radius:8px; font-size:13px; color:#dbeafe;">
        <div>
          <strong style="color:#00d4ff;">Turn #${item.turn}:</strong>
          <span>1 Diamond = ${Number(item.diamondToGold).toLocaleString('id-ID')} Gold</span>
          <span style="color:#64748b; margin:0 6px;">•</span>
          <span style="color:#fde68a;">1 Gold = ${Number(item.goldToCurrency).toLocaleString('id-ID')} Currency</span>
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

  const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
  bgGrad.addColorStop(0, '#071229');
  bgGrad.addColorStop(1, '#0c1b3b');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  const leftPad = 50;
  const rightPad = 185;
  const topPad = 32;
  const bottomPad = 36;
  const plotLeft = leftPad;
  const plotRight = width - rightPad;
  const plotTop = topPad;
  const plotBottom = height - bottomPad;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;

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

  const diamondVals = history.map(h => Number(h.diamondToGold));
  const goldVals = history.map(h => Number(h.goldToCurrency));

  const dBase = diamondVals[diamondVals.length - 1];
  const gBase = goldVals[goldVals.length - 1];

  const getX = (index, total) => (total <= 1 ? plotRight : plotLeft + (index / (total - 1)) * plotWidth);

  const drawFlatOrSeries = (vals, yPos, strokeColor) => {
    const pts = vals.map((_, i) => ({ x: getX(i, vals.length), y: yPos }));

    if (pts.length === 1) {
      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = strokeColor;
      ctx.globalAlpha = 0.6;
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
      ctx.beginPath();
      pts.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = strokeColor;
      for (let i = 0; i < pts.length - 1; i++) {
        ctx.beginPath();
        ctx.arc(pts[i].x, pts[i].y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

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

  const yDiamond = plotTop + plotHeight * 0.34;
  const yGold = plotTop + plotHeight * 0.66;

  const lastDiamondPt = drawFlatOrSeries(diamondVals, yDiamond, '#00d4ff');
  const lastGoldPt = drawFlatOrSeries(goldVals, yGold, '#ffd700');

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

  drawPriceTag(lastDiamondPt.x, lastDiamondPt.y, `1 D = ${dBase.toLocaleString('id-ID')} G`, '#00d4ff');
  drawPriceTag(lastGoldPt.x, lastGoldPt.y, `1 G = ${gBase.toLocaleString('id-ID')} C`, '#ffd700');

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
  if (!economyConfig || !currentMarketState) return;
  const rates = getDynamicRates(economyConfig);
  const config = rates[currentExchange];
  if (!config) return;

  const fromLabel = document.getElementById('fromLabel');
  const toLabel = document.getElementById('toLabel');
  const rateInfo = document.getElementById('rateInfo');
  const feeInfo = document.getElementById('feeInfo');
  const fromBalance = document.getElementById('fromBalance');
  const executeBtn = document.getElementById('executeExchangeBtn');

  if (fromLabel) fromLabel.textContent = `Dari (${config.from})`;
  if (toLabel) toLabel.textContent = `Ke (${config.to})`;

  if (config.blocked) {
    if (rateInfo) rateInfo.textContent = 'Konversi balik Diamond → Currency tidak diizinkan tanpa fee & cap.';
    if (feeInfo) feeInfo.textContent = 'Status: DIBLOKIR (Aturan Economy v2)';
    if (executeBtn) {
      executeBtn.disabled = true;
      executeBtn.style.background = '#475569';
      executeBtn.textContent = '🔒 KONVERSI BALIK DIBLOKIR';
    }
  } else {
    if (rateInfo) {
      if (currentExchange === 'currency-gold') {
        rateInfo.textContent = `Kurs Turn #${currentMarketState.turn}: ${Number(economyConfig.rates.goldToCurrency).toLocaleString('id-ID')} Currency = 1 Gold`;
      } else {
        rateInfo.textContent = `Kurs Turn #${currentMarketState.turn}: ${Number(economyConfig.rates.diamondToGold).toLocaleString('id-ID')} Gold = 1 Diamond`;
      }
    }
    if (feeInfo) feeInfo.textContent = `Biaya konversi: ${config.feePercent}%`;
    if (executeBtn) {
      executeBtn.disabled = false;
      executeBtn.style.background = '#28a745';
      executeBtn.textContent = '💱 TUKAR SEKARANG';
    }
  }

  const balanceKey = config.from.toLowerCase();
  if (fromBalance) {
    fromBalance.textContent = `Saldo: ${(userBalances[balanceKey] || 0).toLocaleString('id-ID', { maximumFractionDigits: 4 })} ${config.from}`;
  }

  calculateExchange();
}

function setExchangeDirection(direction, btn, preserveAmount = false) {
  currentExchange = direction;

  document.querySelectorAll('.direction-tab').forEach(b => {
    b.classList.remove('active');
    const isBlockedTab = b.dataset.direction === 'diamond-currency';
    b.style.background = isBlockedTab ? '#2b1d2e' : '#1e3260';
    b.style.color = isBlockedTab ? '#fca5a5' : 'white';
  });
  if (btn) {
    btn.classList.add('active');
    btn.style.background = direction === 'diamond-currency' ? '#7f1d1d' : '#00d4ff';
    btn.style.color = direction === 'diamond-currency' ? '#fecaca' : '#000';
  }

  const amountEl = document.getElementById('exchangeAmount');
  if (amountEl && !preserveAmount && economyConfig) {
    amountEl.value = direction === 'currency-gold' ? String(economyConfig.matchReward.perMatchCurrency) : '';
  }

  refreshExchangePanel();
}

function applyQuickMatchSample() {
  if (!economyConfig) return;
  const tabBtn = document.querySelector('.direction-tab[data-direction="currency-gold"]');
  setExchangeDirection('currency-gold', tabBtn, true);
  const amountEl = document.getElementById('exchangeAmount');
  if (amountEl) amountEl.value = String(economyConfig.matchReward.perMatchCurrency);
  calculateExchange();
}

function calculateExchange() {
  const amountEl = document.getElementById('exchangeAmount');
  const resultEl = document.getElementById('exchangeResult');
  if (!amountEl || !resultEl || !economyConfig) return;

  const amount = parseFloat(amountEl.value) || 0;
  const rates = getDynamicRates(economyConfig);
  const config = rates[currentExchange];
  if (!config || config.blocked || amount <= 0) {
    resultEl.value = config?.blocked ? 'Diblokir oleh aturan Economy v2' : '';
    return;
  }

  const conv = currentExchange === 'currency-gold'
    ? convertCurrencyToGold(economyConfig, amount)
    : convertGoldToDiamond(economyConfig, amount);
  const netOut = currentExchange === 'currency-gold' ? conv.netGold : conv.netDiamond;
  resultEl.value = netOut.toFixed(currentExchange === 'gold-diamond' ? 4 : 2);
}

function handleNextTurn() {
  if (!economyConfig) return;
  const { state, latestEntry } = advanceMarketTurn('Next Turn', { economyConfig });
  renderMarketUI(state);
  showMarketNotification(formatTurnNotification(latestEntry), 'info');
}

async function handleLogout() {
  await signOut(auth);
  window.location.href = 'index.html';
}

async function executeExchange() {
  if (!economyConfig) return;
  const rates = getDynamicRates(economyConfig);
  const config = rates[currentExchange];

  if (!config || config.blocked) {
    showExchangeFeedback('🔒 Konversi balik Diamond → Currency tidak diizinkan tanpa fee dan batas harian.', true);
    return;
  }

  const amount = parseFloat(document.getElementById('exchangeAmount').value);
  if (!amount || amount <= 0) {
    showExchangeFeedback('❌ Masukkan jumlah yang valid!', true);
    return;
  }

  let serverRes;
  try {
    serverRes = await executeServerConversion({ direction: currentExchange, amount });
  } catch (err) {
    showExchangeFeedback(`❌ ${err.message || 'Gagal memproses exchange di server.'}`, true);
    return;
  }

  const wallet = serverRes.wallet;
  userBalances = {
    diamond: Number(wallet.diamond || 0),
    gold: Number(wallet.gold || 0),
    currency: Number(wallet.currency || 0)
  };
  applyServerWalletToDOM(wallet);
  updateBalanceDisplays();

  const conv = serverRes.conversion;
  try {
    await withFirestoreRetry(() => addDoc(collection(db, 'transactions'), {
      user_id: currentUserId,
      type: 'exchange',
      from_currency: config.from,
      to_currency: config.to,
      amount_from: conv.amountFrom,
      amount_to: conv.amountTo,
      fee: conv.feeAmount,
      status: 'completed',
      created_at: new Date().toISOString()
    }), 3, 1000);
  } catch (_) {
    // Server ledger sudah mencatat transaksi permanen
  }

  const { state, latestEntry } = advanceMarketTurn('Exchange', { economyConfig });
  renderMarketUI(state);
  showMarketNotification(formatTurnNotification(latestEntry), 'info');
  showExchangeFeedback(`✅ Berhasil menukar ${conv.amountFrom.toLocaleString('id-ID')} ${config.from} menjadi ${conv.amountTo} ${config.to} (fee ${conv.feePercent}% — Validasi Server).`, false);

  await loadTransactions();
}

function showWithdrawFeedback(message, isError = false) {
  const el = document.getElementById('withdrawFeedback');
  if (!el) return;
  el.style.display = 'block';
  el.style.background = isError ? 'rgba(239, 68, 68, 0.16)' : 'rgba(34, 197, 94, 0.16)';
  el.style.border = `1px solid ${isError ? '#ef4444' : '#22c55e'}`;
  el.style.color = isError ? '#fca5a5' : '#86efac';
  el.textContent = message;
}

function renderWithdrawGateUI(statusData) {
  if (!statusData || !statusData.gate) return;
  const { gate, queue } = statusData;
  const checks = gate.checks || {};

  const setGate = (id, ok, text) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = `${ok ? '✅' : '❌'} ${text}`;
    el.style.color = ok ? '#86efac' : '#fca5a5';
  };

  setGate('gateAgeStatus', checks.accountAgeOk, `${gate.accountAgeDays} / ${gate.minAccountAgeDays} hari`);
  setGate(
    'gateKycStatus',
    checks.kycOk,
    gate.kycVerified ? 'Terverifikasi' : (gate.kycStatus === 'pending' ? 'Menunggu Admin' : 'Belum KYC')
  );
  setGate('gateBalanceStatus', checks.sufficientBalanceOk, `${Number(statusData.wallet?.diamond || 0)} / ${gate.minDiamond} Diamond`);
  setGate('gateActiveStatus', checks.noActiveRequestOk, gate.activeCount === 0 ? 'Tidak ada (0/1)' : `Aktif (${gate.activeRequestId})`);
  setGate('gateCooldownStatus', checks.cooldownOk, gate.cooldownRemainingDays === 0 ? 'Siap (0 hari)' : `Sisa ${gate.cooldownRemainingDays} hari`);

  const kycBadge = document.getElementById('kycBadge');
  const kycFormWrapper = document.getElementById('kycFormWrapper');
  if (kycBadge) {
    if (gate.kycVerified) {
      kycBadge.textContent = '✅ TERVERIFIKASI';
      kycBadge.style.background = '#166534';
      kycBadge.style.color = '#dcfce7';
      if (kycFormWrapper) kycFormWrapper.style.display = 'none';
    } else if (gate.kycStatus === 'pending') {
      kycBadge.textContent = '⏳ MENUNGGU VERIFIKASI ADMIN';
      kycBadge.style.background = '#854d0e';
      kycBadge.style.color = '#fef9c3';
    } else {
      kycBadge.textContent = '❌ BELUM VERIFIKASI';
      kycBadge.style.background = '#7f1d1d';
      kycBadge.style.color = '#fecaca';
    }
  }

  const queueList = document.getElementById('withdrawQueueList');
  if (queueList) {
    if (!Array.isArray(queue) || queue.length === 0) {
      queueList.innerHTML = '<p style="color: #8da4cf; font-size: 13px; margin: 0;">Belum ada request withdraw.</p>';
    } else {
      queueList.innerHTML = queue.map(q => {
        const st = String(q.status || 'queued').toLowerCase();
        const isQueued = st === 'queued';
        const isRejected = st === 'rejected';
        const statusColor = isQueued ? '#facc15' : (isRejected ? '#f87171' : '#4ade80');
        const date = new Date(q.created_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        const detailMeta = isRejected
          ? `${date} • Refund ${q.refundedDiamond ?? q.grossDiamond} Diamond (${q.reject_reason || 'Ditolak Admin'})`
          : (isQueued ? `${date} • Antrean #${q.queuePosition || 1}` : `${date} • Diproses Admin`);
        return `
          <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:10px 14px; background:#0b1733; border:1px solid #1d3566; border-radius:8px; font-size:13px;">
            <div>
              <strong style="color:#00d4ff;">${q.id}</strong> • ${q.grossDiamond} Diamond → <strong style="color:#4ade80;">${q.netUsdt} USDT</strong> (fee ${q.feePercent}%)
              <div style="font-size:11px; color:#9db2d9;">${detailMeta}</div>
            </div>
            <span style="background:${statusColor}; color:#000; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:800;">${st.toUpperCase()}</span>
          </div>
        `;
      }).join('');
    }
  }
}

async function loadWithdrawStatus() {
  if (!currentUserId) return;
  try {
    const statusData = await fetchServerWithdrawStatus();
    renderWithdrawGateUI(statusData);
  } catch (err) {
    console.error('Gagal memuat status withdraw gate:', err);
  }
}

async function handleKycSubmit() {
  const fullName = document.getElementById('kycFullName')?.value?.trim() || '';
  const idNumber = document.getElementById('kycIdNumber')?.value?.trim() || '';
  const walletAddress = document.getElementById('kycWalletAddress')?.value?.trim() || '';

  try {
    const res = await submitServerKyc({ fullName, idNumber, walletAddress });
    showWithdrawFeedback(`✅ ${res.message}`, false);
    await loadWithdrawStatus();
  } catch (err) {
    showWithdrawFeedback(`❌ ${err.message || 'Gagal mengirim pengajuan KYC.'}`, true);
  }
}

async function requestWithdraw() {
  if (!economyConfig) return;
  const wd = getWithdrawSummary(economyConfig, economyConfig.withdraw.minDiamond);

  if (!window.confirm(`Ajukan request withdraw ${wd.minDiamond} Diamond ke antrean server?\n\nFee ${wd.feePercent}% (-${wd.feeDiamond} Diamond)\nNet diterima: ${wd.netUsdt} USDT\nMode: Antrean (Queue)`)) return;

  let serverRes;
  try {
    serverRes = await requestServerWithdraw(wd.minDiamond);
  } catch (err) {
    showWithdrawFeedback(`❌ ${err.message || 'Withdraw ditolak server.'}`, true);
    showExchangeFeedback(`❌ ${err.message || 'Withdraw ditolak server.'}`, true);
    await loadWithdrawStatus();
    return;
  }

  const wallet = serverRes.wallet;
  userBalances.diamond = Number(wallet.diamond || 0);
  applyServerWalletToDOM(wallet);
  updateBalanceDisplays();

  try {
    await withFirestoreRetry(() => addDoc(collection(db, 'transactions'), {
      user_id: currentUserId,
      type: 'withdraw',
      from_currency: 'Diamond',
      amount_from: serverRes.withdraw.grossDiamond,
      amount_to: serverRes.withdraw.netUsdt,
      fee: serverRes.withdraw.feeDiamond,
      status: 'pending',
      created_at: new Date().toISOString()
    }), 3, 1000);
  } catch (_) {
    // Server ledger & queue sudah mencatat request withdraw permanen
  }

  showWithdrawFeedback(`✅ Request ${serverRes.withdraw.id} masuk antrean (#${serverRes.withdraw.queuePosition}): ${serverRes.withdraw.grossDiamond} Diamond → Net ${serverRes.withdraw.netUsdt} USDT.`, false);
  showExchangeFeedback('✅ Permintaan Withdraw berhasil masuk antrean server (queue)!', false);
  await Promise.all([loadTransactions(), loadWithdrawStatus()]);
}

async function loadTransactions() {
  const list = document.getElementById('transactionList');
  if (!currentUserId || !list) return;

  let entries = [];
  try {
    const res = await fetchServerLedger(20);
    entries = Array.isArray(res.entries) ? res.entries : [];
  } catch (err) {
    list.innerHTML = '<p style="text-align:center; color:#f87171; padding:20px;">Gagal memuat Ledger dari server.</p>';
    return;
  }

  if (entries.length === 0) {
    list.innerHTML = '<p style="text-align:center; color:#9db2d9; padding:20px;">Belum ada catatan Ledger di server.</p>';
    return;
  }

  list.innerHTML = `
    <div style="margin-bottom:10px; font-size:12px; color:#86efac;">🔒 Ledger Server Permanen (hanya-baca, tidak dapat diedit atau dihapus)</div>
    ${entries.map(item => {
      const date = new Date(item.waktu).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      const isMasuk = item.jenis_transaksi === 'masuk';
      const badgeBg = isMasuk ? '#22c55e' : '#ef4444';
      const sign = isMasuk ? '+' : '-';
      const unit = String(item.mata_uang || '').toUpperCase();
      return `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:14px; border-bottom:1px solid #1e3566; color:white;">
          <div>
            <div style="font-weight:bold; color:#00d4ff;">${item.keterangan || item.kategori}</div>
            <div style="font-size:12px; color:#9db2d9;">${date} • Akun: ${item.akun}</div>
            <div style="font-size:12px; color:#cbd5e1; margin-top:2px;">Saldo: ${Number(item.saldo_sebelum).toLocaleString('id-ID')} → <strong>${Number(item.saldo_sesudah).toLocaleString('id-ID')} ${unit}</strong></div>
          </div>
          <div style="text-align:right; white-space:nowrap;">
            <div style="font-weight:bold; color:${isMasuk ? '#86efac' : '#fca5a5'}; margin-bottom:4px;">${sign}${Number(item.jumlah).toLocaleString('id-ID')} ${unit}</div>
            <span style="background:${badgeBg}; color:#000; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:bold;">${item.jenis_transaksi.toUpperCase()}</span>
          </div>
        </div>
      `;
    }).join('')}
  `;
}

document.addEventListener('DOMContentLoaded', async function() {
  try {
    economyConfig = await loadEconomyConfig();
    renderWithdrawPolicyUI(economyConfig);

    const initialLoad = loadMarketState({ economyConfig });
    renderMarketUI(initialLoad.state);
    if (initialLoad.advancedByGameTurn > 0 && initialLoad.latestEntry) {
      showMarketNotification(formatTurnNotification(initialLoad.latestEntry), 'info');
    }

    const defaultTab = document.querySelector('.direction-tab[data-direction="currency-gold"]');
    setExchangeDirection('currency-gold', defaultTab, false);

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
      const matchSync = syncMarketWithMatches(totalMatches, { economyConfig });
      if (matchSync.advancedCount > 0) {
        renderMarketUI(matchSync.state);
        if (matchSync.latestEntry) {
          showMarketNotification(formatTurnNotification(matchSync.latestEntry), 'info');
        }
      }
    }

    await Promise.all([loadTransactions(), loadWithdrawStatus()]);
  } catch (err) {
    console.error('Financial market error:', err);
  }
});

window.handleLogout = handleLogout;
window.setExchangeDirection = setExchangeDirection;
window.applyQuickMatchSample = applyQuickMatchSample;
window.calculateExchange = calculateExchange;
window.executeExchange = executeExchange;
window.requestWithdraw = requestWithdraw;
window.handleKycSubmit = handleKycSubmit;
window.handleNextTurn = handleNextTurn;
