// ===== ESPORTBOS AUTHENTICATION - SUPABASE VERSION =====

// Fungsi untuk menunggu supabaseClient ready
function waitForSupabase(callback, retries = 10) {
    if (typeof window.supabaseClient !== 'undefined') {
        callback();
    } else if (retries > 0) {
        console.log('Menunggu Supabase client... retries left:', retries);
        setTimeout(() => waitForSupabase(callback, retries - 1), 500);
    } else {
        console.error('❌ Supabase client gagal ter-load setelah 5 detik');
        alert('Error: Supabase tidak terinisialisasi. Silakan refresh halaman.');
    }
}

// Fungsi untuk switch antara Login dan Register
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

// ===== FUNGSI REGISTER =====
async function handleRegister() {
    const username = document.getElementById('registerUsername').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const clubName = document.getElementById('registerClubName').value.trim();
    const referral = document.getElementById('registerReferral').value.trim();
    
    // Validasi
    if (!username || !email || !password || !clubName) {
        alert('❌ Semua field wajib diisi!');
        return;
    }
    
    if (password.length < 6) {
        alert('❌ Password minimal 6 karakter!');
        return;
    }
    
    try {
        // 1. Daftar user di Supabase Auth
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
        
        // 2. Update profil dengan nama klub
        if (data.user) {
            const { error: updateError } = await window.supabaseClient
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
            
            if (updateError) {
                console.error('Update profile error:', updateError);
            }
        }
        
        alert('✅ Registrasi berhasil! Silakan login dengan akun yang baru dibuat.');
        showLogin();
        
    } catch (err) {
        alert('❌ Terjadi kesalahan: ' + err.message);
    }
}

// ===== FUNGSI LOGIN =====
async function handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    if (!email || !password) {
        alert('❌ Email dan password wajib diisi!');
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
        
        // 3. Ambil data profil dari database
        const { data: profile, error: profileError } = await window.supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .single();
        
        if (profileError) {
            console.error('Profile error:', profileError);
        }
        
        // 4. Simpan session di localStorage (untuk akses cepat)
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

// ===== FUNGSI LOGOUT =====
async function handleLogout() {
    await window.supabaseClient.auth.signOut();
    localStorage.removeItem('esportbos_current_user');
    alert('👋 Berhasil logout!');
    window.location.href = 'index.html';
}

// ===== FUNGSI CEK AUTH =====
async function checkAuth() {
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    return session !== null;
}

// ===== INIT SAAT DOM LOAD =====
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, checking supabaseClient...');
    
    // Tunggu supabaseClient ready (dengan retry)
    waitForSupabase(function() {
        console.log('✅ Supabase client ready:', window.supabaseClient);
        
        // Setup form listeners
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
        
        // Default tampilkan login
        showLogin();
    });
});

// Export untuk halaman lain
window.EsportBosAuth = {
    login: handleLogin,
    register: handleRegister,
    logout: handleLogout,
    logoutUser: handleLogout,
    checkAuth: checkAuth
};
