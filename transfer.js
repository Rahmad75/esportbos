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
  getCurrentUserOnce,
  getOrCreateProfile,
  getOrCreateTeam
} from './firebase-config.js';

let currentTeamId = null;
let currentUserId = null;
let userGold = 0;

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
    document.getElementById('clubName').textContent = team.team_name;
    document.getElementById('clubRank').textContent = `${team.wins}W - ${team.draws}D - ${team.losses}L`;
    document.getElementById('popularityText').textContent = `Popularitas: ${team.popularity}%`;
    document.getElementById('popularityBar').style.width = `${team.popularity}%`;
    document.getElementById('moralText').textContent = `Moral: ${team.moral}%`;
    document.getElementById('moralBar').style.width = `${team.moral}%`;
  }

  await renderMarket();
  await renderMyTeam();
  renderHistory();
});

function switchTransferTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(`tab-${tab}`).style.display = 'block';
  if (window.event && window.event.target) window.event.target.classList.add('active');
}

async function renderMarket() {
  const posFilter = document.getElementById('filterPosition').value;
  const budgetFilter = document.getElementById('filterBudget').value;

  const q = query(collection(db, 'players'), where('team_id', '==', null));
  const snap = await getDocs(q);
  let marketPlayers = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(p => posFilter === 'all' || p.position === posFilter)
    .sort((a, b) => (b.overall_rating || 0) - (a.overall_rating || 0));

  if (marketPlayers.length === 0) {
    marketPlayers = [
      { id: 'm1', name: 'Faker Jr.', position: 'Mid', overall_rating: 85, market_value: 12000, nationality: 'KR' },
      { id: 'm2', name: 'Jungle King', position: 'Jungle', overall_rating: 82, market_value: 8500, nationality: 'ID' },
      { id: 'm3', name: 'Top Gap', position: 'Top', overall_rating: 79, market_value: 6000, nationality: 'ID' },
      { id: 'm4', name: 'ADC Carry', position: 'ADC', overall_rating: 88, market_value: 18000, nationality: 'KR' }
    ].filter(p => posFilter === 'all' || p.position === posFilter);
  }

  let filtered = marketPlayers;
  if (budgetFilter === 'low') filtered = filtered.filter(p => p.market_value < 5000);
  else if (budgetFilter === 'mid') filtered = filtered.filter(p => p.market_value >= 5000 && p.market_value <= 15000);
  else if (budgetFilter === 'high') filtered = filtered.filter(p => p.market_value > 15000);

  const grid = document.getElementById('marketGrid');
  if (filtered.length === 0) {
    grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #999;">Tidak ada pemain yang sesuai filter.</p>';
    return;
  }

  grid.innerHTML = filtered.map(p => `
    <div style="background: #16213e; padding: 15px; border-radius: 8px; border: 1px solid #333; text-align: center; color: white;">
      <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${p.name}" style="width: 60px; height: 60px; border-radius: 50%; background: #0f3460; margin-bottom: 10px;">
      <h4 style="margin: 5px 0; color: #00d4ff;">${p.name}</h4>
      <p style="font-size: 12px; color: #aaa;">${p.position} • Rating: <strong style="color: #ffd700;">${p.overall_rating}</strong></p>
      <p style="font-size: 14px; color: #28a745; font-weight: bold; margin: 10px 0;">💰 ${p.market_value.toLocaleString('id-ID')} Gold</p>
      <button onclick="buyPlayer('${p.id}', '${p.name}', ${p.market_value}, '${p.position}', ${p.overall_rating})" style="width: 100%; padding: 8px; background: #00d4ff; color: #000; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">Beli Pemain</button>
    </div>
  `).join('');
}

