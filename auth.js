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

const TURNSTILE_ALLOWED_HOSTS = new Set(['esportbos.com', 'www.esportbos.com']);
let turnstileScriptPromise = null;
let turnstileWidgetId = null;

function isTurnstileEnabledHost() {
  return TURNSTILE_ALLOWED_HOSTS.has(window.location.hostname.toLowerCase());
}

function loadTurnstileScript() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (turnstileScriptPromise) return turnstileScriptPromise;

  turnstileScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.turnstile);
    script.onerror = () => reject(new Error('Gagal memuat widget Turnstile'));
    document.head.appendChild(script);
  });

  return turnstileScriptPromise;
}

async function initTurnstileWidget() {
  const container = document.getElementById('turnstileContainer');
  if (!container) return;

  if (!isTurnstileEnabledHost()) {
    container.textContent = '🔒 Verifikasi Turnstile aktif otomatis di esportbos.com';
    container.style.cssText = 'font-size:12px;color:#999;padding:8px 12px;border:1px solid #333;border-radius:6px;background:rgba(255,255,255,0.03);';
    return;
  }

  try {
    const turnstile = await loadTurnstileScript();
    if (!turnstile) return;

    if (turnstileWidgetId !== null) {
      turnstile.reset(turnstileWidgetId);
      return;
    }

    const sitekey = container.dataset.sitekey || '0x4AAAAAAEsqpET_2vCL9a-h';
    turnstileWidgetId = turnstile.render(container, {
      sitekey,
      'error-callback': () => true
    });
  } catch (err) {
    console.warn('Turnstile widget unavailable:', err.message);
  }
}

function showRegister() {
  const loginEl = document.getElementById('login');
  const regEl = document.getElementById('register');
  if (loginEl) loginEl.style.display = 'none';
  if (regEl) regEl.style.display = 'block';
  initTurnstileWidget();
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

    if (!isTestMode && isTurnstileEnabledHost()) {
      const token = (window.turnstile && turnstileWidgetId !== null)
        ? window.turnstile.getResponse(turnstileWidgetId)
        : (document.querySelector('[name="cf-turnstile-response"]')?.value || '');

      if (!token) {
        alert('❌ Silakan selesaikan verifikasi captcha terlebih dahulu.');
        return;
      }

      const captchaResponse = await fetch('/api/verify-captcha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const captchaData = await captchaResponse.json();
      if (!captchaResponse.ok || !captchaData.success) {
        alert('❌ Verifikasi captcha gagal. Coba lagi.');
        if (window.turnstile && turnstileWidgetId !== null) {
          window.turnstile.reset(turnstileWidgetId);
        }
        return;
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
