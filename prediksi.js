import { signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
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

let currentUserId = null;
let userProfile = null;

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
  userProfile = profile;

  if (profile) {
    const username = profile.username || user.email.split('@')[0];
    document.getElementById('userName').textContent = username;
    document.getElementById('navAvatar').src = profile.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;
    document.getElementById('diamondBalance').textContent = (profile.diamonds || 0).toLocaleString('id-ID');
    document.getElementById('goldBalance').textContent = (profile.gold || 0).toLocaleString('id-ID');
    document.getElementById('currencyBalance').textContent = (profile.currency || 0).toLocaleString('id-ID');

    const predScore = profile.prediction_score || 0;
    const predTotal = profile.prediction_total || 0;
    const predCorrect = profile.prediction_correct || 0;
    const accuracy = predTotal > 0 ? Math.round((predCorrect / predTotal) * 100) : 0;

    document.getElementById('myScore').textContent = predScore;
    document.getElementById('myPredictions').textContent = predTotal;
    document.getElementById('myCorrect').textContent = `${predCorrect} (${accuracy}%)`;
  }

  if (team) {
    document.getElementById('clubName').textContent = team.team_name;
    document.getElementById('clubRank').textContent = `${team.wins}W - ${team.draws}D - ${team.losses}L`;
    document.getElementById('popularityText').textContent = `Popularitas: ${team.popularity}%`;
    document.getElementById('popularityBar').style.width = `${team.popularity}%`;
    document.getElementById('moralText').textContent = `Moral: ${team.moral}%`;
    document.getElementById('moralBar').style.width = `${team.moral}%`;
  }

  await loadMatches();
  await loadLeaderboard();
});

function switchPrediksiTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(`tab-${tab}`).style.display = 'block';
  if (window.event && window.event.target) window.event.target.classList.add('active');
}

async function loadMatches() {
  try {
    const q = query(collection(db, 'matches'), where('status', 'in', ['scheduled', 'finished']));
    const snap = await getDocs(q);
    const matches = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => new Date(a.match_date) - new Date(b.match_date))
      .slice(0, 10);

    if (!matches || matches.length === 0) {
      document.getElementById('todayMatches').innerHTML = '<p style="text-align:center; color:#999;">Belum ada data pertandingan.</p>';
      document.getElementById('allMatches').innerHTML = '<p style="text-align:center; color:#999;">Belum ada data pertandingan.</p>';
      return;
    }

    const todayHTML = matches.slice(0, 5).map(m => renderMatchCard(m)).join('');
    document.getElementById('todayMatches').innerHTML = todayHTML || '<p style="text-align:center; color:#999;">Tidak ada laga unggulan hari ini.</p>';

    const allHTML = matches.map(m => renderMatchCard(m)).join('');
    document.getElementById('allMatches').innerHTML = allHTML || '<p style="text-align:center; color:#999;">Belum ada jadwal pertandingan.</p>';
  } catch (err) {
    console.error('Error loading matches:', err);
  }
}

function renderMatchCard(m) {
  const homeName = m.home_team?.team_name || m.home_team_name || 'Tim A';
  const awayName = m.away_team?.team_name || m.away_team_name || 'Tim B';
  const dateStr = new Date(m.match_date).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return `
    <div style="background: #16213e; padding: 15px; border-radius: 8px; margin-bottom: 15px; color: white; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px;">
      <div style="flex: 1; text-align: right; font-weight: bold; font-size: 16px;">${homeName}</div>
      <div style="text-align: center; color: #aaa; font-size: 12px;">VS<br><span style="color: #00d4ff;">${dateStr}</span></div>
      <div style="flex: 1; text-align: left; font-weight: bold; font-size: 16px;">${awayName}</div>
      <button onclick="openPredictionModal('${m.id}', '${homeName}', '${awayName}')" style="padding: 8px 16px; background: #00d4ff; color: #000; border: none; border-radius: 5px; font-weight: bold; cursor: pointer;">Prediksi</button>
    </div>
  `;
}

