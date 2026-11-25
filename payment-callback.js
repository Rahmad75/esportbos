import {
  collection,
  doc,
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
  const statusEl = document.getElementById('status');
  if (statusEl) {
    statusEl.innerHTML = `
      <div class="loading">
        ⏳ Top-Up sekarang diproses melalui verifikasi manual Admin (QRIS DANA Bisnis / USDT Solana).<br><br>
        <small>Mengalihkan ke halaman Pendanaan Klub...</small>
      </div>
    `;
  }
  setTimeout(() => {
    window.location.href = '/pendanaan-klub.html';
  }, 2000);
}

processPayment();
