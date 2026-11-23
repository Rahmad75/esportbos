import { signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  addDoc,
  collection,
  doc,
  getDoc,
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
  getSafeUserAvatarUrl,
  handleFirestoreError,
  OperationType
} from './firebase-config.js';

let currentUserId = null;
let currentTeamId = null;
let currentTeamName = 'My Club';

function handleLogout() {
  signOut(auth).then(() => { window.location.href = 'index.html'; });
}

function switchMatchTab(tabName, btnElement) {
  document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  const target = document.getElementById('tab-' + tabName);
  if (target) target.style.display = 'block';
  if (btnElement) btnElement.classList.add('active');
}

async function simulateMatch() {
  if (!currentUserId || !currentTeamId) {
    alert('Data tim belum dimuat. Silakan refresh halaman.');
    return;
  }

  const btn = document.getElementById('simulateButton');

  let team = null;
  try {
    const teamSnap = await getDoc(doc(db, 'teams', currentTeamId));
    team = teamSnap.exists() ? teamSnap.data() : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `teams/${currentTeamId}`);
    return;
  }

  const today = new Date().toISOString().split('T')[0];

  let matchesToday = 0;
  if (team && team.last_daily_reset !== today) {
    matchesToday = 0;
    try {
      await updateDoc(doc(db, 'teams', currentTeamId), {
        matches_played_today: 0,
        last_daily_reset: today,
        updated_at: new Date().toISOString()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `teams/${currentTeamId}`);
      return;
    }
  } else if (team) {
    matchesToday = team.matches_played_today || 0;
  }

  if (matchesToday >= 3) {
    alert('⚠️ Batas harian tercapai!\nAnda sudah memainkan 3 pertandingan hari ini.\nKembali besok untuk match selanjutnya.\n\nJadwal reset: 00:00 WIB');
    return;
  }

  if (team && team.last_match_at) {
    const lastMatch = new Date(team.last_match_at).getTime();
    const now = Date.now();
    const diffHours = (now - lastMatch) / (1000 * 60 * 60);

    if (diffHours < 4) {
      const sisaJam = Math.ceil(4 - diffHours);
      const nextMatchTime = new Date(lastMatch + (4 * 60 * 60 * 1000));
      const jamNext = nextMatchTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

      alert(` Mohon tunggu ${sisaJam} jam lagi.\n\nJadwal match berikutnya: ${jamNext} WIB\n(Cooldown 4 jam antar match)`);
      return;
    }
  }

  btn.disabled = true;
  btn.textContent = '⚽ Memproses Pertandingan...';
  btn.style.background = '#555';

  const homeScore = Math.floor(Math.random() * 6);
  const awayScore = Math.floor(Math.random() * 6);

  const opponents = ['Garuda Esports', 'Naga Merah', 'Banteng FC', 'Elang Jawa', 'Harimau Sumatra', 'Satria Muda', 'Bima Sakti', 'Persija Jakarta', 'Persib Bandung'];
  const randomOpponent = opponents[Math.floor(Math.random() * opponents.length)];

  document.getElementById('awayTeamName').textContent = randomOpponent;

  let result = 'lose';
  let resultText = 'KALAH';
  let resultColor = '#ff6b6b';

  if (homeScore > awayScore) {
    result = 'win';
    resultText = 'MENANG';
    resultColor = '#28a745';
  } else if (homeScore === awayScore) {
    result = 'draw';
    resultText = 'SERI';
    resultColor = '#ffc107';
  }

  const resultDiv = document.getElementById('matchResult');
  const resultContent = document.getElementById('matchResultContent');

  resultDiv.style.display = 'block';
  resultContent.innerHTML = `
    <div style="text-align:center; margin-bottom:20px;">
      <h2 style="color:${resultColor}; font-size:32px; margin:0;">${resultText}</h2>
      <div style="font-size:48px; font-weight:bold; color:white; margin:10px 0;">
        ${homeScore} - ${awayScore}
      </div>
      <p style="color:#999;">${currentTeamName} vs ${randomOpponent}</p>
      <p style="color:#999;font-size:14px;">Durasi: 30 menit</p>
    </div>
  `;

  await giveMatchReward(result);

  try {
    const newMatchCount = matchesToday + 1;
    const wins = (team?.wins || 0) + (result === 'win' ? 1 : 0);
    const draws = (team?.draws || 0) + (result === 'draw' ? 1 : 0);
    const losses = (team?.losses || 0) + (result === 'lose' ? 1 : 0);

    await updateDoc(doc(db, 'teams', currentTeamId), {
      last_match_at: new Date().toISOString(),
      matches_played_today: newMatchCount,
      last_daily_reset: today,
      wins,
      draws,
      losses,
      updated_at: new Date().toISOString()
    });

    await addDoc(collection(db, 'matches'), {
      home_team_id: currentTeamId,
      home_team_name: currentTeamName,
      away_team_name: randomOpponent,
      home_score: homeScore,
      away_score: awayScore,
      status: 'finished',
      match_date: new Date().toISOString(),
      user_id: currentUserId,
      result: result,
      duration_minutes: 30
    });

    alert(`✅ Pertandingan Selesai!\n\nReward: ${result === 'win' ? '10,000' : result === 'draw' ? '2,000' : '500'} Currency\nMatch ke-${newMatchCount}/3 hari ini\nSisa match: ${3 - newMatchCount}\n\nMatch berikutnya: ${(new Date(Date.now() + 4 * 60 * 60 * 1000)).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB`);
  } catch (err) {
    console.error('Error saving match:', err);
    handleFirestoreError(err, OperationType.WRITE, `teams/${currentTeamId}/matches`);
  } finally {
    btn.disabled = false;
    btn.textContent = ' MAIN LAGI!';
    btn.style.background = '#28a745';
  }

  await loadMatchHistory();
}

