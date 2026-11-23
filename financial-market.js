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
let userBalances = { diamond: 0, gold: 0, currency: 0 };

const rates = {
  'diamond-gold': { from: 'Diamond', to: 'Gold', rate: 20, fee: 0.05 },
  'gold-diamond': { from: 'Gold', to: 'Diamond', rate: 1 / 20, fee: 0.05 },
  'gold-currency': { from: 'Gold', to: 'Currency', rate: 10, fee: 0.05 },
  'currency-gold': { from: 'Currency', to: 'Gold', rate: 1 / 10, fee: 0.05 },
  'diamond-currency': { from: 'Diamond', to: 'Currency', rate: 200, fee: 0.05 },
  'currency-diamond': { from: 'Currency', to: 'Diamond', rate: 1 / 200, fee: 0.05 }
};
let currentExchange = 'diamond-gold';

async function handleLogout() {
  await signOut(auth);
  window.location.href = 'index.html';
}

document.addEventListener('DOMContentLoaded', async function() {
  try {
    const user = await getCurrentUserOnce();
    if (!user) { window.location.href = 'index.html'; return; }
    currentUserId = user.uid;

    const profile = await getOrCreateProfile(user);
    const team = await getOrCreateTeam(user, profile?.club_name);

    if (profile) {
      const username = profile.username || user.email.split('@')[0];
      document.getElementById('userName').textContent = username;
      const navAvatar = document.getElementById('navAvatar');
      if (navAvatar) {
        navAvatar.onerror = () => { navAvatar.onerror = null; navAvatar.src = FALLBACK_AVATAR_URL; };
        navAvatar.src = getSafeUserAvatarUrl(profile, username);
      }

      userBalances = {
        diamond: profile.diamonds || 0,
        gold: profile.gold || 0,
        currency: profile.currency || 0
      };

      document.getElementById('diamondBalance').textContent = userBalances.diamond.toLocaleString('id-ID');
      document.getElementById('goldBalance').textContent = userBalances.gold.toLocaleString('id-ID');
      document.getElementById('currencyBalance').textContent = userBalances.currency.toLocaleString('id-ID');
      document.getElementById('withdrawBalance').textContent = userBalances.diamond.toLocaleString('id-ID');
    }

    if (team) {
      document.getElementById('clubName').textContent = team.team_name;
      document.getElementById('clubRank').textContent = `${team.wins}W - ${team.draws}D - ${team.losses}L`;
      document.getElementById('popularityText').textContent = `Popularitas: ${team.popularity}%`;
      document.getElementById('popularityBar').style.width = `${team.popularity}%`;
      document.getElementById('moralText').textContent = `Moral: ${team.moral}%`;
      document.getElementById('moralBar').style.width = `${team.moral}%`;
    }

    setExchangeDirection('diamond-gold', document.querySelector('.direction-tab'));
    await loadTransactions();
    drawMockChart();
  } catch (err) {
    console.error('Financial market error:', err);
  }
});

function setExchangeDirection(direction, btn) {
  currentExchange = direction;
  const config = rates[direction];

  document.getElementById('fromLabel').textContent = `Dari (${config.from})`;
  document.getElementById('toLabel').textContent = `Ke (${config.to})`;
  document.getElementById('rateInfo').textContent = `Kurs: 1 ${config.from} = ${(config.rate).toLocaleString('id-ID')} ${config.to}`;
  document.getElementById('feeInfo').textContent = `Biaya: ${(config.fee * 100)}%`;

  document.querySelectorAll('.direction-tab').forEach(b => {
    b.classList.remove('active');
    b.style.background = '#333';
    b.style.color = 'white';
  });
  if (btn) {
    btn.classList.add('active');
    btn.style.background = '#00d4ff';
    btn.style.color = '#000';
  }

  document.getElementById('exchangeAmount').value = '';
  document.getElementById('exchangeResult').value = '';

  const balanceKey = config.from.toLowerCase() === 'diamond' ? 'diamond' : config.from.toLowerCase();
  document.getElementById('fromBalance').textContent = `Saldo: ${userBalances[balanceKey].toLocaleString('id-ID')} ${config.from}`;
}

function calculateExchange() {
  const amount = parseFloat(document.getElementById('exchangeAmount').value) || 0;
  const config = rates[currentExchange];
  const feeAmount = amount * config.fee;
  const netAmount = amount - feeAmount;
  const result = netAmount * config.rate;

  document.getElementById('exchangeResult').value = result.toFixed(config.to === 'Diamond' ? 2 : 0);
}

