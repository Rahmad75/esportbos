import { signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  auth,
  FALLBACK_AVATAR_URL,
  getCurrentUserOnce,
  getOrCreateProfile,
  getOrCreateTeam,
  getSafeUserAvatarUrl
} from './firebase-config.js';
import {
  applyServerWalletToDOM,
  fetchMyTopupRequests,
  fetchServerWallet,
  fetchTopupConfig,
  submitManualTopupRequest
} from './economy-client.js';

let topupConfig = null;
let selectedPackageId = 'starter';
let selectedPaymentMethod = 'dana_qris';
let uploadedReceiptDataUrl = '';

function escapeHtml(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showTopupFeedback(message, isError = false) {
  const el = document.getElementById('topupSubmitFeedback');
  if (!el) return;
  el.textContent = message;
  el.style.display = 'block';
  el.style.background = isError ? 'rgba(220, 38, 38, 0.2)' : 'rgba(22, 163, 74, 0.2)';
  el.style.border = isError ? '1px solid #ef4444' : '1px solid #22c55e';
  el.style.color = isError ? '#fecaca' : '#bbf7d0';
}

function clearTopupFeedback() {
  const el = document.getElementById('topupSubmitFeedback');
  if (el) el.style.display = 'none';
}

async function handleLogout() {
  await signOut(auth);
  window.location.href = 'index.html';
}

function getPackagesMap() {
  return topupConfig?.packages || {
    starter: { id: 'starter', name: 'Starter', priceIdr: 50000, priceUsdt: 3.25, diamonds: 100, bonusGold: 50 },
    pro: { id: 'pro', name: 'Pro', priceIdr: 200000, priceUsdt: 13, diamonds: 500, bonusGold: 300 },
    elite: { id: 'elite', name: 'Elite', priceIdr: 500000, priceUsdt: 32.5, diamonds: 1500, bonusGold: 1000 }
  };
}

function renderTopupConfigToUI() {
  if (!topupConfig) return;
  const pkgs = getPackagesMap();

  for (const pkgId of ['starter', 'pro', 'elite']) {
    const pkg = pkgs[pkgId];
    if (!pkg) continue;
    const setTxt = (id, txt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = txt;
    };
    setTxt(`pkg-name-${pkgId}`, pkg.name);
    setTxt(`pkg-diamonds-${pkgId}`, Number(pkg.diamonds).toLocaleString('id-ID'));
    setTxt(`pkg-idr-${pkgId}`, `Rp ${Number(pkg.priceIdr).toLocaleString('id-ID')}`);
    setTxt(`pkg-usdt-${pkgId}`, `atau ${Number(pkg.priceUsdt)} USDT (Solana)`);
    setTxt(`pkg-list-d-${pkgId}`, Number(pkg.diamonds).toLocaleString('id-ID'));
    setTxt(`pkg-list-g-${pkgId}`, Number(pkg.bonusGold || 0).toLocaleString('id-ID'));
  }

  if (topupConfig.dana) {
    const titleEl = document.getElementById('danaMerchantTitle');
    if (titleEl && topupConfig.dana.merchantName) {
      titleEl.textContent = `QRIS ${topupConfig.dana.merchantName}`;
    }
    const imgEl = document.getElementById('danaQrisImg');
    if (imgEl && topupConfig.dana.qrisImagePath) {
      imgEl.src = topupConfig.dana.qrisImagePath;
    }
    const instEl = document.getElementById('danaInstructionsList');
    if (instEl && Array.isArray(topupConfig.dana.instructions)) {
      instEl.innerHTML = topupConfig.dana.instructions.map(step => `<li>${escapeHtml(step)}</li>`).join('');
    }
  }

  if (topupConfig.solana) {
    const netEl = document.getElementById('solanaNetworkLabel');
    if (netEl && topupConfig.solana.network) {
      netEl.textContent = `Wallet Crypto (${topupConfig.solana.network})`;
    }
    const qrEl = document.getElementById('solanaQrImg');
    if (qrEl && topupConfig.solana.qrImagePath) {
      qrEl.src = topupConfig.solana.qrImagePath;
    }
    const addrEl = document.getElementById('solanaWalletAddressText');
    if (addrEl && topupConfig.solana.walletAddress) {
      addrEl.textContent = topupConfig.solana.walletAddress;
    }
    const instEl = document.getElementById('solanaInstructionsList');
    if (instEl && Array.isArray(topupConfig.solana.instructions)) {
      instEl.innerHTML = topupConfig.solana.instructions.map(step => `<li>${escapeHtml(step)}</li>`).join('');
    }
  }

  updateSelectedPackageUI();
}

function updateSelectedPackageUI() {
  const pkgs = getPackagesMap();
  const pkg = pkgs[selectedPackageId] || pkgs.starter;
  if (!pkg) return;

  const accentMap = { starter: '#667eea', pro: '#ff9800', elite: '#f5576c' };
  for (const id of ['starter', 'pro', 'elite']) {
    const card = document.getElementById(`pkg-card-${id}`);
    const btn = document.getElementById(`pkg-btn-${id}`);
    const isActive = id === selectedPackageId;
    if (card) {
      card.style.border = isActive ? `3px solid ${accentMap[id] || '#38bdf8'}` : '2px solid #334155';
      card.style.boxShadow = isActive ? `0 0 18px ${accentMap[id]}44` : 'none';
    }
    if (btn) {
      btn.style.background = isActive ? (accentMap[id] || '#38bdf8') : '#334155';
      btn.textContent = isActive ? '✓ Paket Dipilih' : 'Pilih Paket';
    }
  }

  const summaryEl = document.getElementById('selectedPackageSummary');
  if (summaryEl) {
    summaryEl.textContent = `${pkg.name} (${Number(pkg.diamonds).toLocaleString('id-ID')} Diamond + ${Number(pkg.bonusGold || 0).toLocaleString('id-ID')} Bonus Gold — Rp ${Number(pkg.priceIdr).toLocaleString('id-ID')} / ${pkg.priceUsdt} USDT)`;
  }
  const danaNomEl = document.getElementById('danaNominalText');
  if (danaNomEl) {
    danaNomEl.textContent = `Rp ${Number(pkg.priceIdr).toLocaleString('id-ID')}`;
  }
  const solNomEl = document.getElementById('solanaNominalText');
  if (solNomEl) {
    solNomEl.textContent = `${pkg.priceUsdt} USDT`;
  }
}

function selectTopupPackage(packageId) {
  selectedPackageId = packageId;
  clearTopupFeedback();
  updateSelectedPackageUI();
}

function selectPaymentMethod(method) {
  selectedPaymentMethod = method === 'usdt_solana' ? 'usdt_solana' : 'dana_qris';
  clearTopupFeedback();

  const danaBtn = document.getElementById('methodBtn-dana_qris');
  const solBtn = document.getElementById('methodBtn-usdt_solana');
  const danaPanel = document.getElementById('panel-dana_qris');
  const solPanel = document.getElementById('panel-usdt_solana');

  const isDana = selectedPaymentMethod === 'dana_qris';
  if (danaBtn) {
    danaBtn.style.border = isDana ? '2px solid #38bdf8' : '2px solid #334155';
    danaBtn.style.background = isDana ? '#0f172a' : '#16213e';
  }
  if (solBtn) {
    solBtn.style.border = !isDana ? '2px solid #4ade80' : '2px solid #334155';
    solBtn.style.background = !isDana ? '#0f172a' : '#16213e';
  }
  if (danaPanel) danaPanel.style.display = isDana ? 'block' : 'none';
  if (solPanel) solPanel.style.display = !isDana ? 'block' : 'none';
}

function handleReceiptFileChange(event) {
  const file = event?.target?.files?.[0];
  if (!file) {
    clearReceiptUpload();
    return;
  }
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    showTopupFeedback('❌ Foto struk harus berformat PNG, JPG, atau WEBP.', true);
    clearReceiptUpload();
    return;
  }
  if (file.size > 1.5 * 1024 * 1024) {
    showTopupFeedback('❌ Ukuran file foto struk maksimal 1.5 MB.', true);
    clearReceiptUpload();
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const result = typeof reader.result === 'string' ? reader.result : '';
    if (!/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(result)) {
      showTopupFeedback('❌ File gambar tidak valid.', true);
      clearReceiptUpload();
      return;
    }
    uploadedReceiptDataUrl = result;
    const wrap = document.getElementById('danaReceiptPreviewWrap');
    const img = document.getElementById('danaReceiptPreviewImg');
    if (img) img.src = result;
    if (wrap) wrap.style.display = 'flex';
    clearTopupFeedback();
  };
  reader.readAsDataURL(file);
}

