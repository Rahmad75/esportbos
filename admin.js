import { signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {
  auth,
  db,
  getCurrentUserOnce,
  handleFirestoreError,
  OperationType
} from './firebase-config.js';
import {
  loadEconomyConfig
} from './economy-config.js';
import {
  adminResetServerWallet,
  approveAdminWithdraw,
  fetchAdminEconomyDashboard,
  rejectAdminWithdraw
} from './economy-client.js';

const ADMIN_EMAILS = [
  'muhammadgazali75@gmail.com',
  'angriyani1977@gmail.com',
  'm.gazali1975@gmail.com'
];

let currentUser = null;
let economyDashboardData = null;
let selectedEconomyPeriod = 'allTime';
let pendingInlineAction = null; // { id, type: 'approve' | 'reject' }

function escapeHtml(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtNum(val, maxFrac = 2) {
  return Number(val || 0).toLocaleString('id-ID', { maximumFractionDigits: maxFrac });
}

async function handleLogout() {
  await signOut(auth);
  window.location.href = 'index.html';
}

function renderUserTable(profiles, teams) {
  const tbody = document.getElementById('userTableBody');
  if (!tbody) return;

  if (!profiles.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#999;">Belum ada user terdaftar.</td></tr>';
    return;
  }

  tbody.innerHTML = profiles.map(p => {
    const userTeam = teams.find(t => t.user_id === p.id);
    const isAdmin = p.id === currentUser.uid && ADMIN_EMAILS.includes((currentUser.email || '').toLowerCase());
    const roleLabel = isAdmin ? 'ADMIN' : 'USER';
    return `
      <tr>
        <td><strong>${escapeHtml(p.username || 'Manager')}</strong></td>
        <td>${escapeHtml(String(p.id || '').slice(0, 10))}...</td>
        <td><span class="role-badge ${isAdmin ? 'admin' : 'user'}">${roleLabel}</span></td>
        <td>${escapeHtml(userTeam ? userTeam.team_name : (p.club_name || '-'))}</td>
        <td>${fmtNum(p.gold || 0, 2)} G</td>
        <td>-</td>
      </tr>
    `;
  }).join('');
}

function renderSystemLogs(matches) {
  const container = document.getElementById('systemLogs');
  if (!container) return;

  if (!matches || matches.length === 0) {
    container.innerHTML = '<p style="color:#999;">Belum ada aktivitas match.</p>';
    return;
  }

  const sorted = [...matches].sort((a, b) => new Date(b.match_date || 0) - new Date(a.match_date || 0));
  container.innerHTML = sorted.slice(0, 5).map(m => `
    <div class="log-item">
      <span class="log-time">${m.match_date ? new Date(m.match_date).toLocaleDateString('id-ID') : '-'}</span>
      <span class="log-action">${m.result === 'win' ? '✅ WIN' : (m.result === 'draw' ? '➖ DRAW' : '❌ LOSE')} ${escapeHtml(m.home_team_name || 'Home')} vs ${escapeHtml(m.away_team_name || 'Away')} (${Number(m.home_score ?? 0)}-${Number(m.away_score ?? 0)})</span>
    </div>
  `).join('');
}

function showWithdrawFeedback(msg, isError = false) {
  const box = document.getElementById('adminWithdrawFeedback');
  if (!box) return;
  box.textContent = msg;
  box.className = `econ-feedback ${isError ? 'error' : 'success'}`;
}

function renderEconomyMetricsAndLiability(data) {
  if (!data) return;
  const metrics = data.metrics?.[selectedEconomyPeriod] || data.metrics?.allTime;
  const liability = data.liability || {};
  if (!metrics) return;

  const faucetEl = document.getElementById('econTotalFaucet');
  const faucetSubEl = document.getElementById('econTotalFaucetSub');
  const sinkEl = document.getElementById('econTotalSink');
  const sinkSubEl = document.getElementById('econTotalSinkSub');
  const netEl = document.getElementById('econNetEmission');
  const netSubEl = document.getElementById('econNetEmissionSub');
  const covEl = document.getElementById('econSinkCoverage');
  const covSubEl = document.getElementById('econSinkCoverageSub');
  const liabEl = document.getElementById('econDiamondLiability');
  const liabSubEl = document.getElementById('econDiamondLiabilitySub');

  if (faucetEl) faucetEl.textContent = `${fmtNum(metrics.totalFaucetCurrency, 0)} C`;
  if (faucetSubEl) faucetSubEl.textContent = `Setara ${fmtNum(metrics.totalFaucetDiamond, 4)} D (${metrics.transactionCount || 0} transaksi)`;

  if (sinkEl) sinkEl.textContent = `${fmtNum(metrics.totalSinkCurrency, 0)} C`;
  if (sinkSubEl) {
    const sb = metrics.sinkBreakdownCurrency || {};
    sinkSubEl.textContent = `Setara ${fmtNum(metrics.totalSinkDiamond, 4)} D (Game: ${fmtNum(sb.gameplayAndWeekly || 0, 0)}, Fee: ${fmtNum((sb.conversionFees || 0) + (sb.marketFees || 0) + (sb.withdrawFees || 0), 0)})`;
  }

  if (netEl) {
    const netSign = metrics.netEmissionCurrency > 0 ? '+' : '';
    netEl.textContent = `${netSign}${fmtNum(metrics.netEmissionCurrency, 0)} C`;
    netEl.className = `stat-value ${metrics.netEmissionCurrency <= 0 ? 'econ-stat-value-green' : 'econ-stat-value-cyan'}`;
  }
  if (netSubEl) netSubEl.textContent = `Setara ${fmtNum(metrics.netEmissionDiamond, 4)} Diamond`;

  const covPct = Number(metrics.sinkCoveragePercent || 0);
  if (covEl) {
    covEl.textContent = `${fmtNum(covPct, 2)}%`;
    covEl.className = `stat-value ${covPct >= 80 ? 'econ-stat-value-green' : (covPct >= 30 ? 'econ-stat-value-amber' : 'econ-stat-value-red')}`;
  }
  if (covSubEl) {
    if (metrics.totalFaucetCurrency === 0 && metrics.totalSinkCurrency === 0) {
      covSubEl.textContent = 'Belum ada transaksi faucet/sink pada periode ini';
    } else if (covPct >= 100) {
      covSubEl.textContent = 'Deflasi / Sangat Sehat (Sink >= Faucet)';
    } else if (covPct >= 50) {
      covSubEl.textContent = 'Cukup Terkendali (Faucet > Sink)';
    } else {
      covSubEl.textContent = 'Perlu Pengawasan Inflasi (Sink rendah)';
    }
  }

  if (liabEl) liabEl.textContent = `${fmtNum(liability.totalDiamondLiability || 0, 4)} D`;
  if (liabSubEl) {
    liabSubEl.textContent = `≈ ${fmtNum(liability.totalUsdtLiability || 0, 2)} USDT (${fmtNum(liability.circulatingDiamonds || 0, 4)} D dompet + ${fmtNum(liability.queuedWithdrawDiamonds || 0, 4)} D antrean)`;
  }

  const breakdownBody = document.getElementById('econCurrencyBreakdownBody');
  if (breakdownBody) {
    const bc = metrics.byCurrency || {};
    const rows = [
      { key: 'currency', label: 'Currency (C)', circ: liability.circulatingCurrency || 0, maxFrac: 0 },
      { key: 'gold', label: 'Gold (G)', circ: liability.circulatingGold || 0, maxFrac: 2 },
      { key: 'diamond', label: 'Diamond (D)', circ: liability.circulatingDiamonds || 0, maxFrac: 4 }
    ];
    breakdownBody.innerHTML = rows.map(r => {
      const item = bc[r.key] || { masuk: 0, keluar: 0, net: 0 };
      const netColor = item.net >= 0 ? '#4ade80' : '#f87171';
      return `
        <tr>
          <td><strong>${r.label}</strong></td>
          <td style="color:#4ade80;">+${fmtNum(item.masuk, r.maxFrac)}</td>
          <td style="color:#f87171;">-${fmtNum(item.keluar, r.maxFrac)}</td>
          <td style="color:${netColor}; font-weight:700;">${item.net > 0 ? '+' : ''}${fmtNum(item.net, r.maxFrac)}</td>
          <td style="color:#fbbf24; font-weight:700;">${fmtNum(r.circ, r.maxFrac)}</td>
        </tr>
      `;
    }).join('');
  }
}

function renderWithdrawQueueTable(queue = []) {
  const tbody = document.getElementById('withdrawQueueTableBody');
  const badge = document.getElementById('withdrawQueueBadge');
  if (!tbody) return;

  const queuedCount = queue.filter(q => q.status === 'queued').length;
  if (badge) {
    badge.textContent = `${queuedCount} ANTREAN AKTIF`;
    badge.className = `econ-badge ${queuedCount > 0 ? 'econ-badge-queued' : 'econ-badge-approved'}`;
  }

  if (!queue.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#94a3b8;">Belum ada permintaan withdraw di antrean server.</td></tr>';
    return;
  }

  tbody.innerHTML = queue.map(q => {
    const status = String(q.status || 'queued').toLowerCase();
    const isQueued = status === 'queued';
    const createdStr = q.created_at
      ? new Date(q.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '-';
    const safeId = escapeHtml(q.id);
    const isConfirmingApprove = pendingInlineAction?.id === q.id && pendingInlineAction?.type === 'approve';
    const isConfirmingReject = pendingInlineAction?.id === q.id && pendingInlineAction?.type === 'reject';

    let actionHtml = '';
    if (isQueued) {
      actionHtml = `
        <div class="econ-action-group">
          <button type="button" class="btn-approve" onclick="openWithdrawConfirm('${safeId}', 'approve')">✅ Approve</button>
          <button type="button" class="btn-reject" onclick="openWithdrawConfirm('${safeId}', 'reject')">❌ Reject</button>
        </div>
      `;
      if (isConfirmingApprove) {
        actionHtml += `
          <div class="econ-inline-box">
            <span style="font-size:12px; color:#bbf7d0;">Kirim payout <strong>${fmtNum(q.netUsdt, 2)} USDT</strong> dan tandai Approved?</span>
            <input type="text" id="approveTxInput-${safeId}" class="econ-inline-input" placeholder="Opsional: TX Hash / Catatan transfer">
            <div class="econ-action-group">
              <button type="button" class="btn-approve" onclick="confirmApproveWithdraw('${safeId}')">Ya, Approve</button>
              <button type="button" class="btn-neutral" onclick="cancelWithdrawConfirm()">Batal</button>
            </div>
          </div>
        `;
      } else if (isConfirmingReject) {
        actionHtml += `
          <div class="econ-inline-box">
            <span style="font-size:12px; color:#fecaca;">Tolak &amp; refund <strong>${fmtNum(q.grossDiamond, 4)} Diamond</strong> ke akun player?</span>
            <input type="text" id="rejectReasonInput-${safeId}" class="econ-inline-input" placeholder="Alasan penolakan (contoh: Alamat wallet tidak valid)">
            <div class="econ-action-group">
              <button type="button" class="btn-reject" onclick="confirmRejectWithdraw('${safeId}')">Ya, Reject &amp; Refund</button>
              <button type="button" class="btn-neutral" onclick="cancelWithdrawConfirm()">Batal</button>
            </div>
          </div>
        `;
      }
    } else if (status === 'rejected') {
      actionHtml = `<span class="econ-subtext">Refund ${fmtNum(q.refundedDiamond ?? q.grossDiamond, 4)} D • ${escapeHtml(q.reject_reason || 'Ditolak Admin')}</span>`;
    } else {
      const refText = q.txHash ? `TX: ${escapeHtml(q.txHash)}` : `Oleh ${escapeHtml(q.approved_by || 'Owner')}`;
      actionHtml = `<span class="econ-subtext" style="color:#4ade80;">Selesai • ${refText}</span>`;
    }

    return `
      <tr>
        <td>
          <strong style="color:#38bdf8;">${safeId}</strong>
          <div class="econ-subtext">${createdStr}${isQueued ? ` • Antrean #${Number(q.queuePosition || 1)}` : ''}</div>
        </td>
        <td>
          <strong>${escapeHtml(q.akun || q.user_id)}</strong>
          <div class="econ-subtext">Wallet: ${escapeHtml(q.destinationWallet || '-')}</div>
        </td>
        <td>
          <strong>${fmtNum(q.grossDiamond, 4)} Diamond</strong> → <strong style="color:#4ade80;">${fmtNum(q.netUsdt, 2)} USDT</strong>
          <div class="econ-subtext">Fee ${Number(q.feePercent || 0)}% (${fmtNum(q.feeDiamond, 4)} D)</div>
        </td>
        <td>
          <span class="econ-badge econ-badge-${escapeHtml(status)}">${escapeHtml(status.toUpperCase())}</span>
        </td>
        <td>${actionHtml}</td>
      </tr>
    `;
  }).join('');
}

function renderTop1PercentTable(top1) {
  const tbody = document.getElementById('top1PercentTableBody');
  const metaEl = document.getElementById('top1PercentMeta');
  if (!tbody) return;

  const users = top1?.users || [];
  const totalUsers = Number(top1?.totalUsers || 0);
  const topCount = Number(top1?.topCount || 0);

  if (metaEl) {
    metaEl.textContent = totalUsers > 0
      ? `Menampilkan ${topCount} akun Top 1% terkaya dari total ${totalUsers} dompet terdaftar (Total kekayaan sistem: ${fmtNum(top1?.totalSystemEquivDiamond || 0, 4)} D).`
      : 'Belum ada dompet pemain terdaftar di server.';
  }

  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#94a3b8;">Belum ada data dompet pemain.</td></tr>';
    return;
  }

  tbody.innerHTML = users.map(u => `
    <tr>
      <td><strong style="color:#fbbf24;">#${u.rank}</strong></td>
      <td>
        <strong>${escapeHtml(u.akun || u.user_id)}</strong>
        <div class="econ-subtext">UID: ${escapeHtml(String(u.user_id || '').slice(0, 12))}... • KYC: ${escapeHtml(u.kycStatus || 'unverified')}</div>
      </td>
      <td style="color:#38bdf8; font-weight:700;">${fmtNum(u.diamond, 4)} D</td>
      <td style="color:#fbbf24; font-weight:700;">${fmtNum(u.gold, 2)} G</td>
      <td>${fmtNum(u.currency, 0)} C</td>
      <td>
        <strong style="color:#4ade80;">${fmtNum(u.equivalentDiamond, 4)} D</strong>
        <div class="econ-subtext">≈ ${fmtNum(u.equivalentUsdt, 2)} USDT</div>
      </td>
      <td><strong>${fmtNum(u.sharePercent, 2)}%</strong></td>
    </tr>
  `).join('');
}

function renderEconomyDashboard(data) {
  economyDashboardData = data;
  renderEconomyMetricsAndLiability(data);
  renderWithdrawQueueTable(data?.withdrawQueue || []);
  renderTop1PercentTable(data?.top1Percent || {});
}

async function loadEconomyDashboard() {
  try {
    const data = await fetchAdminEconomyDashboard();
    renderEconomyDashboard(data);
    return data;
  } catch (err) {
    console.error('Gagal memuat dashboard ekonomi admin:', err);
    showWithdrawFeedback(`⚠️ Gagal memuat data ekonomi server: ${err.message}`, true);
    return null;
  }
}

function openWithdrawConfirm(withdrawId, type) {
  pendingInlineAction = { id: withdrawId, type };
  renderWithdrawQueueTable(economyDashboardData?.withdrawQueue || []);
}

function cancelWithdrawConfirm() {
  pendingInlineAction = null;
  renderWithdrawQueueTable(economyDashboardData?.withdrawQueue || []);
}

async function confirmApproveWithdraw(withdrawId) {
  const txInput = document.getElementById(`approveTxInput-${withdrawId}`);
  const txHash = txInput ? txInput.value.trim() : '';
  try {
    const res = await approveAdminWithdraw(withdrawId, txHash);
    pendingInlineAction = null;
    showWithdrawFeedback(`✅ ${res.message || `Withdraw ${withdrawId} berhasil di-Approve.`}`, false);
    await loadEconomyDashboard();
  } catch (err) {
    showWithdrawFeedback(`❌ Gagal Approve withdraw: ${err.message}`, true);
  }
}

async function confirmRejectWithdraw(withdrawId) {
  const reasonInput = document.getElementById(`rejectReasonInput-${withdrawId}`);
  const reason = reasonInput && reasonInput.value.trim()
    ? reasonInput.value.trim()
    : 'Ditolak oleh Admin';
  try {
    const res = await rejectAdminWithdraw(withdrawId, reason);
    pendingInlineAction = null;
    showWithdrawFeedback(`✅ ${res.message || `Withdraw ${withdrawId} ditolak & saldo dikembalikan.`}`, false);
    await loadEconomyDashboard();
  } catch (err) {
    showWithdrawFeedback(`❌ Gagal Reject withdraw: ${err.message}`, true);
  }
}

function setEconomyPeriod(period, btnEl) {
  selectedEconomyPeriod = period;
  document.querySelectorAll('.econ-period-btn[data-period]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.period === period);
  });
  if (btnEl) btnEl.classList.add('active');
  if (economyDashboardData) {
    renderEconomyMetricsAndLiability(economyDashboardData);
  }
}

async function loadAdminData() {
  let profiles = [];
  let teams = [];
  let matches = [];

  const econPromise = loadEconomyDashboard();

  try {
    const profileSnap = await getDocs(query(collection(db, 'profiles'), where('prediction_score', '>=', 0)));
    profiles = profileSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn('Firestore profiles read warning:', err.message);
  }

  try {
    const matchSnap = await getDocs(query(collection(db, 'matches'), where('status', 'in', ['scheduled', 'finished'])));
    matches = matchSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn('Firestore matches read warning:', err.message);
  }

  try {
    const teamSnap = await getDocs(collection(db, 'teams'));
    teams = teamSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn('Admin teams read restricted by Firestore rules until admin doc/verified email is configured:', err.message);
  }

  const econData = await econPromise;
  const serverGold = econData?.liability?.circulatingGold;
  const firestoreGold = profiles.reduce((sum, p) => sum + Number(p.gold || 0), 0);
  const totalGold = Number.isFinite(serverGold) ? serverGold : firestoreGold;
  const totalUsersCount = Math.max(profiles.length, econData?.liability?.totalUsers || 0);

  document.getElementById('totalUsers').textContent = totalUsersCount;
  document.getElementById('totalGold').textContent = fmtNum(totalGold, 2);
  document.getElementById('totalMatches').textContent = matches.length;
  document.getElementById('totalTeams').textContent = teams.length || profiles.length;

  renderUserTable(profiles, teams);
  renderSystemLogs(matches);
}

function switchAdminTab(tabName, triggerEl = null) {
  document.querySelectorAll('.tab-content').forEach(t => {
    t.style.display = 'none';
  });
  document.querySelectorAll('.sidebar-menu .menu-item').forEach(b => b.classList.remove('active'));
  const target = document.getElementById(`tab-${tabName}`);
  if (target) target.style.display = 'block';

  const activeEl = triggerEl || document.querySelector(`.sidebar-menu .menu-item[href="#${tabName}"]`);
  if (activeEl) activeEl.classList.add('active');

  if (tabName === 'ekonomi') {
    loadEconomyDashboard();
  }
}

async function addPlayerToMarket() {
  const name = document.getElementById('newPlayerName').value.trim();
  const pos = document.getElementById('newPlayerPos').value;
  const price = parseInt(document.getElementById('newPlayerPrice').value, 10);

  if (!name || !price || price <= 0) {
    alert('❌ Mohon isi semua data dengan valid!');
    return;
  }

  try {
    await addDoc(collection(db, 'players'), {
      name: name.slice(0, 80),
      position: pos,
      overall_rating: 80,
      market_value: price,
      team_id: null,
      owner_id: currentUser.uid,
      nationality: 'ID'
    });
    alert(`✅ Pemain ${name} berhasil ditambahkan ke Market!`);
    document.getElementById('newPlayerName').value = '';
    document.getElementById('newPlayerPrice').value = '';
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'players');
  }
}

async function resetMarket() {
  if (!confirm('⚠️ Yakin ingin mereset semua isi market gratis milik Anda?')) return;
  try {
    const snap = await getDocs(query(collection(db, 'players'), where('team_id', '==', null)));
    for (const d of snap.docs) {
      const data = d.data();
      if (data.owner_id === currentUser.uid) {
        await deleteDoc(doc(db, 'players', d.id));
      }
    }
    alert('✅ Market berhasil direset!');
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, 'players');
  }
}

async function clearData() {
  if (!confirm('⚠️ Yakin ingin menghapus data pertandingan Anda?')) return;
  try {
    const snap = await getDocs(query(collection(db, 'matches'), where('user_id', '==', currentUser.uid)));
    for (const d of snap.docs) {
      await deleteDoc(doc(db, 'matches', d.id));
    }
    alert('✅ Data pertandingan berhasil dihapus!');
    await loadAdminData();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, 'matches');
  }
}

async function resetEconomy() {
  const cfg = await loadEconomyConfig();
  const starter = cfg.starterBalance;
  if (!confirm(`⚠️ Yakin ingin mereset saldo keuangan ke saldo awal (${starter.diamonds} Diamond, ${starter.gold} Gold, ${starter.currency} Currency)?`)) return;
  try {
    await adminResetServerWallet();
    alert(`✅ Saldo server berhasil direset ke ${starter.diamonds} Diamond, ${starter.gold} Gold, ${starter.currency} Currency!`);
    await loadAdminData();
  } catch (err) {
    alert(`⚠️ ${err.message || 'Gagal reset saldo server.'}`);
  }
}

async function nukeServer() {
  const confirmText = prompt('⚠️ PERINGATAN KERAS! Ketik "HAPUS SEMUA" untuk melanjutkan reset data.');
  if (confirmText === 'HAPUS SEMUA') {
    await clearData();
    await resetMarket();
    alert('💣 Data berhasil dibersihkan. Anda akan di-logout.');
    await handleLogout();
  } else {
    alert('❌ Tindakan dibatalkan.');
  }
}

document.addEventListener('DOMContentLoaded', async function() {
  try {
    const user = await getCurrentUserOnce();
    if (!user) {
      window.location.href = 'index.html';
      return;
    }
    const email = (user.email || '').toLowerCase();
    if (!ADMIN_EMAILS.includes(email)) {
      alert('🚫 AKSES DITOLAK! Halaman ini khusus untuk Owner.');
      window.location.href = 'dashboard.html';
      return;
    }
    currentUser = user;
    document.getElementById('userName').textContent = `👑 ${user.displayName || email.split('@')[0]}`;
    await loadAdminData();

    if (window.location.hash === '#ekonomi') {
      switchAdminTab('ekonomi');
    }
  } catch (err) {
    console.error('Admin error:', err);
  }
});

window.EsportBosAuth = { logout: handleLogout };
window.switchAdminTab = switchAdminTab;
window.setEconomyPeriod = setEconomyPeriod;
window.refreshEconomyDashboard = loadEconomyDashboard;
window.openWithdrawConfirm = openWithdrawConfirm;
window.cancelWithdrawConfirm = cancelWithdrawConfirm;
window.confirmApproveWithdraw = confirmApproveWithdraw;
window.confirmRejectWithdraw = confirmRejectWithdraw;
window.addPlayerToMarket = addPlayerToMarket;
window.resetMarket = resetMarket;
window.clearData = clearData;
window.resetEconomy = resetEconomy;
window.nukeServer = nukeServer;
