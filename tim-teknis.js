import { signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  doc,
  updateDoc
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
  isFirestoreOfflineError,
  OperationType,
  withFirestoreRetry
} from './firebase-config.js';
import { loadEconomyConfig } from './economy-config.js';
import { applyServerWalletToDOM, executeServerSpend } from './economy-client.js';

let currentUser = null;
let currentUserId = null;
let currentTeamId = null;
let userGold = 0;
let hiredStaff = [];
let isOfflineFallback = false;
let bgRetryTimer = null;
let bgRetryCount = 0;
const MAX_BG_RETRIES = 3;

let economyConfig = null;
const availableStaff = [
  { id: 'coach', name: 'Head Coach (Pelatih)', icon: '📋', desc: 'Meningkatkan Moral Tim', tierIndex: 0, bonus: '+2 Moral Tim' },
  { id: 'physio', name: 'Physiotherapist (Dokter Tim)', icon: '🩺', desc: 'Mempercepat Pemulihan Stamina', tierIndex: 1, bonus: '+10% Stamina Recovery' },
  { id: 'analyst', name: 'Data Analyst (Analis)', icon: '📊', desc: 'Meningkatkan XP Pertandingan', tierIndex: 2, bonus: '+5% Match XP' },
  { id: 'manager', name: 'Team Manager', icon: '💼', desc: 'Meningkatkan Pendapatan Sponsor', tierIndex: 3, bonus: '+5% Sponsor Income' }
];

function getStaffBaseCost(staff) {
  const range = economyConfig?.defaultPrices?.staff?.regularGold;
  if (!range) return 0;
  const min = Number(range.min);
  const max = Number(range.max);
  const steps = Math.max(1, availableStaff.length - 1);
  return Math.round(min + ((max - min) * staff.tierIndex) / steps);
}

const defaultOfflineBonusPreview = [
  { id: 'coach', level: 1 }
];

async function handleLogout() {
  if (bgRetryTimer) clearTimeout(bgRetryTimer);
  await signOut(auth);
  window.location.href = 'index.html';
}

function setLoadingState() {
  const grid = document.getElementById('staffGrid');
  const summary = document.getElementById('bonusSummary');
  if (grid) {
    grid.innerHTML = '<p style="grid-column: 1 / -1; color: #aaa; text-align: center; padding: 20px 0;">Memuat staff...</p>';
  }
  if (summary) {
    summary.innerHTML = '<p style="color: #aaa; text-align: center;">Memuat staff...</p>';
  }
}

function applyProfileAndTeamUI(profile, team) {
  if (profile) {
    userGold = profile.gold || 0;
    const username = profile.username || currentUser?.email?.split('@')[0] || 'Manager';
    document.getElementById('userName').textContent = username;
    const navAvatar = document.getElementById('navAvatar');
    if (navAvatar) {
      navAvatar.onerror = () => { navAvatar.onerror = null; navAvatar.src = FALLBACK_AVATAR_URL; };
      navAvatar.src = getSafeUserAvatarUrl(profile, username);
    }
    document.getElementById('diamondBalance').textContent = (profile.diamonds || 0).toLocaleString('id-ID');
    document.getElementById('goldBalance').textContent = userGold.toLocaleString('id-ID');
    document.getElementById('currencyBalance').textContent = (profile.currency || 0).toLocaleString('id-ID');
  }

  if (team) {
    currentTeamId = team.id;
    hiredStaff = Array.isArray(team.hired_staff) ? team.hired_staff : [];

    document.getElementById('clubName').textContent = team.team_name;
    document.getElementById('clubRank').textContent = `${team.wins}W - ${team.draws}D - ${team.losses}L`;
    document.getElementById('popularityText').textContent = `Popularitas: ${team.popularity}%`;
    document.getElementById('popularityBar').style.width = `${team.popularity}%`;
    document.getElementById('moralText').textContent = `Moral: ${team.moral}%`;
    document.getElementById('moralBar').style.width = `${team.moral}%`;
  }
}

async function fetchLiveStaffData() {
  try {
    await ensureFirestoreReady(2, 800);
  } catch (connErr) {
    console.warn('Firestore readiness warning:', connErr?.message || connErr);
  }
  const profile = await withFirestoreRetry(() => getOrCreateProfile(currentUser), 3, 800);
  const team = await withFirestoreRetry(() => getOrCreateTeam(currentUser, profile?.club_name), 3, 800);
  applyProfileAndTeamUI(profile, team);
}

