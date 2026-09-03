// ===== ESPORTBOS AUTH SYSTEM =====

// Supabase Config
const SUPABASE_URL = 'https://wfmwwbvckeeptkswtohi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndmbXd3YnZja2VlcHRrc3d0b2hpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0MDYxMjMsImV4cCI6MjEwMzk4MjEyM30.1DpjbWHXAOYQ-VtLYBGzcWOnCIrOimDZo_NKKcVHkNk';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Global user state
let currentUser = null;

// ===== FUNGSI UTAMA =====

// Register User
async function registerUser(username, email, password) {
    try {
        console.log(' Registering user...');
        
        // Sign up dengan Supabase Auth
        const { data, error } = await sb.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    username: username,
                    full_name: username
                }
            }
        });

        if (error) throw error;

        console.log('✅ Registrasi berhasil!', data);
        alert('Registrasi berhasil! Silakan cek email untuk verifikasi (jika diperlukan) atau langsung login.');
        showLogin();
        return data;
    } catch (error) {
        console.error('❌ Error registrasi:', error.message);
        alert('Error: ' + error.message);
        return null;
    }
}

// Login User
async function loginUser(email, password) {
    try {
        console.log(' Logging in...');
        
        const { data, error } = await sb.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) throw error;

        console.log('✅ Login berhasil!', data);
        currentUser = data.user;
        
        // Simpan session
        localStorage.setItem('esportbos_user', JSON.stringify({
            id: data.user.id,
            email: data.user.email,
            username: data.user.user_metadata?.username || email
        }));

        // Redirect ke dashboard
        alert('Login berhasil! Selamat datang, ' + (data.user.user_metadata?.username || 'Manager') + '!');
        window.location.href = 'dashboard.html';
        
        return data;
    } catch (error) {
        console.error('❌ Error login:', error.message);
        alert('Login gagal: ' + error.message);
        return null;
    }
}

// Logout User
async function logoutUser() {
    try {
        await sb.auth.signOut();
        localStorage.removeItem('esportbos_user');
        currentUser = null;
        console.log('👋 Logout berhasil');
        window.location.href = 'index.html';
    } catch (error) {
        console.error('❌ Error logout:', error);
    }
}

// Cek apakah user sudah login
async function checkAuth() {
    const { data } = await sb.auth.getSession();
    if (data.session) {
        currentUser = data.session.user;
        return true;
    }
    return false;
}

// Protect halaman (cek auth)
async function requireAuth() {
    const isLoggedIn = await checkAuth();
    if (!isLoggedIn) {
        alert('Silakan login terlebih dahulu!');
        window.location.href = 'index.html';
        return false;
    }
    return true;
}

// ===== FUNGSI UI =====

function showRegister() {
    document.getElementById('login').style.display = 'none';
    document.getElementById('register').style.display = 'block';
}

function showLogin() {
    document.getElementById('register').style.display = 'none';
    document.getElementById('login').style.display = 'block';
}

// ===== EVENT LISTENERS =====

document.addEventListener('DOMContentLoaded', function() {
    // Form Login
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            await loginUser(email, password);
        });
    }

    // Form Register
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const username = document.getElementById('registerUsername').value;
            const email = document.getElementById('registerEmail').value;
            const password = document.getElementById('registerPassword').value;
            await registerUser(username, email, password);
        });
    }

    // Auto-hide forms kalau di dashboard
    const dashboardBody = document.querySelector('.dashboard-body');
    if (dashboardBody) {
        // Kita di dashboard, cek auth
        requireAuth();
    }
});

// Expose functions ke window
window.EsportBosAuth = {
    registerUser,
    loginUser,
    logoutUser,
    checkAuth,
    requireAuth,
    showRegister,
    showLogin
};
