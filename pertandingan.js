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
  OperationType,
  withFirestoreRetry
} from './firebase-config.js';
import { advanceMarketTurn, formatTurnNotification } from './market-engine.js';
import { getMatchReward, loadEconomyConfig } from './economy-config.js';
import {
  applyServerWalletToDOM,
  claimServerMatchReward,
  requireServerTime,
  startServerMatch
} from './economy-client.js';

let currentUserId = null;
let currentTeamId = null;
let currentTeamName = 'My Club';
let economyConfig = null;

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
  btn.disabled = true;
  btn.textContent = '⚽ Memverifikasi Waktu Server...';
  btn.style.background = '#555';

  try {
    await requireServerTime();
  } catch (syncErr) {
    alert(`❌ ${syncErr.message || 'Gagal sinkronisasi waktu server. Pertandingan ditolak.'}`);
    btn.disabled = false;
    btn.textContent = '⚽ MULAI PERTANDINGAN!';
    btn.style.background = '#28a745';
    return;
  }

  let team = null;
  try {
    const teamSnap = await withFirestoreRetry(() => getDoc(doc(db, 'teams', currentTeamId)), 3, 800);
    team = teamSnap.exists() ? teamSnap.data() : null;
  } catch (err) {
    btn.disabled = false;
    btn.textContent = '⚽ MULAI PERTANDINGAN!';
    btn.style.background = '#28a745';
    handleFirestoreError(err, OperationType.GET, `teams/${currentTeamId}`);
    return;
  }

  if (!economyConfig) {
    economyConfig = await loadEconomyConfig();
  }
  const maxMatchesPerDay = Number(economyConfig.matchReward.maxMatchesPerDay);

  btn.textContent = '⚽ Memulai Pertandingan di Server...';

  let startRes;
  try {
    startRes = await startServerMatch({ teamId: currentTeamId });
  } catch (err) {
    alert(`⚠️ ${err.message || 'Server menolak memulai pertandingan.'}`);
    btn.disabled = false;
    btn.textContent = '⚽ MULAI PERTANDINGAN!';
    btn.style.background = '#28a745';
    return;
  }

  const serverMatch = startRes.match;
  const homeScore = Number(serverMatch.homeScore);
  const awayScore = Number(serverMatch.awayScore);
  const randomOpponent = serverMatch.opponent;
  const result = serverMatch.result;

  document.getElementById('awayTeamName').textContent = randomOpponent;

  let resultText = 'KALAH';
  let resultColor = '#ff6b6b';
  if (result === 'win') {
    resultText = 'MENANG';
    resultColor = '#28a745';
  } else if (result === 'draw') {
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
      <p style="color:#999;font-size:14px;">Durasi: 30 menit • ID: ${serverMatch.matchId}</p>
    </div>
  `;

  btn.textContent = '⚽ Klaim Hadiah Server...';

  let rewardResp;
  try {
    rewardResp = await claimServerMatchReward({
      result,
      opponent: randomOpponent,
      matchId: serverMatch.matchId
    });
  } catch (err) {
    alert(`⚠️ ${err.message || 'Validasi reward pertandingan gagal di server.'}`);
    btn.disabled = false;
    btn.textContent = '⚽ MULAI PERTANDINGAN!';
    btn.style.background = '#28a745';
    return;
  }

  const matchRewardAmount = Number(rewardResp.reward || getMatchReward(economyConfig, result));
  applyServerWalletToDOM(rewardResp.wallet);

  const serverIso = rewardResp.serverDateTime || startRes.serverDateTime;
  const serverToday = rewardResp.todayStr || startRes.todayStr;
  const serverNowMs = Number(rewardResp.serverNowMs || startRes.serverNowMs);

  try {
    const newMatchCount = Number(rewardResp.matchesToday || 1);
    const wins = (team?.wins || 0) + (result === 'win' ? 1 : 0);
    const draws = (team?.draws || 0) + (result === 'draw' ? 1 : 0);
    const losses = (team?.losses || 0) + (result === 'lose' ? 1 : 0);

    await withFirestoreRetry(() => updateDoc(doc(db, 'teams', currentTeamId), {
      last_match_at: serverIso,
      matches_played_today: newMatchCount,
      last_daily_reset: serverToday,
      wins,
      draws,
      losses,
      updated_at: serverIso
    }), 3, 800);

    await withFirestoreRetry(() => addDoc(collection(db, 'matches'), {
      home_team_id: currentTeamId,
      home_team_name: currentTeamName,
      away_team_name: randomOpponent,
      home_score: homeScore,
      away_score: awayScore,
      status: 'finished',
      match_date: serverIso,
      user_id: currentUserId,
      result: result,
      reward_currency: matchRewardAmount,
      duration_minutes: 30
    }), 3, 800);

    const marketUpdate = advanceMarketTurn('Selesai Match', { matchDelta: 1, economyConfig });
    const marketNote = formatTurnNotification(marketUpdate.latestEntry);

    const nextTimeStr = new Date(serverNowMs + 4 * 60 * 60 * 1000).toLocaleTimeString('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit'
    });
    alert(`✅ Pertandingan Selesai!\n\nReward (Validasi Server): +${matchRewardAmount.toLocaleString('id-ID')} Currency\nSaldo Currency: ${Number(rewardResp.wallet?.currency || 0).toLocaleString('id-ID')}\nMatch ke-${newMatchCount}/${maxMatchesPerDay} hari ini\nSisa match: ${Math.max(0, maxMatchesPerDay - newMatchCount)}\n\n📈 ${marketNote}\n\nMatch berikutnya: ${nextTimeStr} WIB`);
  } catch (err) {
    console.error('Error saving match:', err);
    handleFirestoreError(err, OperationType.WRITE, `teams/${currentTeamId}/matches`);
  } finally {
    btn.disabled = false;
    btn.textContent = '⚽ MULAI PERTANDINGAN!';
    btn.style.background = '#28a745';
  }

  await loadMatchHistory();
}

async function loadMatchHistory() {
  if (!currentUserId) return;

  try {
    const q = query(collection(db, 'matches'), where('user_id', '==', currentUserId));
    const snap = await withFirestoreRetry(() => getDocs(q), 3, 800);
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
    economyConfig = await loadEconomyConfig();
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