function scheduleBackgroundRetry() {
  if (bgRetryTimer || bgRetryCount >= MAX_BG_RETRIES) return;
  bgRetryTimer = setTimeout(async () => {
    bgRetryTimer = null;
    bgRetryCount += 1;
    try {
      await fetchLiveStaffData();
      isOfflineFallback = false;
      bgRetryCount = 0;
      renderStaffGrid();
      renderBonusSummary();
    } catch (_) {
      scheduleBackgroundRetry();
    }
  }, 5000);
}

async function loadStaffPage(showLoading = true) {
  if (bgRetryTimer) {
    clearTimeout(bgRetryTimer);
    bgRetryTimer = null;
  }
  if (showLoading) {
    setLoadingState();
  }

  try {
    await fetchLiveStaffData();
    isOfflineFallback = false;
    bgRetryCount = 0;
    renderStaffGrid();
    renderBonusSummary();
  } catch (err) {
    console.error('Gagal memuat data staff dari Firestore:', err);
    isOfflineFallback = true;
    const username = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Manager';
    const userNameEl = document.getElementById('userName');
    const clubNameEl = document.getElementById('clubName');
    if (userNameEl && userNameEl.textContent === 'Loading...') userNameEl.textContent = username;
    if (clubNameEl && clubNameEl.textContent === 'Loading...') clubNameEl.textContent = `${username} FC`;
    renderStaffGrid();
    renderBonusSummary();
    scheduleBackgroundRetry();
  }
}

function retryLoadStaff() {
  bgRetryCount = 0;
  loadStaffPage(true);
}

document.addEventListener('DOMContentLoaded', async function() {
  setLoadingState();
  try {
    economyConfig = await loadEconomyConfig();
  } catch (err) {
    console.error('Gagal memuat economy.config.json:', err);
  }
  const user = await getCurrentUserOnce();
  if (!user) { window.location.href = 'index.html'; return; }
  currentUser = user;
  currentUserId = user.uid;
  await loadStaffPage(true);
});

function renderStaffGrid() {
  const grid = document.getElementById('staffGrid');
  if (!grid) return;

  const activeList = isOfflineFallback && hiredStaff.length === 0 ? defaultOfflineBonusPreview : hiredStaff;

  const offlineBanner = isOfflineFallback
    ? `
      <div style="grid-column: 1 / -1; background: rgba(255, 107, 107, 0.12); border: 1px solid #ff6b6b; border-radius: 8px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; gap: 12px; color: #fff;">
        <span style="font-size: 13px; color: #ffd6d6;">⚠️ Gagal terhubung ke server, buka di tab baru. Menampilkan daftar staff default sementara.</span>
        <button type="button" onclick="retryLoadStaff()" style="padding: 8px 14px; background: #00d4ff; color: #000; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; white-space: nowrap;">Coba Lagi</button>
      </div>
    `
    : '';

  const cardsHtml = availableStaff.map(staff => {
    const hired = activeList.find(h => h.id === staff.id);
    const level = hired ? hired.level : 0;
    const cost = getStaffBaseCost(staff) * (level + 1);
    const isHired = level > 0;

    return `
      <div style="background: #16213e; padding: 20px; border-radius: 10px; border: 1px solid ${isHired ? '#28a745' : '#333'}; text-align: center; color: white;">
        <div style="font-size: 40px; margin-bottom: 10px;">${staff.icon}</div>
        <h4 style="color: #00d4ff; margin: 5px 0;">${staff.name}</h4>
        <p style="font-size: 12px; color: #aaa; margin: 5px 0;">${staff.desc}</p>
        <p style="font-size: 14px; color: #ffd700; font-weight: bold; margin: 10px 0;">
          ${isHired ? `Level ${level}` : 'Belum Direkrut'}
        </p>
        <p style="font-size: 12px; color: #28a745; margin: 5px 0;">Bonus: ${staff.bonus}</p>
        <button onclick="handleStaffAction('${staff.id}')" style="width: 100%; margin-top: 15px; padding: 10px; background: ${isHired ? '#00d4ff' : '#28a745'}; color: #000; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">
          ${isHired ? `Upgrade (💰 ${cost.toLocaleString('id-ID')})` : `Rekrut (💰 ${cost.toLocaleString('id-ID')})`}
        </button>
      </div>
    `;
  }).join('');

  grid.innerHTML = offlineBanner + cardsHtml;
}

