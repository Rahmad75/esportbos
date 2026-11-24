import { signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  doc,
  updateDoc
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {
  auth,
  db,
  FALLBACK_AVATAR_URL,
  getCurrentUserOnce,
  getOrCreateProfile,
  getOrCreateTeam,
  getSafeUserAvatarUrl
} from './firebase-config.js';
import { loadEconomyConfig } from './economy-config.js';
import { applyServerWalletToDOM, executeServerSpend } from './economy-client.js';

let currentUserId = null;
let currentTeamId = null;
let userGold = 0;
let stadiumData = {};
let economyConfig = null;
let stadiumLevels = {};

function buildStadiumLevelsFromConfig(cfg) {
  const range = cfg.defaultPrices.upgrades.stadiumGold;
  const min = Number(range.min);
  const max = Number(range.max);
  const mid = Math.round((min + max) / 2);
  const sinkTicketHint = Number(cfg.weeklySink.stadiumMaintenanceCurrency);
  return {
    1: { name: 'Gaming House Sederhana', capacity: 100, ticketPrice: 1, income: min, upgradeCost: min, icon: '🏠' },
    2: { name: 'Arena Esport', capacity: 500, ticketPrice: 1, income: mid, upgradeCost: mid, icon: '🏟️' },
    3: { name: 'Stadion Nasional', capacity: 2000, ticketPrice: 1, income: max, upgradeCost: max, icon: '🏛️' },
    4: { name: 'Super Arena', capacity: 10000, ticketPrice: 1, income: max, upgradeCost: null, icon: '🌌', maintenanceRef: sinkTicketHint }
  };
}

async function handleLogout() {
  await signOut(auth);
  window.location.href = 'index.html';
}

document.addEventListener('DOMContentLoaded', async function() {
  economyConfig = await loadEconomyConfig();
  stadiumLevels = buildStadiumLevelsFromConfig(economyConfig);
  const user = await getCurrentUserOnce();
  if (!user) { window.location.href = 'index.html'; return; }
  currentUserId = user.uid;

  const profile = await getOrCreateProfile(user);
  const team = await getOrCreateTeam(user, profile?.club_name);

  if (profile) {
    userGold = profile.gold || 0;
    const username = profile.username || user.email.split('@')[0];
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
    stadiumData = {
      level: team.stadium_level || 1,
      pendingIncome: team.pending_stadium_income || 0,
      totalHomeMatches: team.total_home_matches || 0,
      totalIncome: team.total_stadium_income || 0
    };

    document.getElementById('clubName').textContent = team.team_name;
    document.getElementById('clubRank').textContent = `${team.wins}W - ${team.draws}D - ${team.losses}L`;
    document.getElementById('popularityText').textContent = `Popularitas: ${team.popularity}%`;
    document.getElementById('popularityBar').style.width = `${team.popularity}%`;
    document.getElementById('moralText').textContent = `Moral: ${team.moral}%`;
    document.getElementById('moralBar').style.width = `${team.moral}%`;
  }

  renderStadionOverview();
  renderUpgradeStages();
  renderIncomeTab();
});

function switchStadionTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(`tab-${tab}`).style.display = 'block';
  if (window.event && window.event.target) window.event.target.classList.add('active');
}

function renderStadionOverview() {
  const current = stadiumLevels[stadiumData.level];
  document.getElementById('stadionArt').textContent = current.icon;
  document.getElementById('stadionName').textContent = current.name;
  document.getElementById('stadionLevel').textContent = stadiumData.level;
  document.getElementById('capacity').textContent = current.capacity.toLocaleString('id-ID');
  document.getElementById('ticketPrice').textContent = current.ticketPrice.toLocaleString('id-ID');
  document.getElementById('matchIncome').textContent = current.income.toLocaleString('id-ID');
}

