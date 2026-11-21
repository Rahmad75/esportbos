import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {
  db,
  getCurrentUserOnce
} from './firebase-config.js';

async function processPayment() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const mockSuccess = urlParams.get('mock');
    const orderId = urlParams.get('orderId');

    if (mockSuccess === 'success') {
      await new Promise(resolve => setTimeout(resolve, 1500));

      const user = await getCurrentUserOnce();
      if (!user) {
        document.getElementById('status').innerHTML = '<div class="failed">❌ Silakan login dulu</div>';
        setTimeout(() => { window.location.href = '/index.html'; }, 3000);
        return;
      }

      const q = query(collection(db, 'transactions'), where('user_id', '==', user.uid));
      const snap = await getDocs(q);
      const userTransactions = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      let transaction = null;
      if (orderId) {
        transaction = userTransactions.find(t => t.order_id === orderId) || null;
      }
      if (!transaction) {
        transaction = userTransactions.find(t => t.status === 'pending') || null;
      }

      if (transaction) {
        if (transaction.status === 'pending') {
          await updateDoc(doc(db, 'transactions', transaction.id), {
            status: 'completed',
            completed_at: new Date().toISOString()
          });

          const profileSnap = await getDoc(doc(db, 'profiles', user.uid));
          const profile = profileSnap.exists() ? profileSnap.data() : { diamonds: 0, gold: 0 };

          const newDiamonds = (profile.diamonds || 0) + (transaction.diamonds || 0);
          const newGold = (profile.gold || 0) + (transaction.gold || 0);

          await updateDoc(doc(db, 'profiles', user.uid), {
            diamonds: newDiamonds,
            gold: newGold,
            updated_at: new Date().toISOString()
          });
        }

        document.getElementById('status').innerHTML = `
          <div class="success">
            ✅ Pembayaran Berhasil!<br><br>
            💎 +${transaction.diamonds || 0} Diamond<br>
            🟡 +${transaction.gold || 0} Gold<br><br>
            <small>Redirecting ke dashboard...</small>
          </div>
        `;

        setTimeout(() => {
          window.location.href = '/pendanaan-klub.html';
        }, 3000);
      } else {
        document.getElementById('status').innerHTML = '<div class="failed">❌ Transaksi tidak ditemukan</div>';
      }
    } else {
      document.getElementById('status').innerHTML = '<div class="loading">Verifikasi pembayaran...</div>';
      setTimeout(() => {
        window.location.href = '/pendanaan-klub.html';
      }, 2000);
    }
  } catch (error) {
    console.error('Error:', error);
    document.getElementById('status').innerHTML = '<div class="failed">❌ Error: ' + error.message + '</div>';
  }
}

processPayment();