async function renderMyTeam() {
  if (!currentTeamId) return;
  const q = query(collection(db, 'players'), where('owner_id', '==', currentUserId));
  const snap = await getDocs(q);
  const players = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(p => p.team_id === currentTeamId)
    .sort((a, b) => (b.overall_rating || 0) - (a.overall_rating || 0));

  const grid = document.getElementById('myTeamGrid');
  if (!players || players.length === 0) {
    grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #999;">Tim Anda belum memiliki pemain. Beli di Market terlebih dahulu!</p>';
    return;
  }

  grid.innerHTML = players.map(p => `
    <div style="background: #16213e; padding: 15px; border-radius: 8px; border: 1px solid #333; text-align: center; color: white;">
      <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${p.name}" style="width: 60px; height: 60px; border-radius: 50%; background: #0f3460; margin-bottom: 10px;">
      <h4 style="margin: 5px 0; color: #00d4ff;">${p.name}</h4>
      <p style="font-size: 12px; color: #aaa;">${p.position} • Rating: <strong style="color: #ffd700;">${p.overall_rating}</strong></p>
      <p style="font-size: 14px; color: #ffd700; font-weight: bold; margin: 10px 0;">Nilai Jual: 💰 ${Math.floor((p.market_value || 0) * 0.8).toLocaleString('id-ID')} Gold</p>
      <button onclick="sellPlayer('${p.id}', '${p.name}', ${p.market_value || 0})" style="width: 100%; padding: 8px; background: #ff6b6b; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">Jual Pemain</button>
    </div>
  `).join('');
}

async function buyPlayer(playerId, playerName, price, position = 'Mid', rating = 80) {
  if (userGold < price) {
    alert('❌ Gold tidak cukup untuk membeli pemain ini!');
    return;
  }

  if (!confirm(`Yakin ingin membeli ${playerName} seharga ${price.toLocaleString('id-ID')} Gold?`)) return;

  const newGold = userGold - price;
  await updateDoc(doc(db, 'profiles', currentUserId), {
    gold: newGold,
    updated_at: new Date().toISOString()
  });
  userGold = newGold;
  document.getElementById('goldBalance').textContent = userGold.toLocaleString('id-ID');

  if (playerId.startsWith('m')) {
    await addDoc(collection(db, 'players'), {
      name: playerName,
      position: position,
      overall_rating: rating,
      market_value: price,
      team_id: currentTeamId,
      owner_id: currentUserId
    });
  } else {
    await updateDoc(doc(db, 'players', playerId), {
      team_id: currentTeamId,
      owner_id: currentUserId
    });
  }

  alert(`✅ Berhasil membeli ${playerName}!`);
  await renderMarket();
  await renderMyTeam();
}

async function sellPlayer(playerId, playerName, price) {
  const sellPrice = Math.floor(price * 0.8);

  if (!confirm(`Yakin ingin menjual ${playerName}? Anda akan mendapat ${sellPrice.toLocaleString('id-ID')} Gold.`)) return;

  const newGold = userGold + sellPrice;
  await updateDoc(doc(db, 'profiles', currentUserId), {
    gold: newGold,
    updated_at: new Date().toISOString()
  });
  userGold = newGold;
  document.getElementById('goldBalance').textContent = userGold.toLocaleString('id-ID');

  await updateDoc(doc(db, 'players', playerId), {
    team_id: null,
    owner_id: null
  });

  alert(`✅ Berhasil menjual ${playerName}!`);
  await renderMarket();
  await renderMyTeam();
}

function renderHistory() {
  document.getElementById('transferHistoryList').innerHTML = `
    <div style="padding: 15px; background: #16213e; border-radius: 8px; color: white; text-align: center;">
      <p style="color: #aaa;">📜 Belum ada riwayat transfer resmi di musim ini.</p>
      <p style="font-size: 12px; color: #666;">Riwayat akan muncul otomatis setelah Anda membeli atau menjual pemain.</p>
    </div>
  `;
}

function closeTransferModal() {
  document.getElementById('transferModal').style.display = 'none';
}

window.handleLogout = handleLogout;
window.switchTransferTab = switchTransferTab;
window.renderMarket = renderMarket;
window.buyPlayer = buyPlayer;
window.sellPlayer = sellPlayer;
window.closeTransferModal = closeTransferModal;
