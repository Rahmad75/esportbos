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
  FALLBACK_AVATAR_URL,
  getCurrentUserOnce,
  getOrCreateProfile,
  getOrCreateTeam,
  getPlayerAvatarUrl,
  getSafeUserAvatarUrl,
  handleFirestoreError,
  OperationType
} from './firebase-config.js';

let currentTeamId = null;
let currentUserId = null;
let userGold = 0;
let academyLevel = 1;

const academyData = {
  1: { cost: 500, quality: 'Basic', maxPotential: 75, upgradeCost: 5000 },
  2: { cost: 800, quality: 'Advanced', maxPotential: 85, upgradeCost: 10000 },
  3: { cost: 1200, quality: 'Elite', maxPotential: 92, upgradeCost: 20000 },
  4: { cost: 1800, quality: 'Master', maxPotential: 97, upgradeCost: 40000 },
  5: { cost: 2500, quality: 'Legendary', maxPotential: 99, upgradeCost: null }
};

const playerNames = ['Rizky','Bagus','Dimas','Fajar','Galih','Hendra','Irfan','Joko','Kevin','Lukman','Maulana','Naufal','Omar','Putra','Raka','Sandi','Taufik','Umar','Vino','Wahyu','Yoga','Zidan','Aldi','Bayu','Candra','Dwiki','Eka','Firman','Gilang','Hafiz'];
const positions = ['Top','Jungle','Mid','ADC','Support'];

function handleLogout() {
  signOut(auth).then(() => { window.location.href = 'index.html'; });
}

function switchAkademiTab(tabName, btnElement) {
  document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  const target = document.getElementById('tab-' + tabName);
  if (target) target.style.display = 'block';
  if (btnElement) btnElement.classList.add('active');
}