function renderUpgradeStages() {
  const container = document.getElementById('upgradeStages');
  let html = '';

  for (let i = 1; i <= 4; i++) {
    const levelData = stadiumLevels[i];
    let statusClass = '';
    let statusText = '';
    let btnDisabled = '';
    let btnText = '';

    if (i < stadiumData.level) {
      statusClass = 'completed';
      statusText = '✅ Selesai';
      btnText = 'Sudah Dimiliki';
      btnDisabled = 'disabled style="opacity: 0.5; cursor: not-allowed;"';
    } else if (i === stadiumData.level) {
      statusClass = 'current';
      statusText = '📍 Saat Ini';
      if (levelData.upgradeCost === null) {
        btnText = 'Level Maksimum';
        btnDisabled = 'disabled style="opacity: 0.5; cursor: not-allowed;"';
      } else {
        btnText = `Upgrade (${levelData.upgradeCost.toLocaleString('id-ID')} G)`;
      }
    } else {
      statusClass = 'locked';
      statusText = '🔒 Terkunci';
      btnText = levelData.upgradeCost ? `Upgrade (${levelData.upgradeCost.toLocaleString('id-ID')} G)` : 'Maksimum';
      btnDisabled = 'disabled style="opacity: 0.5; cursor: not-allowed;"';
    }

    html += `
      <div class="stage-card ${statusClass}" style="background: #16213e; padding: 20px; border-radius: 10px; text-align: center; color: white; border: 1px solid ${i === stadiumData.level ? '#00d4ff' : '#333'};">
        <div class="stage-number" style="font-size: 24px; font-weight: bold; color: #ffd700; margin-bottom: 10px;">${i}</div>
        <h4 style="margin: 5px 0; color: #00d4ff;">${levelData.name}</h4>
        <p style="font-size: 12px; color: #aaa; margin: 5px 0;">Kapasitas: ${levelData.capacity.toLocaleString('id-ID')}</p>
        <p style="font-size: 12px; color: #aaa; margin: 5px 0;">Income: ${levelData.income.toLocaleString('id-ID')}/match</p>
        <div class="stage-status" style="margin: 10px 0; font-weight: bold; color: ${i < stadiumData.level ? '#28a745' : (i === stadiumData.level ? '#00d4ff' : '#ff6b6b')}">${statusText}</div>
        <button class="btn-upgrade" onclick="upgradeStadion(${i + 1})" ${btnDisabled} style="width: 100%; padding: 10px; background: ${i === stadiumData.level && levelData.upgradeCost ? '#28a745' : '#666'}; color: white; border: none; border-radius: 5px; cursor: ${i === stadiumData.level && levelData.upgradeCost ? 'pointer' : 'not-allowed'}; font-weight: bold; margin-top: 10px;">
          ${btnText}
        </button>
      </div>
    `;
  }
  container.innerHTML = html;
}

function renderIncomeTab() {
  document.getElementById('pendingIncome').textContent = stadiumData.pendingIncome.toLocaleString('id-ID');
  document.getElementById('totalHomeMatches').textContent = stadiumData.totalHomeMatches.toLocaleString('id-ID');
  document.getElementById('totalIncome').textContent = stadiumData.totalIncome.toLocaleString('id-ID');
}

async function upgradeStadion(targetLevel) {
  const currentLevel = stadiumData.level;
  if (targetLevel !== currentLevel + 1) return;

  const currentLevelData = stadiumLevels[currentLevel];
  const nextLevelData = stadiumLevels[targetLevel];
  if (!nextLevelData || !currentLevelData?.upgradeCost) return;

  const cost = currentLevelData.upgradeCost;
  if (userGold < cost) {
    alert(`❌ Gold tidak cukup! Dibutuhkan ${cost.toLocaleString('id-ID')} Gold.`);
    return;
  }

  if (!confirm(`Yakin ingin upgrade ke ${nextLevelData.name} seharga ${cost.toLocaleString('id-ID')} Gold?`)) return;

  try {
    const serverRes = await executeServerSpend({ action: 'stadion_upgrade', currentLevel });
    applyServerWalletToDOM(serverRes.wallet);
    userGold = Number(serverRes.wallet.gold || 0);

    stadiumData.level = targetLevel;
    await updateDoc(doc(db, 'teams', currentTeamId), {
      stadium_level: targetLevel,
      updated_at: new Date().toISOString()
    });

    alert(`✅ Stadion berhasil di-upgrade ke ${nextLevelData.name}!`);
    renderStadionOverview();
    renderUpgradeStages();
  } catch (err) {
    alert(`⚠️ ${err.message || 'Gagal upgrade stadion.'}`);
  }
}

async function claimTicketIncome() {
  if (stadiumData.pendingIncome <= 0) {
    alert('Tidak ada pendapatan tiket yang tertunda untuk diklaim.');
    return;
  }

  alert('⚠️ Pendapatan tiket stadion sedang dalam proses migrasi ke validasi server (Economy v2).');
}

function showStadionModal(title, message) {
  const modal = document.getElementById('stadionModal');
  const body = document.getElementById('stadionModalBody');
  body.innerHTML = `
    <div style="font-size: 48px; margin-bottom: 15px;">🎉</div>
    <h3 style="color: #00d4ff; margin-bottom: 10px;">${title}</h3>
    <p style="color: #aaa; margin-bottom: 20px;">${message}</p>
    <button onclick="closeStadionModal()" style="padding: 10px 30px; background: #00d4ff; color: #000; border: none; border-radius: 5px; font-weight: bold; cursor: pointer;">Tutup</button>
  `;
  modal.style.display = 'flex';
}

function closeStadionModal() {
  document.getElementById('stadionModal').style.display = 'none';
}

window.handleLogout = handleLogout;
window.switchStadionTab = switchStadionTab;
window.upgradeStadion = upgradeStadion;
window.claimTicketIncome = claimTicketIncome;
window.closeStadionModal = closeStadionModal;
