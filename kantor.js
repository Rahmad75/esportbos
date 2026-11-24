import { signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  doc,
  getDoc,
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
import { getWeeklySinkBreakdown, loadEconomyConfig } from './economy-config.js';
import { applyServerWalletToDOM, executeServerSpend, settleServerWeeklySink } from './economy-client.js';

let currentUserId = null;
let currentTeamId = null;
let userCurrency = 0;
let userGold = 0;
let teamData = null;
let economyConfig = null;
let facilityLevels = {};
let availableSponsorsList = [];

function buildKantorConfig(cfg) {
  const range = cfg.defaultPrices.upgrades.stadiumGold;
  const min = Number(range.min);
  const max = Number(range.max);
  const step = (idx) => Math.round(min + ((max - min) * idx) / 3);
  facilityLevels = {
    1: { name: 'Ruko Sederhana', maxSlots: 2, cost: step(0), bonusPop: 0 },
    2: { name: 'Gedung Bertingkat', maxSlots: 4, cost: step(1), bonusPop: 5 },
    3: { name: 'Kantor Mewah', maxSlots: 6, cost: step(2), bonusPop: 10 },
    4: { name: 'Markas Esports', maxSlots: 8, cost: step(3), bonusPop: 15 }
  };

  const eventSponsorBonus = Number(cfg.matchReward.eventBonusCurrency || 0);
  availableSponsorsList = [
    { id: 'sp1', name: 'Red Bull Esports', income: eventSponsorBonus, reqPop: 50, icon: '🐂' },
    { id: 'sp2', name: 'Logitech G', income: eventSponsorBonus, reqPop: 60, icon: '🖱️' },
    { id: 'sp3', name: 'Razer', income: eventSponsorBonus, reqPop: 70, icon: '🐍' },
    { id: 'sp4', name: 'Intel', income: eventSponsorBonus, reqPop: 80, icon: '💻' },
    { id: 'sp5', name: 'NVIDIA', income: eventSponsorBonus, reqPop: 90, icon: '💚' }
  ];
}

async function handleLogout() {
  await signOut(auth);
  window.location.href = 'index.html';
}

document.addEventListener('DOMContentLoaded', async function() {
  economyConfig = await loadEconomyConfig();
  buildKantorConfig(economyConfig);

  const user = await getCurrentUserOnce();
  if (!user) { window.location.href = 'index.html'; return; }
  currentUserId = user.uid;

  const profile = await getOrCreateProfile(user);
  const team = await getOrCreateTeam(user, profile?.club_name);

  if (profile) {
    userCurrency = profile.currency || 0;
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
    document.getElementById('currencyBalance').textContent = userCurrency.toLocaleString('id-ID');
  }

  if (team) {
    currentTeamId = team.id;
    teamData = team;
    document.getElementById('clubName').textContent = team.team_name;
    document.getElementById('clubRank').textContent = `${team.wins}W - ${team.draws}D - ${team.losses}L`;
    document.getElementById('popularityText').textContent = `Popularitas: ${team.popularity}%`;
    document.getElementById('popularityBar').style.width = `${team.popularity}%`;
    document.getElementById('moralText').textContent = `Moral: ${team.moral}%`;
    document.getElementById('moralBar').style.width = `${team.moral}%`;

    updateFinanceUI();
    renderSponsors();
    updateFacilityUI();
  }
});

function switchKantorTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(`tab-${tab}`).style.display = 'block';
  if (window.event && window.event.target) window.event.target.classList.add('active');
}

function updateFinanceUI() {
  const activeSponsors = teamData.active_sponsors || [];
  const weeklyIncome = activeSponsors.reduce((sum, spId) => {
    const sp = availableSponsorsList.find(s => s.id === spId);
    return sum + (sp ? sp.income : 0);
  }, 0);

  const sink = getWeeklySinkBreakdown(economyConfig);
  const weeklyExpense = sink.total;
  const netProfit = weeklyIncome - weeklyExpense;

  document.getElementById('currentBalance').textContent = userCurrency.toLocaleString('id-ID');
  document.getElementById('weeklyIncome').textContent = `+${weeklyIncome.toLocaleString('id-ID')}`;
  document.getElementById('weeklyExpense').textContent = `-${weeklyExpense.toLocaleString('id-ID')}`;

  const profitEl = document.getElementById('netProfit');
  profitEl.textContent = (netProfit >= 0 ? '+' : '') + netProfit.toLocaleString('id-ID');
  profitEl.style.color = netProfit >= 0 ? '#28a745' : '#ff6b6b';
}

