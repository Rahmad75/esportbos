import { signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  doc,
  updateDoc
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {
  auth,
  db,
  getCurrentUserOnce,
  getOrCreateProfile,
  getOrCreateTeam
} from './firebase-config.js';

let currentUserId = null;
let currentTeamId = null;
let userGold = 0;
let hiredStaff = [];

const availableStaff = [
  { id: 'coach', name: 'Head Coach', icon: '📋', desc: 'Meningkatkan Moral Tim', baseCost: 5000, bonus: '+2 Moral Tim' },
  { id: 'analyst', name: 'Data Analyst', icon: '📊', desc: 'Meningkatkan XP Pertandingan', baseCost: 7500, bonus: '+5% Match XP' },
  { id: 'physio', name: 'Physiotherapist', icon: '🩺', desc: 'Mempercepat Pemulihan Stamina', baseCost: 6000, bonus: '+10% Stamina Recovery' },
  { id: 'manager', name: 'Team Manager', icon: '💼', desc: 'Meningkatkan Pendapatan Sponsor', baseCost: 10000, bonus: '+5% Sponsor Income' }
];

async function handleLogout() {
  await signOut(auth);
  window.location.href = 'index.html';
}

document.addEventListener('DOMContentLoaded', async function() {
  const user = await getCurrentUserOnce();
  if (!user) { window.location.href = 'index.html'; return; }
  currentUserId = user.uid;

  const profile = await getOrCreateProfile(user);
  const team = await getOrCreateTeam(user, profile?.club_name);

  if (profile) {
    userGold = profile.gold || 0;
    const username = profile.username || user.email.split('@')[0];
    document.getElementById('userName').textContent = username;
    document.getElementById('navAvatar').src = profile.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;
    document.getElementById('diamondBalance').textContent = (profile.diamonds || 0).toLocaleString('id-ID');
    document.getElementById('goldBalance').textContent = userGold.toLocaleString('id-ID');
    document.getElementById('currencyBalance').textContent = (profile.currency || 0).toLocaleString('id-ID');
  }

  if (team) {
    currentTeamId = team.id;
    hiredStaff = team.hired_staff || [];

    document.getElementById('clubName').textContent = team.team_name;
    document.getElementById('clubRank').textContent = `${team.wins}W - ${team.draws}D - ${team.losses}L`;
    document.getElementById('popularityText').textContent = `Popularitas: ${team.popularity}%`;
    document.getElementById('popularityBar').style.width = `${team.popularity}%`;
    document.getElementById('moralText').textContent = `Moral: ${team.moral}%`;
    document.getElementById('moralBar').style.width = `${team.moral}%`;
  }

  renderStaffGrid();
  renderBonusSummary();
});

function renderStaffGrid() {
  const grid = document.getElementById('staffGrid');
  grid.innerHTML = availableStaff.map(staff => {
    const hired = hiredStaff.find(h => h.id === staff.id);
    const level = hired ? hired.level : 0;
    const cost = staff.baseCost * (level + 1);
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
}

function renderBonusSummary() {
  const summaryDiv = document.getElementById('bonusSummary');
  if (hiredStaff.length === 0) {
    summaryDiv.innerHTML = '<p style="color: #999; text-align: center;">Belum ada staff yang direkrut. Rekrut staff untuk mendapatkan bonus!</p>';
    return;
  }

  summaryDiv.innerHTML = hiredStaff.map(h => {
    const staff = availableStaff.find(s => s.id === h.id);
    return `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 15px; background: #16213e; border-radius: 8px; margin-bottom: 10px; color: white; border-left: 4px solid #00d4ff;">
        <div>
          <strong style="color: #00d4ff;">${staff.name}</strong> (Level ${h.level})
          <p style="font-size: 12px; color: #aaa; margin: 5px 0 0 0;">${staff.bonus}</p>
        </div>
        <div style="font-size: 24px;">${staff.icon}</div>
      </div>
    `;
  }).join('');
}

async function handleStaffAction(staffId) {
  const staff = availableStaff.find(s => s.id === staffId);
  const hired = hiredStaff.find(h => h.id === staffId);
  const level = hired ? hired.level : 0;
  const cost = staff.baseCost * (level + 1);

  if (userGold < cost) {
    alert(`❌ Gold tidak cukup! Dibutuhkan ${cost.toLocaleString('id-ID')} Gold.`);
    return;
  }

  if (!confirm(`${hired ? 'Upgrade' : 'Rekrut'} ${staff.name} ke Level ${level + 1} seharga ${cost.toLocaleString('id-ID')} Gold?`)) return;

  const newGold = userGold - cost;
  await updateDoc(doc(db, 'profiles', currentUserId), {
    gold: newGold,
    updated_at: new Date().toISOString()
  });
  userGold = newGold;
  document.getElementById('goldBalance').textContent = userGold.toLocaleString('id-ID');

  if (hired) {
    hired.level += 1;
  } else {
    hiredStaff.push({ id: staffId, level: 1 });
  }

  await updateDoc(doc(db, 'teams', currentTeamId), {
    hired_staff: hiredStaff,
    updated_at: new Date().toISOString()
  });

  alert(`✅ ${staff.name} berhasil ${hired ? 'di-upgrade' : 'direkrut'} ke Level ${hired ? hired.level : 1}!`);
  renderStaffGrid();
  renderBonusSummary();
}

function closeStaffModal() {
  document.getElementById('staffModal').style.display = 'none';
}

window.handleLogout = handleLogout;
window.handleStaffAction = handleStaffAction;
window.closeStaffModal = closeStaffModal;
