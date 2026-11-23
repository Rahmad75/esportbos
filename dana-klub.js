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
  FALLBACK_AVATAR_URL,
  getCurrentUserOnce,
  getOrCreateProfile,
  getOrCreateTeam,
  getSafeUserAvatarUrl,
  handleFirestoreError,
  OperationType
} from './firebase-config.js';

let allTransactions = [];
let currentFilter = 'all';
let currentUserId = null;

async function handleLogout() {
  await signOut(auth);
  window.location.href = 'index.html';
}

function getTransactionIcon(category) {
  const icons = {
    income: '💰',
    expense: '💸',
    exchange: '💱',
    withdraw: '🏦',
    match: '🎮',
    sponsor: '🤝',
    ticket: '🎟️',
    wage: '👥',
    maintenance: '🏟️',
    topup: '💎'
  };
  return icons[category] || '💵';
}

function renderTransactions() {
  const container = document.getElementById('transactionList');
  if (!container) return;

  let filtered = allTransactions;
  if (currentFilter === 'income') {
    filtered = allTransactions.filter(t => t.type === 'topup' || (t.type === 'exchange' && Number(t.amount_to || 0) > 0));
  } else if (currentFilter === 'expense') {
    filtered = allTransactions.filter(t => t.type === 'withdraw');
  } else if (currentFilter === 'exchange') {
    filtered = allTransactions.filter(t => t.type === 'exchange');
  }

  if (filtered.length === 0) {
    container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">Belum ada transaksi.</p>';
    return;
  }

  container.innerHTML = filtered.slice(0, 50).map(t => {
    const date = t.created_at ? new Date(t.created_at).toLocaleString('id-ID') : '-';
    const isWithdraw = t.type === 'withdraw';
    const amountClass = isWithdraw ? 'expense' : 'income';
    const amountSign = isWithdraw ? '-' : '+';
    const displayAmount = t.type === 'topup'
      ? `${(t.diamonds || 0).toLocaleString('id-ID')} Diamond`
      : t.type === 'exchange'
        ? `${Number(t.amount_to || 0).toLocaleString('id-ID')} ${t.to_currency || ''}`
        : `${Number(t.amount_from || t.amount || 0).toLocaleString('id-ID')} ${t.from_currency || 'Diamond'}`;

    const desc = t.type === 'exchange'
      ? `Exchange: ${t.amount_from} ${t.from_currency} → ${Number(t.amount_to || 0).toFixed(2)} ${t.to_currency}`
      : t.type === 'withdraw'
        ? `Withdraw: ${t.amount_from} ${t.from_currency || 'Diamond'}`
        : `Top-Up Paket ${(t.package || 'Starter').toUpperCase()}`;

    return `
      <div class="transaction-item">
        <div class="transaction-icon">${getTransactionIcon(t.type)}</div>
        <div class="transaction-details">
          <div class="transaction-title">${desc}</div>
          <div class="transaction-date">${date} • ${(t.status || 'pending').toUpperCase()}</div>
        </div>
        <div class="transaction-amount ${amountClass}">
          ${amountSign}${displayAmount}
        </div>
      </div>
    `;
  }).join('');
}

function filterTransactions(filter, btnEl) {
  currentFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
  const target = btnEl || (typeof window !== 'undefined' && window.event && window.event.target);
  if (target && target.classList) target.classList.add('active');
  renderTransactions();
}

