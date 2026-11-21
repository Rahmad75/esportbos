import { signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  collection,
  getDocs,
  query,
  where
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {
  auth,
  db,
  getCurrentUserOnce,
  getOrCreateProfile,
  getOrCreateTeam
} from './firebase-config.js';

async function handleLogout() {
  await signOut(auth);
  window.location.href = 'index.html';
}

document.addEventListener('DOMContentLoaded', async function() {
  try {
    const user = await getCurrentUserOnce();
    if (!user) {
      window.location.href = 'index.html';
      return;
    }

    const profile = await getOrCreateProfile(user);
    const team = await getOrCreateTeam(user, profile?.club_name);

    if (profile) {
      const username = profile.username || user.email.split('@')[0];
      document.getElementById('userName').textContent = username;
      document.getElementById('navAvatar').src = profile.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;
      document.getElementById('diamondBalance').textContent = (profile.diamonds || 0).toLocaleString('id-ID');
      document.getElementById('goldBalance').textContent = (profile.gold || 0).toLocaleString('id-ID');
      document.getElementById('currencyBalance').textContent = (profile.currency || 0).toLocaleString('id-ID');
    }

    if (team) {
      document.getElementById('clubName').textContent = team.team_name;
      document.getElementById('infoTeamName').textContent = team.team_name;
      document.getElementById('clubRank').textContent = `${team.wins}W - ${team.draws}D - ${team.losses}L`;

      document.getElementById('popularityText').textContent = `Popularitas Klub: ${team.popularity}%`;
      document.getElementById('popularityBar').style.width = `${team.popularity}%`;

      document.getElementById('moralText').textContent = `Moral Tim: ${team.moral}%`;
      document.getElementById('moralBar').style.width = `${team.moral}%`;
    }

    const teamId = team ? team.id : null;
    let players = [];
    if (teamId) {
      const q = query(collection(db, 'players'), where('owner_id', '==', user.uid));
      const snap = await getDocs(q);
      players = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(p => p.team_id === teamId)
        .sort((a, b) => (b.overall_rating || 0) - (a.overall_rating || 0));
    }

    const rosterGrid = document.getElementById('rosterGrid');
    const totalPlayersEl = document.getElementById('totalPlayers');

    if (players && players.length > 0) {
      totalPlayersEl.textContent = players.length;
      rosterGrid.innerHTML = players.map(player => `
        <div class="player-card" onclick="showPlayerDetail('${player.id}', '${player.name}', '${player.position}', ${player.overall_rating}, ${player.market_value || 0})" style="cursor: pointer; background: #1a1a2e; border-radius: 10px; padding: 15px; color: white; text-align: center; border: 1px solid #333; transition: transform 0.2s;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
            <span style="background: #00d4ff; color: #000; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 12px;">${player.position}</span>
            <span style="background: #ffd700; color: #000; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 14px;">${player.overall_rating}</span>
          </div>
          <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${player.name}" alt="${player.name}" style="width: 80px; height: 80px; border-radius: 50%; background: #333; margin-bottom: 10px;">
          <h4 style="margin: 5px 0; color: #fff;">${player.name}</h4>
          <p style="font-size: 12px; color: #aaa; margin: 0;">${player.nationality || 'ID'} • ${player.age || 18} Thn</p>
          <div style="margin-top: 10px; color: #28a745; font-weight: bold;">
            💰 ${(player.market_value || 0).toLocaleString('id-ID')}
          </div>
        </div>
      `).join('');
    } else {
      totalPlayersEl.textContent = '0';
      rosterGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; background: #16213e; border-radius: 10px; border: 1px dashed #00d4ff;">
          <div style="font-size: 64px; margin-bottom: 15px;">👥</div>
          <h3 style="color: #fff; margin-bottom: 10px;">Belum Ada Pemain</h3>
          <p style="color: #aaa; margin-bottom: 20px;">Tim Anda masih kosong. Segera rekrut pemain di menu Transfer!</p>
          <button class="btn-futuristic" onclick="window.location.href='transfer.html'" style="padding: 10px 20px; background: #00d4ff; color: #000; border: none; border-radius: 5px; font-weight: bold; cursor: pointer;">Rekrut Pemain</button>
        </div>
      `;
    }
  } catch (error) {
    console.error('Error loading pemain:', error);
    alert('Gagal memuat data. Silakan refresh halaman.');
  }
});

function showPlayerDetail(id, name, position, rating, value) {
  const modal = document.getElementById('playerModal');
  const body = document.getElementById('modalBody');

  body.innerHTML = `
    <div style="text-align: center; padding: 20px;">
      <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${name}" style="width: 120px; height: 120px; border-radius: 50%; background: #333; margin-bottom: 15px;">
      <h2 style="color: #00d4ff; margin: 0;">${name}</h2>
      <p style="color: #aaa; margin-top: 5px;">${position} • Rating: <strong style="color: #ffd700;">${rating}</strong></p>
      <hr style="border-color: #333; margin: 20px 0;">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; text-align: left;">
        <div style="background: #1a1a2e; padding: 10px; border-radius: 8px;">
          <div style="font-size: 12px; color: #aaa;">Nilai Pasar</div>
          <div style="font-size: 18px; color: #28a745; font-weight: bold;">💰 ${value.toLocaleString('id-ID')}</div>
        </div>
        <div style="background: #1a1a2e; padding: 10px; border-radius: 8px;">
          <div style="font-size: 12px; color: #aaa;">Status</div>
          <div style="font-size: 18px; color: #fff; font-weight: bold;">Aktif</div>
        </div>
      </div>
      <button onclick="closeModal()" style="margin-top: 20px; padding: 10px 30px; background: #ff6b6b; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">Tutup</button>
    </div>
  `;

  modal.style.display = 'flex';
  modal.style.position = 'fixed';
  modal.style.top = '0';
  modal.style.left = '0';
  modal.style.width = '100%';
  modal.style.height = '100%';
  modal.style.background = 'rgba(0,0,0,0.8)';
  modal.style.zIndex = '9999';
  modal.style.justifyContent = 'center';
  modal.style.alignItems = 'center';
}

function closeModal() {
  document.getElementById('playerModal').style.display = 'none';
}

window.handleLogout = handleLogout;
window.showPlayerDetail = showPlayerDetail;
window.closeModal = closeModal;
