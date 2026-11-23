import { signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
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
  getSafeUserAvatarUrl
} from './firebase-config.js';

let currentUserId = null;
let currentTeamId = null;

function handleLogout() {
  signOut(auth).then(() => { window.location.href = 'index.html'; });
}

function switchTrainingTab(tabName, btnElement) {
  document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  const target = document.getElementById('tab-' + tabName);
  if (target) target.style.display = 'block';
  if (btnElement) btnElement.classList.add('active');
}

async function loadPlayers() {
  try {
    if (!currentUserId || !currentTeamId) {
      document.getElementById('individualTrainingGrid').innerHTML = '<p style="grid-column:1/-1;text-align:center;color:#999;">Belum ada tim. Buat tim dulu!</p>';
      return;
    }

    const q = query(collection(db, 'players'), where('owner_id', '==', currentUserId));
    const snap = await getDocs(q);
    const players = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(p => p.team_id === currentTeamId)
      .sort((a, b) => (b.overall_rating || 0) - (a.overall_rating || 0));

    const grid = document.getElementById('individualTrainingGrid');
    if (!players || players.length === 0) {
      grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:#999;">Belum ada pemain di tim.</p>';
      return;
    }

    grid.innerHTML = players.map(p => {
      const avatarUrl = getPlayerAvatarUrl(p);
      const safeName = String(p.name || 'Pemain').replace(/'/g, "\\'");
      return `
      <div style="background:#16213e;padding:15px;border-radius:8px;border:1px solid #333;text-align:center;color:white;">
        <img src="${avatarUrl}" alt="${p.name}" onerror="this.onerror=null;this.src='${FALLBACK_AVATAR_URL}';" style="width:96px;height:96px;border-radius:50%;object-fit:cover;border:3px solid #FFD700;box-shadow:0 4px 14px rgba(0,0,0,0.55);margin-bottom:10px;">
        <h4 style="margin:5px 0;color:#00d4ff;">${p.name}</h4>
        <p style="font-size:12px;color:#aaa;">${p.position} • Rating: <strong style="color:#ffd700;">${p.overall_rating}</strong></p>
        <button onclick="trainPlayer('${p.id}', '${safeName}', ${p.overall_rating})" style="margin-top:10px;width:100%;padding:8px;background:#28a745;color:white;border:none;border-radius:5px;cursor:pointer;">Latih Pemain</button>
      </div>
    `;
    }).join('');
  } catch (err) {
    console.error('Error loading players:', err);
  }
}

async function trainPlayer(playerId, playerName, currentRating) {
  if (currentRating >= 99) {
    alert('Rating pemain sudah maksimal!');
    return;
  }

  if (!confirm(`Latih ${playerName}? Rating akan meningkat 1-3 poin secara acak.`)) {
    return;
  }

  try {
    const increase = Math.floor(Math.random() * 3) + 1;
    const newRating = Math.min(currentRating + increase, 99);

    await updateDoc(doc(db, 'players', playerId), {
      overall_rating: newRating
    });

    alert(`Berhasil! ${playerName} meningkat dari ${currentRating} menjadi ${newRating} (+${increase})`);
    await loadPlayers();
  } catch (err) {
    console.error('Error training player:', err);
    alert('Gagal melatih pemain. Coba lagi.');
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
      document.getElementById('goldBalance').textContent = (profile.gold || 0).toLocaleString('id-ID');
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
    }

    await loadPlayers();
  } catch (error) {
    console.error('Error:', error);
  }
});

window.handleLogout = handleLogout;
window.switchTrainingTab = switchTrainingTab;
window.trainPlayer = trainPlayer;
