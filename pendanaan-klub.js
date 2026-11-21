import { signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  addDoc,
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

let currentUserId = null;

async function handleLogout() {
  await signOut(auth);
  window.location.href = 'index.html';
}

document.addEventListener('DOMContentLoaded', async function() {
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
    document.getElementById('userName').textContent = username;
    document.getElementById('navAvatar').src = profile.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;

    const diamonds = profile.diamonds || 0;
    const gold = profile.gold || 0;
    const currency = profile.currency || 0;

    document.getElementById('diamondBalance').textContent = diamonds.toLocaleString('id-ID');
    document.getElementById('goldBalance').textContent = gold.toLocaleString('id-ID');
    document.getElementById('currencyBalance').textContent = currency.toLocaleString('id-ID');

    document.getElementById('saldoDiamond').textContent = diamonds.toLocaleString('id-ID');
    document.getElementById('saldoGold').textContent = gold.toLocaleString('id-ID');
    document.getElementById('saldoCurrency').textContent = currency.toLocaleString('id-ID');
  }

  if (team) {
    document.getElementById('clubName').textContent = team.team_name;
    document.getElementById('clubRank').textContent = `${team.wins}W - ${team.draws}D - ${team.losses}L`;
    document.getElementById('popularityText').textContent = `Popularitas Klub: ${team.popularity}%`;
    document.getElementById('popularityBar').style.width = `${team.popularity}%`;
    document.getElementById('moralText').textContent = `Moral Tim: ${team.moral}%`;
    document.getElementById('moralBar').style.width = `${team.moral}%`;
  }

  await loadRiwayatPendanaan();
});

async function topUp(packageId, amount, diamonds, gold) {
  try {
    const user = auth.currentUser || await getCurrentUserOnce();
    if (!user) {
      alert('Silakan login dulu!');
      window.location.href = 'index.html';
      return;
    }

    const packageName = packageId.charAt(0).toUpperCase() + packageId.slice(1);
    if (!confirm(`Beli paket ${packageName}?\n\n💎 ${diamonds} Diamond\n🟡 ${gold || 0} Gold\n💰 Rp ${amount.toLocaleString('id-ID')}`)) {
      return;
    }

    const resp = await fetch('/api/create-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        packageId,
        packageName,
        amount,
        diamonds,
        gold: gold || 0
      })
    });
    const data = await resp.json();
    if (!resp.ok || !data.orderId) {
      throw new Error(data.error || 'Payment failed');
    }

    await addDoc(collection(db, 'transactions'), {
      user_id: user.uid,
      order_id: data.orderId,
      type: 'topup',
      package: packageId,
      amount: amount,
      diamonds: diamonds,
      gold: gold || 0,
      status: 'pending',
      created_at: new Date().toISOString()
    });

    if (data && data.paymentUrl) {
      alert('Mengalihkan ke halaman pembayaran...');
      window.location.href = data.paymentUrl;
    } else {
      alert('Payment URL tidak tersedia. Silakan coba lagi.');
    }
  } catch (error) {
    console.error('Top-up error:', error);
    alert('Gagal memproses pembayaran: ' + error.message);
  }
}

async function loadRiwayatPendanaan() {
  try {
    const q = query(collection(db, 'transactions'), where('user_id', '==', currentUserId));
    const snap = await getDocs(q);
    const data = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(tx => tx.type === 'topup')
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 10);

    const container = document.getElementById('riwayatPendanaan');

    if (!data || data.length === 0) {
      container.innerHTML = '<p style="color: #999;">Belum ada riwayat pendanaan. Mulai top-up pertama Anda!</p>';
      return;
    }

    const statusColors = {
      pending: '#ffc107',
      success: '#28a745',
      completed: '#28a745',
      failed: '#dc3545'
    };

    const statusLabels = {
      pending: '⏳ Pending',
      success: '✅ Berhasil',
      completed: '✅ Berhasil',
      failed: '❌ Gagal'
    };

    container.innerHTML = `
      <table style="width: 100%; border-collapse: collapse; color: white;">
        <thead>
          <tr style="background: #16213e; border-bottom: 2px solid #333;">
            <th style="padding: 12px; text-align: left;">Tanggal</th>
            <th style="padding: 12px; text-align: left;">Paket</th>
            <th style="padding: 12px; text-align: left;">Jumlah</th>
            <th style="padding: 12px; text-align: left;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(tx => `
            <tr style="border-bottom: 1px solid #333;">
              <td style="padding: 12px;">${new Date(tx.created_at).toLocaleDateString('id-ID')}</td>
              <td style="padding: 12px; font-weight: bold;">${tx.package ? tx.package.toUpperCase() : 'TOPUP'}</td>
              <td style="padding: 12px;">Rp ${(tx.amount || 0).toLocaleString('id-ID')}</td>
              <td style="padding: 12px;">
                <span style="padding: 5px 12px; background: ${statusColors[tx.status] || '#999'}; color: white; border-radius: 20px; font-size: 12px; font-weight: bold;">
                  ${statusLabels[tx.status] || tx.status}
                </span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    console.error('Error loading riwayat:', err);
    document.getElementById('riwayatPendanaan').innerHTML = '<p style="color: #999;">Gagal memuat riwayat.</p>';
  }
}

window.handleLogout = handleLogout;
window.topUp = topUp;
