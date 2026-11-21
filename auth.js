import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  auth,
  getOrCreateProfile,
  getOrCreateTeam
} from './firebase-config.js';

function showRegister() {
  const loginEl = document.getElementById('login');
  const regEl = document.getElementById('register');
  if (loginEl) loginEl.style.display = 'none';
  if (regEl) regEl.style.display = 'block';
  if (window.turnstile) window.turnstile.reset();
}

function showLogin() {
  const regEl = document.getElementById('register');
  const loginEl = document.getElementById('login');
  if (regEl) regEl.style.display = 'none';
  if (loginEl) loginEl.style.display = 'block';
}

async function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!email || !password) {
    alert('❌ Email dan password wajib diisi!');
    return;
  }

  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    await getOrCreateProfile(credential.user);
    await getOrCreateTeam(credential.user);
    window.location.href = 'dashboard.html';
  } catch (err) {
    alert('❌ Login gagal: ' + (err.message || err.code));
  }
}

async function handleRegister() {
  const username = document.getElementById('registerUsername').value.trim();
  const email = document.getElementById('registerEmail').value.trim();
  const password = document.getElementById('registerPassword').value;
  const clubName = document.getElementById('registerClubName').value.trim();
  const referral = document.getElementById('registerReferral').value.trim();

  if (!username || !email || !password || !clubName) {
    alert('❌ Semua field wajib diisi!');
    return;
  }

  if (password.length < 6) {
    alert('❌ Password minimal 6 karakter!');
    return;
  }

  try {
    const urlParams = new URLSearchParams(window.location.search);
    const isTestMode = urlParams.get('test') === 'true';

    if (!isTestMode) {
      const turnstileResponse = document.querySelector('[name="cf-turnstile-response"]');
      if (turnstileResponse && turnstileResponse.value) {
        const captchaResponse = await fetch('/api/verify-captcha', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: turnstileResponse.value })
        });
        const captchaData = await captchaResponse.json();
        if (!captchaData.success) {
          alert('❌ Verifikasi captcha gagal. Coba lagi.');
          return;
        }
      }
    }

    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName: username });
    await getOrCreateProfile(credential.user, {
      username,
      club_name: clubName,
      referred_by: referral || null
    });
    await getOrCreateTeam(credential.user, clubName);
    await signOut(auth);

    alert('✅ Registrasi berhasil! Silakan login.');
    showLogin();
  } catch (err) {
    alert('❌ Registrasi gagal: ' + (err.message || err.code));
  }
}

window.showRegister = showRegister;
window.showLogin = showLogin;
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