async function scoutPlayer() {
  if (userGold < academyData[academyLevel].cost) {
    alert('Gold tidak cukup! Butuh ' + academyData[academyLevel].cost + ' Gold.');
    return;
  }

  if (!confirm('Scout pemain muda seharga ' + academyData[academyLevel].cost + ' Gold?')) {
    return;
  }

  try {
    userGold -= academyData[academyLevel].cost;
    try {
      await updateDoc(doc(db, 'profiles', currentUserId), {
        gold: userGold,
        updated_at: new Date().toISOString()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `profiles/${currentUserId}`);
    }
    document.getElementById('goldBalance').textContent = userGold.toLocaleString('id-ID');

    const name = playerNames[Math.floor(Math.random() * playerNames.length)];
    const position = positions[Math.floor(Math.random() * positions.length)];
    const potential = Math.floor(Math.random() * (academyData[academyLevel].maxPotential - 60)) + 60;
    const overall = Math.floor(Math.random() * 20) + 50;

    try {
      await addDoc(collection(db, 'players'), {
        team_id: currentTeamId,
        owner_id: currentUserId,
        name: name,
        position: position,
        overall_rating: overall,
        potential: potential,
        age: Math.floor(Math.random() * 5) + 16,
        market_value: overall * 100,
        is_academy: true,
        recruited_at: new Date().toISOString()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'players');
    }

    alert('Berhasil scout pemain!\n\nNama: ' + name + '\nPosisi: ' + position + '\nOverall: ' + overall + '\nPotensi: ' + potential);
    await loadScoutedPlayers();
  } catch (err) {
    console.error('Error scouting:', err);
    alert('Gagal scout pemain. Coba lagi.');
  }
}

async function upgradeAcademy() {
  const nextLevel = academyLevel + 1;
  if (!academyData[nextLevel]) {
    alert('Akademi sudah level maksimal!');
    return;
  }

  const cost = academyData[academyLevel].upgradeCost;
  if (userGold < cost) {
    alert('Gold tidak cukup! Butuh ' + cost + ' Gold.');
    return;
  }

  if (!confirm('Upgrade akademi ke level ' + nextLevel + ' seharga ' + cost + ' Gold?')) {
    return;
  }

  try {
    userGold -= cost;
    academyLevel = nextLevel;

    await updateDoc(doc(db, 'profiles', currentUserId), {
      gold: userGold,
      updated_at: new Date().toISOString()
    });
    await updateDoc(doc(db, 'teams', currentTeamId), {
      academy_level: academyLevel,
      updated_at: new Date().toISOString()
    });

    document.getElementById('goldBalance').textContent = userGold.toLocaleString('id-ID');
    alert('Akademi berhasil di-upgrade ke level ' + academyLevel + '!');
    renderAcademyLevels();
    updateAcademyDisplay();
  } catch (err) {
    console.error('Error upgrading:', err);
    alert('Gagal upgrade akademi.');
  }
}

function renderAcademyLevels() {
  const container = document.getElementById('academyLevels');
  let html = '';

  for (let i = 1; i <= 5; i++) {
    const data = academyData[i];
    const isCurrent = i === academyLevel;
    const status = isCurrent
      ? '<span style="background:#00d4ff;color:#1a1a2e;padding:3px 10px;border-radius:4px;font-size:12px;font-weight:bold;">LEVEL SEKARANG</span>'
      : (i < academyLevel ? '<span style="color:#28a745;">✓ Selesai</span>' : '<span style="color:#999;">Terkunci</span>');

    html += '<div style="background:#16213e;padding:15px;border-radius:8px;border:' + (isCurrent ? '2px solid #00d4ff' : '1px solid #333') + ';">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
    html += '<div><strong style="color:#00d4ff;">Level ' + i + ': ' + data.quality + '</strong><br><small style="color:#999;">Max Potential: ' + data.maxPotential + '</small></div>';
    html += '<div>' + status + '</div>';
    html += '</div></div>';
  }

  container.innerHTML = html;
}

function updateAcademyDisplay() {
  document.getElementById('academyLevelDisplay').textContent = academyLevel;
  document.getElementById('scoutCostDisplay').textContent = academyData[academyLevel].cost + ' Gold';
  document.getElementById('currentAcademyLevel').textContent = academyLevel;
  document.getElementById('currentAcademyQuality').textContent = academyData[academyLevel].quality;
  document.getElementById('currentMaxPotential').textContent = academyData[academyLevel].maxPotential;

  const upgradeCostEl = document.getElementById('upgradeCost');
  const upgradeBtn = document.getElementById('upgradeButton');
  if (academyData[academyLevel].upgradeCost) {
    upgradeCostEl.textContent = academyData[academyLevel].upgradeCost;
    upgradeBtn.style.display = 'inline-block';
  } else {
    upgradeCostEl.textContent = 'MAX';
    upgradeBtn.style.display = 'none';
  }
}

async function loadScoutedPlayers() {
  try {
    const q = query(collection(db, 'players'), where('owner_id', '==', currentUserId));
    const snap = await getDocs(q);
    const players = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(p => p.team_id === currentTeamId && p.is_academy === true)
      .sort((a, b) => new Date(b.recruited_at || 0) - new Date(a.recruited_at || 0));

    const grid = document.getElementById('scoutedPlayersGrid');

    if (!players || players.length === 0) {
      grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:#999;">Belum ada pemain yang di-scout. Klik tombol di atas untuk mulai!</p>';
      return;
    }

    grid.innerHTML = players.map(p => {
      const date = new Date(p.recruited_at).toLocaleDateString('id-ID');
      const avatarUrl = getPlayerAvatarUrl(p);
      return '<div style="background:#16213e;padding:15px;border-radius:8px;border:1px solid #333;color:white;text-align:center;">' +
        '<img src="' + avatarUrl + '" alt="' + p.name + '" onerror="this.onerror=null;this.src=\'' + FALLBACK_AVATAR_URL + '\';" style="width:96px;height:96px;border-radius:50%;object-fit:cover;border:3px solid #FFD700;box-shadow:0 4px 14px rgba(0,0,0,0.55);margin-bottom:10px;">' +
        '<h4 style="margin:10px 0 5px;color:#00d4ff;">' + p.name + '</h4>' +
        '<p style="font-size:12px;color:#aaa;margin:2px 0;">' + p.position + ' • Usia: ' + p.age + '</p>' +
        '<p style="font-size:12px;color:#aaa;margin:2px 0;">Overall: <strong style="color:#ffd700;">' + p.overall_rating + '</strong></p>' +
        '<p style="font-size:12px;color:#aaa;margin:2px 0;">Potensi: <strong style="color:#28a745;">' + p.potential + '</strong></p>' +
        '<p style="font-size:10px;color:#666;margin-top:8px;">Di-scout: ' + date + '</p>' +
        '</div>';
    }).join('');
  } catch (err) {
    console.error('Error loading players:', err);
  }
}

document.addEventListener('DOMContentLoaded', async function() {
  try {
    const user = await getCurrentUserOnce();
    if (!user) { window.location.href = 'index.html'; return; }
    currentUserId = user.uid;

    const profile = await getOrCreateProfile(user);
    if (profile) {
      const username = profile.username || user.email.split('@')[0];
      document.getElementById('userName').textContent = username;
      const navAvatar = document.getElementById('navAvatar');
      if (navAvatar) {
        navAvatar.onerror = () => { navAvatar.onerror = null; navAvatar.src = FALLBACK_AVATAR_URL; };
        navAvatar.src = getSafeUserAvatarUrl(profile, username);
      }
      document.getElementById('diamondBalance').textContent = (profile.diamonds || 0).toLocaleString('id-ID');
      userGold = profile.gold || 0;
      document.getElementById('goldBalance').textContent = userGold.toLocaleString('id-ID');
      document.getElementById('currencyBalance').textContent = (profile.currency || 0).toLocaleString('id-ID');
    }

    const team = await getOrCreateTeam(user, profile?.club_name);
    if (team) {
      currentTeamId = team.id;
      document.getElementById('clubName').textContent = team.team_name || 'My Club';
      document.getElementById('clubRank').textContent = (team.wins || 0) + 'W-' + (team.draws || 0) + 'D-' + (team.losses || 0) + 'L';
      document.getElementById('popularityText').textContent = 'Popularitas Klub: ' + (team.popularity || 0) + '%';
      document.getElementById('popularityBar').style.width = (team.popularity || 0) + '%';
      document.getElementById('moralText').textContent = 'Moral Tim: ' + (team.moral || 0) + '%';
      document.getElementById('moralBar').style.width = (team.moral || 0) + '%';
      academyLevel = team.academy_level || 1;
    }

    updateAcademyDisplay();
    renderAcademyLevels();
    await loadScoutedPlayers();
  } catch (error) {
    console.error('Akademi error:', error);
  }
});

window.handleLogout = handleLogout;
window.switchAkademiTab = switchAkademiTab;
window.scoutPlayer = scoutPlayer;
window.upgradeAcademy = upgradeAcademy;