async function loadLeaderboard() {
  try {
    const q = query(
      collection(db, 'profiles'),
      where('prediction_score', '>=', 0),
      orderBy('prediction_score', 'desc'),
      limit(50)
    );
    const snap = await getDocs(q);
    const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    const tbody = document.getElementById('leaderboardBody');
    document.getElementById('totalPlayers').textContent = users ? users.length : 0;

    if (!users || users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="padding: 20px; text-align: center; color: #999;">Belum ada data peringkat. Jadilah yang pertama!</td></tr>';
      document.getElementById('myRank').textContent = '#--';
      document.getElementById('userRankDisplay').textContent = '#--';
      return;
    }

    const myRankIndex = users.findIndex(u => u.id === currentUserId || u.username === userProfile?.username);
    const myRank = myRankIndex !== -1 ? `#${myRankIndex + 1}` : '#--';
    document.getElementById('myRank').textContent = myRank;
    document.getElementById('userRankDisplay').textContent = myRank;

    tbody.innerHTML = users.map((u, index) => {
      const isMe = u.id === currentUserId || u.username === userProfile?.username;
      const accuracy = u.prediction_total > 0 ? Math.round((u.prediction_correct / u.prediction_total) * 100) : 0;

      return `
        <tr style="background: ${isMe ? 'rgba(0, 212, 255, 0.1)' : 'transparent'}; border-bottom: 1px solid #333;">
          <td style="padding: 12px; font-weight: bold; color: ${index < 3 ? '#ffd700' : 'white'};">#${index + 1}</td>
          <td style="padding: 12px; color: ${isMe ? '#00d4ff' : 'white'}; font-weight: bold;">${u.username || 'Anonim'}</td>
          <td style="padding: 12px;">${u.prediction_total || 0}</td>
          <td style="padding: 12px; color: #28a745;">${u.prediction_correct || 0} (${accuracy}%)</td>
          <td style="padding: 12px; font-weight: bold; color: #ffd700;">${u.prediction_score || 0}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading leaderboard:', err);
  }
}

function openPredictionModal(matchId, homeName, awayName) {
  const modal = document.getElementById('predictionModal');
  const body = document.getElementById('predictionModalBody');

  body.innerHTML = `
    <h3 style="color: #00d4ff; margin-bottom: 20px;">Buat Prediksi</h3>
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; font-size: 18px; font-weight: bold;">
      <span>${homeName}</span>
      <span style="color: #aaa;">VS</span>
      <span>${awayName}</span>
    </div>
    <div style="display: flex; gap: 10px; justify-content: center; margin-bottom: 20px;">
      <input type="number" id="predHome" min="0" placeholder="0" style="width: 60px; padding: 10px; text-align: center; font-size: 20px; background: #16213e; color: white; border: 1px solid #00d4ff; border-radius: 5px;">
      <span style="font-size: 24px; align-self: center;">-</span>
      <input type="number" id="predAway" min="0" placeholder="0" style="width: 60px; padding: 10px; text-align: center; font-size: 20px; background: #16213e; color: white; border: 1px solid #00d4ff; border-radius: 5px;">
    </div>
    <button onclick="submitPrediction('${matchId}')" style="width: 100%; padding: 12px; background: #28a745; color: white; border: none; border-radius: 5px; font-weight: bold; cursor: pointer; font-size: 16px;">Kirim Prediksi</button>
  `;
  modal.style.display = 'flex';
}

async function submitPrediction(matchId) {
  const homeScore = parseInt(document.getElementById('predHome').value);
  const awayScore = parseInt(document.getElementById('predAway').value);

  if (isNaN(homeScore) || isNaN(awayScore)) {
    alert('❌ Harap isi kedua skor prediksi!');
    return;
  }

  try {
    const predId = `${currentUserId}_${matchId}`;
    await setDoc(doc(db, 'predictions', predId), {
      user_id: currentUserId,
      match_id: matchId,
      home_score: homeScore,
      away_score: awayScore,
      updated_at: new Date().toISOString()
    }, { merge: true });

    const newTotal = (userProfile.prediction_total || 0) + 1;
    const newScore = (userProfile.prediction_score || 0) + 3;

    await updateDoc(doc(db, 'profiles', currentUserId), {
      prediction_total: newTotal,
      prediction_score: newScore,
      updated_at: new Date().toISOString()
    });

    userProfile.prediction_total = newTotal;
    userProfile.prediction_score = newScore;

    alert('✅ Prediksi berhasil disimpan!');
    closePredictionModal();

    document.getElementById('myPredictions').textContent = newTotal;
    document.getElementById('myScore').textContent = newScore;
    await loadLeaderboard();
  } catch (err) {
    console.error(err);
    alert('⚠️ Gagal menyimpan prediksi: ' + err.message);
  }
}

function closePredictionModal() {
  document.getElementById('predictionModal').style.display = 'none';
}

window.handleLogout = handleLogout;
window.switchPrediksiTab = switchPrediksiTab;
window.openPredictionModal = openPredictionModal;
window.submitPrediction = submitPrediction;
window.closePredictionModal = closePredictionModal;
