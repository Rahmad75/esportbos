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

const ADMIN_EMAILS = [
  'muhammadgazali75@gmail.com',
  'angriyani1977@gmail.com',
  'm.gazali1975@gmail.com'
];

let currentUser = null;

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
        <td><strong>${p.username || 'Manager'}</strong></td>
        <td>${p.id.slice(0, 10)}...</td>
        <td><span class="role-badge ${isAdmin ? 'admin' : 'user'}">${roleLabel}</span></td>
        <td>${userTeam ? userTeam.team_name : (p.club_name || '-')}</td>
        <td>${(p.gold || 0).toLocaleString('id-ID')} G</td>
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
      <span class="log-action">${m.result === 'win' ? '✅ WIN' : (m.result === 'draw' ? '➖ DRAW' : '❌ LOSE')} ${m.home_team_name || 'Home'} vs ${m.away_team_name || 'Away'} (${m.home_score ?? 0}-${m.away_score ?? 0})</span>
    </div>
  `).join('');
}

async function loadAdminData() {
  let profiles = [];
  let teams = [];
  let matches = [];

  try {
    const profileSnap = await getDocs(query(collection(db, 'profiles'), where('prediction_score', '>=', 0)));
    profiles = profileSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'profiles');
    return;
  }

  try {
    const matchSnap = await getDocs(query(collection(db, 'matches'), where('status', 'in', ['scheduled', 'finished'])));
    matches = matchSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'matches');
    return;
  }

  try {
    const teamSnap = await getDocs(collection(db, 'teams'));
    teams = teamSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn('Admin teams read restricted by Firestore rules until admin doc/verified email is configured:', err.message);
  }

  const totalGold = profiles.reduce((sum, p) => sum + Number(p.gold || 0), 0);

  document.getElementById('totalUsers').textContent = profiles.length;
  document.getElementById('totalGold').textContent = totalGold.toLocaleString('id-ID');
  document.getElementById('totalMatches').textContent = matches.length;
  document.getElementById('totalTeams').textContent = teams.length || profiles.length;

  renderUserTable(profiles, teams);
  renderSystemLogs(matches);
}

function switchAdminTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
  document.querySelectorAll('.sidebar-menu .menu-item').forEach(b => b.classList.remove('active'));
  const target = document.getElementById(`tab-${tabName}`);
  if (target) target.style.display = 'block';
  if (window.event && window.event.target) window.event.target.classList.add('active');
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
  if (!confirm('⚠️ Yakin ingin mereset dana klub Anda ke 10.000 Gold?')) return;
  try {
    await updateDoc(doc(db, 'profiles', currentUser.uid), {
      gold: 10000,
      updated_at: new Date().toISOString()
    });
    alert('✅ Ekonomi berhasil direset ke 10.000 Gold!');
    await loadAdminData();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `profiles/${currentUser.uid}`);
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
  } catch (err) {
    console.error('Admin error:', err);
  }
});

window.EsportBosAuth = { logout: handleLogout };
window.switchAdminTab = switchAdminTab;
window.addPlayerToMarket = addPlayerToMarket;
window.resetMarket = resetMarket;
window.clearData = clearData;
window.resetEconomy = resetEconomy;
window.nukeServer = nukeServer;
