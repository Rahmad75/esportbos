// ===== ESPORTBOS AUTHENTICATION - SUPABASE VERSION =====

const SUPABASE_URL = 'https://xvnmpbmyxphrddjjldbt.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_qB9jHOOjiiJDrEQR5XndKA_ji_w-jsv';

function initSupabaseClient() {
    if (typeof window.supabase !== 'undefined') {
        window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('✅ Supabase client initialized:', window.supabaseClient);
        return true;
    }
    return false;
}

if (!initSupabaseClient()) {
    setTimeout(initSupabaseClient, 500);
}

function showLogin() {
    const loginEl = document.getElementById('login');
    const registerEl = document.getElementById('register');
    if (loginEl) loginEl.style.display = 'block';
    if (registerEl) registerEl.style.display = 'none';
}

function showRegister() {
    const loginEl = document.getElementById('login');
    const registerEl = document.getElementById('register');
    if (loginEl) loginEl.style.display = 'none';
    if (registerEl) registerEl.style.display = 'block';
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
    
    if (!window.supabaseClient) {
        alert('❌ Supabase belum siap. Silakan refresh halaman.');
        return;
    }
    
    try {
        const { data, error } = await window.supabaseClient.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    username: username,
                    club_name: clubName,
                    referral: referral
                }
            }
        });
        
        if (error) {
            alert('❌ Error: ' + error.message);
            return;
        }
        
        if (data.user) {
            await window.supabaseClient
                .from('profiles')
                .update({ 
                    username: username,
                    club_name: clubName,
                    diamonds: 0,
                    gold: 0,
                    currency: 0,
                    popularity: 50,
                    moral: 70,
                    role: 'OWNER'
                })
                .eq('id', data.user.id);
        }
        
        alert('✅ Registrasi berhasil! Silakan login.');
        showLogin();
        
    } catch (err) {
        alert('❌ Terjadi kesalahan: ' + err.message);
    }
}

async function handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    if (!email || !password) {
        alert('❌ Email dan password wajib diisi!');
        return;
    }
    
    if (!window.supabaseClient) {
        alert('❌ Supabase belum siap. Silakan refresh halaman.');
        return;
    }
    
    try {
        const { data, error } = await window.supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });
        
        if (error) {
            alert('❌ Login gagal: ' + error.message);
            return;
        }
        
        const { data: profile } = await window.supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .single();
        
        const userData = {
            id: data.user.id,
            email: data.user.email,
            username: profile?.username || data.user.user_metadata?.username || email.split('@')[0],
            club_name: profile?.club_name || 'My Club',
            diamonds: profile?.diamonds || 0,
            gold: profile?.gold || 0,
            currency: profile?.currency || 0,
            popularity: profile?.popularity || 50,
            moral: profile?.moral || 70,
            role: profile?.role || 'OWNER',
            joined_date: profile?.joined_date || new Date().toISOString()
        };
        
        localStorage.setItem('esportbos_current_user', JSON.stringify(userData));
        
        alert('✅ Login berhasil! Selamat datang, ' + userData.username + '!');
        window.location.href = 'dashboard.html';
        
    } catch (err) {
        alert('❌ Terjadi kesalahan: ' + err.message);
    }
}

async function handleLogout() {
    if (window.supabaseClient) {
        await window.supabaseClient.auth.signOut();
    }
    localStorage.removeItem('esportbos_current_user');
    window.location.href = 'index.html';
}

async function checkAuth() {
    if (!window.supabaseClient) return false;
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    return session !== null;
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded');
    
    if (!window.supabaseClient) {
        initSupabaseClient();
    }
    
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleLogin();
        });
    }
    
    if (registerForm) {
        registerForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleRegister();
        });
    }
    
    showLogin();
});

window.EsportBosAuth = {
    login: handleLogin,
    register: handleRegister,
    logout: handleLogout,
    logoutUser: handleLogout,
    checkAuth: checkAuth
};