function exportTransactions() {
  if (!allTransactions || allTransactions.length === 0) {
    alert('Belum ada transaksi untuk diekspor.');
    return;
  }
  const rows = [['Tanggal', 'Tipe', 'Status', 'Dari', 'Jumlah Dari', 'Ke', 'Jumlah Ke']];
  allTransactions.forEach(t => {
    rows.push([
      t.created_at || '',
      t.type || '',
      t.status || '',
      t.from_currency || '',
      String(t.amount_from ?? t.amount ?? 0),
      t.to_currency || '',
      String(t.amount_to ?? t.diamonds ?? 0)
    ]);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'laporan-dana-klub.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function renderSummaryAndProjection(profile, team, matches, players) {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  let matchIncomeTotal = 0;
  let weeklyMatchIncome = 0;
  matches.forEach(m => {
    const reward = m.result === 'win' ? 10000 : (m.result === 'draw' ? 2000 : 500);
    matchIncomeTotal += reward;
    if (m.match_date && new Date(m.match_date) >= weekAgo) {
      weeklyMatchIncome += reward;
    }
  });

  const activeSponsorsCount = Array.isArray(team?.active_sponsors) ? team.active_sponsors.length : 0;
  const weeklySponsorIncome = activeSponsorsCount * 2000;
  const ticketIncomeTotal = team?.total_stadium_income || 0;
  const predictionIncomeTotal = (profile?.prediction_correct || 0) * 500;
  const topupDiamonds = allTransactions
    .filter(t => t.type === 'topup' && (t.status === 'completed' || t.status === 'success'))
    .reduce((sum, t) => sum + Number(t.diamonds || 0), 0);

  const playerCount = players.length;
  const staffCount = Array.isArray(team?.hired_staff) ? team.hired_staff.length : 0;
  const stadiumLevel = team?.stadium_level || 1;
  const academyLevel = team?.academy_level || 1;

  const playerWages = playerCount * 15;
  const staffWages = staffCount * 10;
  const stadiumMaint = stadiumLevel * 25;
  const academyCost = academyLevel * 20;
  const weeklyExpense = playerWages + staffWages + stadiumMaint + academyCost;

  const weeklyIncome = weeklyMatchIncome + weeklySponsorIncome;
  const netBalance = weeklyIncome - weeklyExpense;

  document.getElementById('weeklyIncome').textContent = `${weeklyIncome.toLocaleString('id-ID')} Currency`;
  document.getElementById('weeklyExpense').textContent = `${weeklyExpense.toLocaleString('id-ID')} Currency`;
  document.getElementById('netBalance').textContent = `${netBalance.toLocaleString('id-ID')} Currency`;

  document.getElementById('incomeBreakdown').innerHTML = `
    <li>Pertandingan: ${weeklyMatchIncome.toLocaleString('id-ID')}</li>
    <li>Sponsor: ${weeklySponsorIncome.toLocaleString('id-ID')}</li>
  `;
  document.getElementById('expenseBreakdown').innerHTML = `
    <li>Gaji Pemain & Staff: ${(playerWages + staffWages).toLocaleString('id-ID')}</li>
    <li>Stadion & Akademi: ${(stadiumMaint + academyCost).toLocaleString('id-ID')}</li>
  `;

  const statusEl = document.getElementById('netStatus');
  if (netBalance > 0) statusEl.innerHTML = '<span style="color:#28a745">✅ Profit</span>';
  else if (netBalance < 0) statusEl.innerHTML = '<span style="color:#dc3545">⚠️ Defisit</span>';
  else statusEl.innerHTML = '<span style="color:#ffc107">➖ Impas</span>';

  document.getElementById('matchIncome').textContent = `Total: ${matchIncomeTotal.toLocaleString('id-ID')} Currency`;
  document.getElementById('sponsorIncome').textContent = `Total: ${weeklySponsorIncome.toLocaleString('id-ID')} Currency`;
  document.getElementById('ticketIncome').textContent = `Total: ${ticketIncomeTotal.toLocaleString('id-ID')} Gold`;
  document.getElementById('predictionIncome').textContent = `Total: ${predictionIncomeTotal.toLocaleString('id-ID')} Currency`;
  document.getElementById('topupIncome').textContent = `Total: ${topupDiamonds.toLocaleString('id-ID')} Diamond`;

  document.getElementById('playerWages').textContent = `${playerWages.toLocaleString('id-ID')} Currency/minggu`;
  document.getElementById('playerWagesDetail').textContent = `${playerCount} pemain`;
  document.getElementById('staffWages').textContent = `${staffWages.toLocaleString('id-ID')} Currency/minggu`;
  document.getElementById('staffWagesDetail').textContent = `${staffCount} staff`;
  document.getElementById('stadiumMaintenance').textContent = `${stadiumMaint.toLocaleString('id-ID')} Currency/minggu`;
  document.getElementById('stadiumLevel').textContent = stadiumLevel;
  document.getElementById('academyCost').textContent = `${academyCost.toLocaleString('id-ID')} Currency/minggu`;
  document.getElementById('totalWeeklyExpense').textContent = `${weeklyExpense.toLocaleString('id-ID')} Currency`;

  document.getElementById('projectedIncome').textContent = `${weeklyIncome.toLocaleString('id-ID')} Currency`;
  document.getElementById('projectedExpense').textContent = `${weeklyExpense.toLocaleString('id-ID')} Currency`;
  document.getElementById('projectedNet').textContent = `${netBalance.toLocaleString('id-ID')} Currency`;
}

document.addEventListener('DOMContentLoaded', async function() {
  try {
    const user = await getCurrentUserOnce();
    if (!user) {
      window.location.href = 'index.html';
      return;
    }
    currentUserId = user.uid;

    const profile = await getOrCreateProfile(user);
    const team = await getOrCreateTeam(user, profile?.club_name);

    if (profile) {
      const username = profile.username || user.email.split('@')[0];
      const diamonds = profile.diamonds || 0;
      const gold = profile.gold || 0;
      const currency = profile.currency || 0;

      document.getElementById('userName').textContent = username;
      const navAvatar = document.getElementById('navAvatar');
      if (navAvatar) {
        navAvatar.onerror = () => { navAvatar.onerror = null; navAvatar.src = FALLBACK_AVATAR_URL; };
        navAvatar.src = getSafeUserAvatarUrl(profile, username);
      }

      document.getElementById('diamondBalance').textContent = diamonds.toLocaleString('id-ID');
      document.getElementById('goldBalance').textContent = gold.toLocaleString('id-ID');
      document.getElementById('currencyBalance').textContent = currency.toLocaleString('id-ID');

      document.getElementById('totalDiamond').textContent = diamonds.toLocaleString('id-ID');
      document.getElementById('totalGold').textContent = gold.toLocaleString('id-ID');
      document.getElementById('totalCurrency').textContent = currency.toLocaleString('id-ID');
    }

    if (team) {
      const teamNameEl = document.getElementById('teamName');
      if (teamNameEl) teamNameEl.textContent = team.team_name || 'My Club';
      const rankEl = document.querySelector('.team-rank');
      if (rankEl) rankEl.textContent = `${team.wins || 0}W - ${team.draws || 0}D - ${team.losses || 0}L`;
      const popSpan = document.querySelector('.team-popularity span');
      if (popSpan) popSpan.textContent = `Popularitas Klub: ${team.popularity || 0}%`;
      const popFill = document.querySelector('.pop-fill');
      if (popFill) popFill.style.width = `${team.popularity || 0}%`;
      const moralSpan = document.querySelector('.team-moral span');
      if (moralSpan) moralSpan.textContent = `Moral Tim: ${team.moral || 0}%`;
      const moralFill = document.querySelector('.moral-fill');
      if (moralFill) moralFill.style.width = `${team.moral || 0}%`;
    }

    let matches = [];
    let players = [];

    try {
      const txSnap = await getDocs(query(collection(db, 'transactions'), where('user_id', '==', currentUserId)));
      allTransactions = txSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'transactions');
    }

    try {
      const matchSnap = await getDocs(query(collection(db, 'matches'), where('user_id', '==', currentUserId)));
      matches = matchSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'matches');
    }

    try {
      const playerSnap = await getDocs(query(collection(db, 'players'), where('owner_id', '==', currentUserId)));
      players = playerSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => !team || p.team_id === team.id);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'players');
    }

    renderTransactions();
    renderSummaryAndProjection(profile, team, matches, players);
  } catch (err) {
    console.error('Dana klub error:', err);
  }
});

window.EsportBosAuth = { logout: handleLogout };
window.handleLogout = handleLogout;
window.filterTransactions = filterTransactions;
window.exportTransactions = exportTransactions;