async function giveMatchReward(result) {
  let reward = 0;
  if (result === 'win') reward = 10000;
  else if (result === 'draw') reward = 2000;
  else if (result === 'lose') reward = 500;

  if (reward > 0 && currentUserId) {
    try {
      const profileSnap = await getDoc(doc(db, 'profiles', currentUserId));
      const profile = profileSnap.exists() ? profileSnap.data() : { currency: 0 };
      const newBalance = (profile.currency || 0) + reward;

      await updateDoc(doc(db, 'profiles', currentUserId), {
        currency: newBalance,
        updated_at: new Date().toISOString()
      });

      const saldoEl = document.getElementById('currencyBalance');
      if (saldoEl) saldoEl.textContent = newBalance.toLocaleString('id-ID');

      alert('💰 Reward Pertandingan!\nAnda mendapatkan ' + reward.toLocaleString('id-ID') + ' Currency.');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `profiles/${currentUserId}`);
    }
  }
}

async function loadMatchHistory() {
  if (!currentUserId) return;

  try {
    const q = query(collection(db, 'matches'), where('user_id', '==', currentUserId));
    const snap = await getDocs(q);
    const matches = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => new Date(b.match_date) - new Date(a.match_date))
      .slice(0, 10);

    const list = document.getElementById('matchHistoryList');

    if (!matches || matches.length === 0) {
      list.innerHTML = '<p style="text-align:center;color:#999;">Belum ada riwayat pertandingan. Ayo main di tab Simulasi!</p>';
      return;
    }

    list.innerHTML = matches.map(m => {
      const isWin = m.home_score > m.away_score;
      const isDraw = m.home_score === m.away_score;
      const statusColor = isWin ? '#28a745' : (isDraw ? '#ffc107' : '#ff6b6b');
      const statusText = isWin ? 'MENANG' : (isDraw ? 'SERI' : 'KALAH');
      const date = new Date(m.match_date).toLocaleDateString('id-ID');

      return `
        <div style="background:#16213e;padding:15px;border-radius:8px;border-left:5px solid ${statusColor};display:flex;justify-content:space-between;align-items:center;color:white;">
          <div>
            <div style="font-weight:bold;color:#00d4ff;">${currentTeamName} vs ${m.away_team_name || 'Lawan'}</div>
            <div style="font-size:12px;color:#999;">${date}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:20px;font-weight:bold;">${m.home_score} - ${m.away_score}</div>
            <div style="font-size:12px;color:${statusColor};font-weight:bold;">${statusText}</div>
          </div>
        </div>`;
    }).join('');
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'matches');
  }
}

document.addEventListener('DOMContentLoaded', async function() {
  try {
    const user = await getCurrentUserOnce();
    if (!user) { window.location.href = 'index.html'; return; }
    currentUserId = user.uid;

    const profile = await getOrCreateProfile(user);
    const team = await getOrCreateTeam(user, profile?.club_name);

    if (team) {
      currentTeamId = team.id;
      currentTeamName = team.team_name || 'My Club';
      document.getElementById('clubName').textContent = currentTeamName;
      document.getElementById('homeTeamName').textContent = currentTeamName;
      document.getElementById('clubRank').textContent = (team.wins || 0) + 'W-' + (team.draws || 0) + 'D-' + (team.losses || 0) + 'L';
      document.getElementById('popularityText').textContent = 'Popularitas Klub: ' + (team.popularity || 0) + '%';
      document.getElementById('popularityBar').style.width = (team.popularity || 0) + '%';
      document.getElementById('moralText').textContent = 'Moral Tim: ' + (team.moral || 0) + '%';
      document.getElementById('moralBar').style.width = (team.moral || 0) + '%';
    }

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

    await loadMatchHistory();
  } catch (error) {
    console.error('Error loading match page:', error);
  }
});

window.handleLogout = handleLogout;
window.switchMatchTab = switchMatchTab;
window.simulateMatch = simulateMatch;
