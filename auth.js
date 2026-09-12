// ==========================================================
// AUTH.JS - UNIVERSAL & SAFE (Tidak akan bentrok lagi!)
// ==========================================================

// 1. Inisialisasi Supabase dengan aman (hanya buat 1x)
if (!window.supabaseClient) {
    window.supabaseClient = window.supabase.createClient(
        'https://xvnmpbmyxphrddjjldbt.supabase.co',
        'sb_publishable_qB9jHOOjiiJDrEQR5XndKA_ji_w-jsv'
    );
}
const supabase = window.supabaseClient;

// 2. Fungsi Toggle Tampilan Login/Register
function showRegister() {
    document.getElementById('login').style.display = 'none';
    document.getElementById('register').style.display = 'block';
    // Reset turnstile jika ada
    if (window.turnstile) window.turnstile.reset();
}

function showLogin() {
    document.getElementById('register').style.display = 'none';
    document.getElementById('login').style.display = 'block';
}

// 3. Fungsi Handle Login
async function handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
        alert('❌ Email dan password wajib diisi!');
        return;
    }

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) {
            alert('❌ Login gagal: ' + error.message);
            return;
        }

        // Redirect ke dashboard setelah login berhasil
        window.location.href = 'dashboard.html';

    } catch (err) {
        alert('❌ Terjadi kesalahan sistem: ' + err.message);
    }
}

// 4. Fungsi Handle Register
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
        // Skip captcha jika mode testing (tambahkan ?test=true di URL)
        const urlParams = new URLSearchParams(window.location.search);
        const isTestMode = urlParams.get('test') === 'true';

        if (!isTestMode) {
            // Ambil token turnstile
            const turnstileResponse = document.querySelector('[name="cf-turnstile-response"]');
            if (!turnstileResponse || !turnstileResponse.value) {
                alert('❌ Harap selesaikan verifikasi captcha!');
                return;
            }

            // Verifikasi captcha ke Edge Function
            const captchaResponse = await fetch('https://xvnmpbmyxphrddjjldbt.supabase.co/functions/v1/verify-captcha-', {
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

        // Daftar user di Supabase
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    username: username,
                    club_name: clubName,
                    referral_code: referral
                }
            }
        });

        if (error) {
            alert('❌ Registrasi gagal: ' + error.message);
            return;
        }

        alert('✅ Registrasi berhasil! Silakan login.');
        showLogin();

    } catch (err) {
        alert('❌ Terjadi kesalahan sistem: ' + err.message);
    }
}

console.log('✅ Auth.js loaded successfully (Universal Safe Mode)');