function clearReceiptUpload() {
  uploadedReceiptDataUrl = '';
  const input = document.getElementById('danaReceiptInput');
  const wrap = document.getElementById('danaReceiptPreviewWrap');
  const img = document.getElementById('danaReceiptPreviewImg');
  if (input) input.value = '';
  if (img) img.src = '';
  if (wrap) wrap.style.display = 'none';
}

async function copySolanaWallet() {
  const addrEl = document.getElementById('solanaWalletAddressText');
  const noticeEl = document.getElementById('copySolanaNotice');
  const addr = addrEl ? addrEl.textContent.trim() : '';
  if (!addr) return;
  try {
    await navigator.clipboard.writeText(addr);
  } catch (_) {
    const ta = document.createElement('textarea');
    ta.value = addr;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  if (noticeEl) {
    noticeEl.style.display = 'block';
    setTimeout(() => { noticeEl.style.display = 'none'; }, 3000);
  }
}

async function submitTopupOrder() {
  const btn = document.getElementById('btnSubmitTopup');
  try {
    clearTopupFeedback();
    const payload = {
      packageId: selectedPackageId,
      paymentMethod: selectedPaymentMethod
    };

    if (selectedPaymentMethod === 'dana_qris') {
      const refVal = (document.getElementById('danaReferenceInput')?.value || '').trim();
      if (!refVal && !uploadedReceiptDataUrl) {
        showTopupFeedback('❌ Wajib mengisi Nomor Referensi DANA atau mengunggah Foto Struk transfer terlebih dahulu.', true);
        return;
      }
      if (refVal) payload.referenceNumber = refVal;
      if (uploadedReceiptDataUrl) payload.receiptImage = uploadedReceiptDataUrl;
    } else {
      const txidVal = (document.getElementById('solanaTxidInput')?.value || '').trim();
      if (!txidVal) {
        showTopupFeedback('❌ Wajib memasukkan TXID (Transaction Hash) transfer USDT Solana terlebih dahulu.', true);
        return;
      }
      payload.txid = txidVal;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Mengirim ke Antrean Verifikasi...';
    }

    const res = await submitManualTopupRequest(payload);
    showTopupFeedback(`⏳ ${res.message || 'Permintaan Top-Up dikirim dengan status PENDING_VERIFICATION.'}`, false);

    if (selectedPaymentMethod === 'dana_qris') {
      const refInput = document.getElementById('danaReferenceInput');
      if (refInput) refInput.value = '';
      clearReceiptUpload();
    } else {
      const txidInput = document.getElementById('solanaTxidInput');
      if (txidInput) txidInput.value = '';
    }

    if (res.wallet) {
      applyServerWalletToDOM(res.wallet);
    }
    await loadRiwayatPendanaan();
  } catch (error) {
    showTopupFeedback(`❌ ${error.message || 'Gagal mengirim permintaan top-up.'}`, true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🛒 Beli Paket';
    }
  }
}

async function loadRiwayatPendanaan() {
  const container = document.getElementById('riwayatPendanaan');
  if (!container) return;

  try {
    const res = await fetchMyTopupRequests();
    const data = res.requests || [];

    if (!data.length) {
      container.innerHTML = '<p style="color: #999;">Belum ada riwayat pendanaan. Pilih paket &amp; kirim bukti transfer pertama Anda.</p>';
      return;
    }

    const statusBadge = (status) => {
      if (status === 'APPROVED') {
        return '<span style="padding: 5px 12px; background: #16a34a; color: white; border-radius: 6px; font-size: 12px; font-weight: bold;">✅ APPROVED</span>';
      }
      if (status === 'REJECTED') {
        return '<span style="padding: 5px 12px; background: #dc2626; color: white; border-radius: 6px; font-size: 12px; font-weight: bold;">❌ REJECTED</span>';
      }
      return '<span style="padding: 5px 12px; background: #d97706; color: white; border-radius: 6px; font-size: 12px; font-weight: bold;">⏳ PENDING_VERIFICATION</span>';
    };

    container.innerHTML = `
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; color: white; text-align: left;">
          <thead>
            <tr style="background: #16213e; border-bottom: 2px solid #334155;">
              <th style="padding: 12px;">ID &amp; Tanggal</th>
              <th style="padding: 12px;">Paket &amp; Reward</th>
              <th style="padding: 12px;">Metode &amp; Bukti</th>
              <th style="padding: 12px;">Nominal</th>
              <th style="padding: 12px;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${data.map(tx => {
              const dateStr = tx.created_at ? new Date(tx.created_at).toLocaleString('id-ID') : '-';
              const nominal = tx.payment_method === 'usdt_solana'
                ? `${tx.price_usdt} USDT`
                : `Rp ${Number(tx.price_idr || 0).toLocaleString('id-ID')}`;
              const proofStr = tx.txid
                ? `TXID: ${escapeHtml(tx.txid)}`
                : (tx.reference_number ? `Ref: ${escapeHtml(tx.reference_number)}` : (tx.receipt_image ? 'Foto Struk terlampir' : '-'));
              const rejectNote = tx.status === 'REJECTED' && tx.reject_reason
                ? `<div style="font-size: 12px; color: #fca5a5; margin-top: 4px;">Alasan: ${escapeHtml(tx.reject_reason)}</div>`
                : '';

              return `
                <tr style="border-bottom: 1px solid #334155;">
                  <td style="padding: 12px;">
                    <strong style="color: #38bdf8;">${escapeHtml(tx.id)}</strong>
                    <div style="font-size: 12px; color: #94a3b8;">${escapeHtml(dateStr)}</div>
                  </td>
                  <td style="padding: 12px;">
                    <strong>${escapeHtml(tx.package_name || tx.package_id)}</strong>
                    <div style="font-size: 12px; color: #cbd5e1;">💎 ${Number(tx.diamonds || 0)} D + 🟡 ${Number(tx.bonus_gold || 0)} G</div>
                  </td>
                  <td style="padding: 12px;">
                    <div>${escapeHtml(tx.payment_method_label || tx.payment_method)}</div>
                    <div style="font-size: 12px; color: #94a3b8; word-break: break-all;">${proofStr}</div>
                  </td>
                  <td style="padding: 12px; font-weight: bold;">${escapeHtml(nominal)}</td>
                  <td style="padding: 12px;">
                    ${statusBadge(tx.status)}
                    ${rejectNote}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    console.error('Error loading riwayat:', err);
    container.innerHTML = `<p style="color: #f87171;">Gagal memuat riwayat: ${escapeHtml(err.message)}</p>`;
  }
}

document.addEventListener('DOMContentLoaded', async function() {
  const user = await getCurrentUserOnce();
  if (!user) {
    window.location.href = 'index.html';
    return;
  }

  const [profile, walletRes, cfgRes] = await Promise.all([
    getOrCreateProfile(user),
    fetchServerWallet().catch(() => null),
    fetchTopupConfig().catch(() => null)
  ]);
  const team = await getOrCreateTeam(user, profile?.club_name);

  if (profile) {
    const username = profile.username || user.email.split('@')[0];
    document.getElementById('userName').textContent = username;
    const navAvatar = document.getElementById('navAvatar');
    if (navAvatar) {
      navAvatar.onerror = () => { navAvatar.onerror = null; navAvatar.src = FALLBACK_AVATAR_URL; };
      navAvatar.src = getSafeUserAvatarUrl(profile, username);
    }
  }

  if (walletRes?.wallet) {
    applyServerWalletToDOM(walletRes.wallet);
  }

  if (cfgRes?.topUp) {
    topupConfig = cfgRes.topUp;
    renderTopupConfigToUI();
  }

  if (team) {
    document.getElementById('clubName').textContent = team.team_name;
    document.getElementById('clubRank').textContent = `${team.wins}W - ${team.draws}D - ${team.losses}L`;
    document.getElementById('popularityText').textContent = `Popularitas Klub: ${team.popularity}%`;
    document.getElementById('popularityBar').style.width = `${team.popularity}%`;
    document.getElementById('moralText').textContent = `Moral Tim: ${team.moral}%`;
    document.getElementById('moralBar').style.width = `${team.moral}%`;
  }

  selectTopupPackage('starter');
  selectPaymentMethod('dana_qris');
  await loadRiwayatPendanaan();
});

window.handleLogout = handleLogout;
window.selectTopupPackage = selectTopupPackage;
window.selectPaymentMethod = selectPaymentMethod;
window.handleReceiptFileChange = handleReceiptFileChange;
window.clearReceiptUpload = clearReceiptUpload;
window.copySolanaWallet = copySolanaWallet;
window.submitTopupOrder = submitTopupOrder;