async function executeExchange() {
  const amount = parseFloat(document.getElementById('exchangeAmount').value);
  if (!amount || amount <= 0) return alert('❌ Masukkan jumlah yang valid!');

  const config = rates[currentExchange];
  const feeAmount = amount * config.fee;
  const netAmount = amount - feeAmount;
  const result = netAmount * config.rate;

  const fromKey = config.from.toLowerCase() === 'diamond' ? 'diamond' : config.from.toLowerCase();
  if (userBalances[fromKey] < amount) {
    return alert(`❌ Saldo ${config.from} tidak cukup!`);
  }

  const updates = { updated_at: new Date().toISOString() };
  updates[config.from.toLowerCase() === 'diamond' ? 'diamonds' : config.from.toLowerCase()] = userBalances[fromKey] - amount;

  const toKey = config.to.toLowerCase() === 'diamond' ? 'diamonds' : config.to.toLowerCase();
  updates[toKey] = userBalances[config.to.toLowerCase() === 'diamond' ? 'diamond' : config.to.toLowerCase()] + result;

  try {
    await updateDoc(doc(db, 'profiles', currentUserId), updates);
    await addDoc(collection(db, 'transactions'), {
      user_id: currentUserId,
      type: 'exchange',
      from_currency: config.from,
      to_currency: config.to,
      amount_from: amount,
      amount_to: result,
      fee: feeAmount,
      status: 'completed',
      created_at: new Date().toISOString()
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'profiles/transactions');
    return;
  }

  alert(`✅ Berhasil menukar ${amount} ${config.from} menjadi ${result.toFixed(2)} ${config.to}!`);
  document.getElementById('exchangeAmount').value = '';
  document.getElementById('exchangeResult').value = '';

  const snap = await getDoc(doc(db, 'profiles', currentUserId));
  if (snap.exists()) {
    const profile = snap.data();
    userBalances = { diamond: profile.diamonds || 0, gold: profile.gold || 0, currency: profile.currency || 0 };
    document.getElementById('diamondBalance').textContent = userBalances.diamond.toLocaleString('id-ID');
    document.getElementById('goldBalance').textContent = userBalances.gold.toLocaleString('id-ID');
    document.getElementById('currencyBalance').textContent = userBalances.currency.toLocaleString('id-ID');
    document.getElementById('withdrawBalance').textContent = userBalances.diamond.toLocaleString('id-ID');
    setExchangeDirection(currentExchange, document.querySelector('.direction-tab.active'));
  }
  await loadTransactions();
}

async function requestWithdraw() {
  const netRequired = 2500;
  const grossRequired = Math.ceil(netRequired / 0.85);

  if (userBalances.diamond < grossRequired) {
    return alert(`❌ Saldo Diamond tidak cukup!\n\nMinimum withdraw (net): ${netRequired.toLocaleString('id-ID')} Diamond\nAnda perlu mengirim (gross): ${grossRequired.toLocaleString('id-ID')} Diamond\n\nSaldo Anda saat ini: ${userBalances.diamond.toLocaleString('id-ID')} Diamond`);
  }

  if (!confirm(`Yakin ingin request withdraw ${grossRequired.toLocaleString('id-ID')} Diamond?\n\n(Net yang diterima: ${netRequired.toLocaleString('id-ID')} Diamond ≈ Rp 500.000)`)) return;

  const newBalance = userBalances.diamond - grossRequired;
  try {
    await updateDoc(doc(db, 'profiles', currentUserId), {
      diamonds: newBalance,
      updated_at: new Date().toISOString()
    });
    userBalances.diamond = newBalance;

    await addDoc(collection(db, 'transactions'), {
      user_id: currentUserId,
      type: 'withdraw',
      from_currency: 'Diamond',
      amount_from: grossRequired,
      amount_to: netRequired,
      fee: grossRequired - netRequired,
      status: 'pending',
      created_at: new Date().toISOString()
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'profiles/transactions');
    return;
  }

  alert('✅ Permintaan Withdraw berhasil diajukan! Admin akan memproses dalam 1x24 jam.');
  document.getElementById('diamondBalance').textContent = userBalances.diamond.toLocaleString('id-ID');
  document.getElementById('withdrawBalance').textContent = userBalances.diamond.toLocaleString('id-ID');
  await loadTransactions();
}

async function loadTransactions() {
  let data = [];
  try {
    const q = query(collection(db, 'transactions'), where('user_id', '==', currentUserId));
    const snap = await getDocs(q);
    data = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 10);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'transactions');
    return;
  }

  const list = document.getElementById('transactionList');
  if (!data || data.length === 0) {
    list.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">Belum ada transaksi.</p>';
    return;
  }

  list.innerHTML = data.map(t => {
    const date = new Date(t.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    let desc = '';
    if (t.type === 'exchange') {
      desc = `Exchange: ${t.amount_from} ${t.from_currency} → ${parseFloat(t.amount_to).toFixed(2)} ${t.to_currency}`;
    } else if (t.type === 'withdraw') {
      desc = `Withdraw: ${t.amount_from} ${t.from_currency} (Net: ${t.amount_to})`;
    } else {
      desc = `${t.type}: ${t.amount_to} ${t.to_currency || ''}`;
    }

    const statusColor = t.status === 'completed' ? '#28a745' : (t.status === 'pending' ? '#ffc107' : '#ff6b6b');

    return `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:15px; border-bottom:1px solid #333; color:white;">
        <div>
          <div style="font-weight:bold; color:#00d4ff;">${desc}</div>
          <div style="font-size:12px; color:#aaa;">${date}</div>
        </div>
        <div style="text-align:right;">
          <span style="background:${statusColor}; color:#000; padding:4px 8px; border-radius:4px; font-size:12px; font-weight:bold;">${t.status.toUpperCase()}</span>
        </div>
      </div>
    `;
  }).join('');
}

function drawMockChart() {
  const canvas = document.getElementById('marketChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);

  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  for (let i = 0; i < width; i += 50) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke(); }
  for (let i = 0; i < height; i += 50) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(width, i); ctx.stroke(); }

  ctx.strokeStyle = '#00d4ff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  for (let i = 0; i < width; i += 20) {
    ctx.lineTo(i, (height / 2) + Math.sin(i * 0.05) * 50 + Math.random() * 20);
  }
  ctx.stroke();

  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, height / 1.5);
  for (let i = 0; i < width; i += 20) {
    ctx.lineTo(i, (height / 1.5) + Math.cos(i * 0.05) * 40 + Math.random() * 20);
  }
  ctx.stroke();
}

window.handleLogout = handleLogout;
window.setExchangeDirection = setExchangeDirection;
window.calculateExchange = calculateExchange;
window.executeExchange = executeExchange;
window.requestWithdraw = requestWithdraw;