async function claimWeeklyIncome() {
  try {
    const serverRes = await settleServerWeeklySink();
    applyServerWalletToDOM(serverRes.wallet);
    userCurrency = Number(serverRes.wallet.currency || 0);

    await updateDoc(doc(db, 'teams', currentTeamId), {
      last_claim_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    alert(`✅ Settlement Mingguan Selesai (Validasi Server & Tercatat di Ledger)!\nPemasukan Sponsor/Event: +${Number(serverRes.income).toLocaleString('id-ID')} Currency\nBiaya Wajib Mingguan (Sink): -${Number(serverRes.expense).toLocaleString('id-ID')} Currency\nNet: ${Number(serverRes.netChange).toLocaleString('id-ID')} Currency\nSaldo Sekarang: ${userCurrency.toLocaleString('id-ID')} Currency`);
    location.reload();
  } catch (err) {
    console.error('Error claiming:', err);
    alert(`⚠️ ${err.message || 'Gagal memproses settlement mingguan.'}`);
  }
}

function renderSponsors() {
  const activeSponsors = teamData.active_sponsors || [];
  const currentLevel = teamData.facility_level || 1;
  const maxSlots = facilityLevels[currentLevel].maxSlots;

  document.getElementById('activeSponsorCount').textContent = activeSponsors.length;
  document.getElementById('maxSponsorSlots').textContent = maxSlots;

  const availableDiv = document.getElementById('availableSponsors');
  const availableToRender = availableSponsorsList.filter(sp => !activeSponsors.includes(sp.id));

  availableDiv.innerHTML = availableToRender.length === 0
    ? '<p style="color: #aaa; grid-column: 1/-1; text-align: center;">Semua sponsor telah diambil!</p>'
    : availableToRender.map(sp => {
        const canAfford = teamData.popularity >= sp.reqPop;
        return `<div style="background: #16213e; padding: 15px; border-radius: 8px; border: 1px solid ${canAfford ? '#333' : '#ff6b6b'}; text-align: center; color: white; opacity: ${canAfford ? 1 : 0.6};">
          <div style="font-size: 32px; margin-bottom: 10px;">${sp.icon}</div>
          <h4 style="margin: 5px 0; color: #00d4ff;">${sp.name}</h4>
          <p style="font-size: 12px; color: #28a745; margin: 5px 0;">💰 +${sp.income.toLocaleString('id-ID')} / minggu</p>
          <p style="font-size: 12px; color: #aaa; margin: 5px 0;">Syarat: Popularitas ${sp.reqPop}%</p>
          <button onclick="signSponsor('${sp.id}')" ${!canAfford ? 'disabled' : ''} style="width: 100%; margin-top: 10px; padding: 8px; background: ${canAfford ? '#00d4ff' : '#666'}; color: #000; border: none; border-radius: 5px; cursor: ${canAfford ? 'pointer' : 'not-allowed'}; font-weight: bold;">
            ${canAfford ? 'Tanda Tangani' : 'Popularitas Kurang'}
          </button>
        </div>`;
      }).join('');

  const activeDiv = document.getElementById('activeSponsors');
  activeDiv.innerHTML = activeSponsors.length === 0
    ? '<p style="color: #aaa; grid-column: 1/-1; text-align: center;">Belum ada sponsor aktif.</p>'
    : activeSponsors.map(spId => {
        const sp = availableSponsorsList.find(s => s.id === spId);
        return `<div style="background: #16213e; padding: 15px; border-radius: 8px; border: 1px solid #28a745; text-align: center; color: white;">
          <div style="font-size: 32px; margin-bottom: 10px;">${sp.icon}</div>
          <h4 style="margin: 5px 0; color: #28a745;">${sp.name}</h4>
          <p style="font-size: 12px; color: #aaa; margin: 5px 0;">💰 +${sp.income.toLocaleString('id-ID')} / minggu</p>
          <button onclick="cancelSponsor('${sp.id}')" style="width: 100%; margin-top: 10px; padding: 8px; background: #ff6b6b; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">Batalkan</button>
        </div>`;
      }).join('');
}

async function signSponsor(spId) {
  const activeSponsors = [...(teamData.active_sponsors || [])];
  const currentLevel = teamData.facility_level || 1;
  const maxSlots = facilityLevels[currentLevel].maxSlots;

  if (activeSponsors.length >= maxSlots) {
    alert('❌ Slot sponsor penuh! Upgrade fasilitas kantor untuk menambah slot.');
    return;
  }

  activeSponsors.push(spId);
  await updateDoc(doc(db, 'teams', currentTeamId), {
    active_sponsors: activeSponsors,
    updated_at: new Date().toISOString()
  });
  teamData.active_sponsors = activeSponsors;

  renderSponsors();
  updateFinanceUI();
  showKantorModal('✅ Sponsor Didapat!', 'Sponsor baru telah ditandatangani dan akan menambah pendapatan mingguan Anda.');
}

async function cancelSponsor(spId) {
  if (!confirm('Yakin ingin membatalkan sponsor ini?')) return;
  let activeSponsors = teamData.active_sponsors || [];
  activeSponsors = activeSponsors.filter(id => id !== spId);
  await updateDoc(doc(db, 'teams', currentTeamId), {
    active_sponsors: activeSponsors,
    updated_at: new Date().toISOString()
  });
  teamData.active_sponsors = activeSponsors;
  renderSponsors();
  updateFinanceUI();
}

function updateFacilityUI() {
  const currentLevel = teamData.facility_level || 1;
  const currentData = facilityLevels[currentLevel];
  const nextData = facilityLevels[currentLevel + 1];

  document.getElementById('currentFacilityName').textContent = currentData.name;
  document.getElementById('currentFacilityLevel').textContent = currentLevel;
  document.getElementById('currentMaxSlots').textContent = currentData.maxSlots;
  document.getElementById('currentBonusPop').textContent = `+${currentData.bonusPop}%`;

  if (nextData) {
    document.getElementById('nextFacilityName').textContent = nextData.name;
    document.getElementById('nextMaxSlots').textContent = nextData.maxSlots;
    document.getElementById('upgradeCost').textContent = `${nextData.cost.toLocaleString('id-ID')} Gold`;
    document.getElementById('btnUpgradeFacility').disabled = false;
  } else {
    document.getElementById('nextFacilityName').textContent = 'MAKSIMUM';
    document.getElementById('nextMaxSlots').textContent = '-';
    document.getElementById('upgradeCost').textContent = '-';
    document.getElementById('btnUpgradeFacility').textContent = 'Level Maksimum';
    document.getElementById('btnUpgradeFacility').disabled = true;
    document.getElementById('btnUpgradeFacility').style.background = '#666';
  }
}

async function upgradeFacility() {
  const currentLevel = teamData.facility_level || 1;
  const nextData = facilityLevels[currentLevel + 1];
  if (!nextData) return;

  if (userGold < nextData.cost) {
    alert(`❌ Gold tidak cukup! Dibutuhkan ${nextData.cost.toLocaleString('id-ID')} Gold.`);
    return;
  }

  if (!confirm(`Yakin ingin upgrade fasilitas ke "${nextData.name}" seharga ${nextData.cost.toLocaleString('id-ID')} Gold?`)) return;

  try {
    const serverRes = await executeServerSpend({ action: 'kantor_upgrade', currentLevel });
    applyServerWalletToDOM(serverRes.wallet);
    userGold = Number(serverRes.wallet.gold || 0);

    await updateDoc(doc(db, 'teams', currentTeamId), {
      facility_level: currentLevel + 1,
      updated_at: new Date().toISOString()
    });
    teamData.facility_level = currentLevel + 1;

    alert(`✅ Fasilitas berhasil di-upgrade ke ${nextData.name}!`);
    updateFacilityUI();
    renderSponsors();
  } catch (err) {
    alert(`⚠️ ${err.message || 'Gagal upgrade fasilitas.'}`);
  }
}

function showKantorModal(title, message) {
  const modal = document.getElementById('kantorModal');
  const body = document.getElementById('kantorModalBody');
  body.innerHTML = `
    <div style="font-size: 48px; margin-bottom: 15px;">🎉</div>
    <h3 style="color: #00d4ff; margin-bottom: 10px;">${title}</h3>
    <p style="color: #aaa; margin-bottom: 20px;">${message}</p>
    <button onclick="closeKantorModal()" style="padding: 10px 30px; background: #00d4ff; color: #000; border: none; border-radius: 5px; font-weight: bold; cursor: pointer;">Tutup</button>
  `;
  modal.style.display = 'flex';
}

function closeKantorModal() {
  document.getElementById('kantorModal').style.display = 'none';
}

window.handleLogout = handleLogout;
window.switchKantorTab = switchKantorTab;
window.claimWeeklyIncome = claimWeeklyIncome;
window.signSponsor = signSponsor;
window.cancelSponsor = cancelSponsor;
window.upgradeFacility = upgradeFacility;
window.closeKantorModal = closeKantorModal;