function renderBonusSummary() {
  const summaryDiv = document.getElementById('bonusSummary');
  if (!summaryDiv) return;

  const listToRender = isOfflineFallback && hiredStaff.length === 0 ? defaultOfflineBonusPreview : hiredStaff;

  if (listToRender.length === 0) {
    summaryDiv.innerHTML = '<p style="color: #999; text-align: center;">Belum ada staff yang direkrut. Rekrut staff untuk mendapatkan bonus!</p>';
    return;
  }

  const itemsHtml = listToRender.map(h => {
    const staff = availableStaff.find(s => s.id === h.id);
    if (!staff) return '';
    return `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 15px; background: #16213e; border-radius: 8px; margin-bottom: 10px; color: white; border-left: 4px solid #00d4ff;">
        <div>
          <strong style="color: #00d4ff;">${staff.name}</strong> (Level ${h.level})${isOfflineFallback ? ' <span style="font-size:11px;color:#ffd700;">(Default Offline)</span>' : ''}
          <p style="font-size: 12px; color: #aaa; margin: 5px 0 0 0;">${staff.bonus}</p>
        </div>
        <div style="font-size: 24px;">${staff.icon}</div>
      </div>
    `;
  }).join('');

  summaryDiv.innerHTML = itemsHtml || '<p style="color: #999; text-align: center;">Belum ada staff yang direkrut. Rekrut staff untuk mendapatkan bonus!</p>';
}

async function handleStaffAction(staffId) {
  if (isOfflineFallback || !currentTeamId || !currentUserId) {
    alert('❌ Gagal terhubung ke server, buka di tab baru atau klik Coba Lagi sebelum merekrut staff.');
    return;
  }

  const staff = availableStaff.find(s => s.id === staffId);
  if (!staff) return;
  const hired = hiredStaff.find(h => h.id === staffId);
  const level = hired ? hired.level : 0;
  const cost = getStaffBaseCost(staff) * (level + 1);

  if (userGold < cost) {
    alert(`❌ Gold tidak cukup! Dibutuhkan ${cost.toLocaleString('id-ID')} Gold.`);
    return;
  }

  if (!confirm(`${hired ? 'Upgrade' : 'Rekrut'} ${staff.name} ke Level ${level + 1} seharga ${cost.toLocaleString('id-ID')} Gold?`)) return;

  try {
    const serverRes = await executeServerSpend({
      action: 'staff_hire',
      staffId,
      currentLevel: level
    });
    applyServerWalletToDOM(serverRes.wallet);
    userGold = Number(serverRes.wallet.gold || 0);

    const updatedStaff = hiredStaff.map(item => ({ ...item }));
    const existingItem = updatedStaff.find(h => h.id === staffId);
    if (existingItem) {
      existingItem.level += 1;
    } else {
      updatedStaff.push({ id: staffId, level: 1 });
    }

    await withFirestoreRetry(() => updateDoc(doc(db, 'teams', currentTeamId), {
      hired_staff: updatedStaff,
      updated_at: new Date().toISOString()
    }), 3, 1000);
    hiredStaff = updatedStaff;

    const newLevel = existingItem ? existingItem.level : 1;
    alert(`✅ ${staff.name} berhasil ${hired ? 'di-upgrade' : 'direkrut'} ke Level ${newLevel}!`);
    renderStaffGrid();
    renderBonusSummary();
  } catch (err) {
    if (isFirestoreOfflineError(err)) {
      alert('❌ Gagal terhubung ke server, buka di tab baru');
    } else {
      alert(`⚠️ ${err.message || 'Gagal merekrut staff.'}`);
    }
  }
}

function closeStaffModal() {
  document.getElementById('staffModal').style.display = 'none';
}

window.handleLogout = handleLogout;
window.handleStaffAction = handleStaffAction;
window.closeStaffModal = closeStaffModal;
window.retryLoadStaff = retryLoadStaff;
