// ===== ESPORTBOS AUTHENTICATION SYSTEM =====

// Fungsi untuk menampilkan form Login
function showLogin() {
    document.getElementById('login').style.display = 'block';
    document.getElementById('register').style.display = 'none';
}

// Fungsi untuk menampilkan form Register
function showRegister() {
    document.getElementById('login').style.display = 'none';
    document.getElementById('register').style.display = 'block';
}

// Fungsi Login
function handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    // Validasi
    if (!email || !password) {
        alert('❌ Email dan password wajib diisi!');
        return;
    }
    
    // Ambil data users dari localStorage
    const users = JSON.parse(localStorage.getItem('esportbos_users') || '[]');
    
    // Cari user berdasarkan email
    const user = users.find(u => u.email === email && u.password === password);
    
    if (user) {
        // Login berhasil - simpan user yang sedang login
        localStorage.setItem('esportbos_current_user', JSON.stringify(user));
        
        // Inisialisasi data jika belum ada
        initializeUserData(user.email);
        
        alert('✅ Login berhasil! Selamat datang, ' + user.username + '!');
        window.location.href = 'dashboard.html';
    } else {
        alert('❌ Email atau password salah! Silakan daftar jika belum punya akun.');
    }
}

// Fungsi Register
function handleRegister() {
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
    
    // Ambil data users
    const users = JSON.parse(localStorage.getItem('esportbos_users') || '[]');
    
    // Cek apakah email sudah terdaftar
    if (users.find(u => u.email === email)) {
        alert('❌ Email sudah terdaftar! Silakan login.');
        showLogin();
        return;
    }
    
    // Buat user baru
    const newUser = {
        username: username,
        email: email,
        password: password,
        referral: referral,
        joinedDate: new Date().toISOString()
    };
    
    // Simpan user baru
    users.push(newUser);
    localStorage.setItem('esportbos_users', JSON.stringify(users));
    
    // Simpan nama klub
    localStorage.setItem(`esportbos_club_name_${email}`, clubName);
    
    // Inisialisasi data ekonomi
    initializeUserData(email);
    
    alert('✅ Registrasi berhasil! Silakan login dengan akun yang baru dibuat.');
    showLogin();
}

// Fungsi untuk inisialisasi data user
function initializeUserData(email) {
    // Cek apakah sudah ada data
    if (localStorage.getItem(`esportbos_diamonds_${email}`) === null) {
        localStorage.setItem(`esportbos_diamonds_${email}`, '0');
    }
    if (localStorage.getItem(`esportbos_gold_${email}`) === null) {
        localStorage.setItem(`esportbos_gold_${email}`, '0');
    }
    if (localStorage.getItem(`esportbos_currency_${email}`) === null) {
        localStorage.setItem(`esportbos_currency_${email}`, '0');
    }
    if (localStorage.getItem(`esportbos_club_rank_${email}`) === null) {
        localStorage.setItem(`esportbos_club_rank_${email}`, '16th in C.4');
    }
    if (localStorage.getItem(`esportbos_popularity_${email}`) === null) {
        localStorage.setItem(`esportbos_popularity_${email}`, '50');
    }
    if (localStorage.getItem(`esportbos_moral_${email}`) === null) {
        localStorage.setItem(`esportbos_moral_${email}`, '70');
    }
    if (localStorage.getItem(`esportbos_first_match_${email}`) === null) {
        localStorage.setItem(`esportbos_first_match_${email}`, 'true');
    }
    
    // Data match dummy jika belum ada
    if (localStorage.getItem(`esportbos_last_match_${email}`) === null) {
        const clubName = localStorage.getItem(`esportbos_club_name_${email}`) || 'My Club';
        const dummyLastMatch = {
            home: 'Modena',
            homeScore: 8,
            awayScore: 1,
            away: clubName,
            league: 'Liga Nasional',
            time: '11 Jam lalu'
        };
        localStorage.setItem(`esportbos_last_match_${email}`, JSON.stringify(dummyLastMatch));
    }
    
    if (localStorage.getItem(`esportbos_next_match_${email}`) === null) {
        const clubName = localStorage.getItem(`esportbos_club_name_${email}`) || 'My Club';
        const dummyNextMatch = {
            home: clubName,
            away: 'Inter FC',
            league: 'Liga Nasional',
            time: '12 Jam'
        };
        localStorage.setItem(`esportbos_next_match_${email}`, JSON.stringify(dummyNextMatch));
    }
}

// Fungsi Logout
function handleLogout() {
    localStorage.removeItem('esportbos_current_user');
    alert('👋 Berhasil logout!');
    window.location.href = 'index.html';
}

// Fungsi untuk cek apakah user sudah login
function checkAuth() {
    const currentUser = localStorage.getItem('esportbos_current_user');
    return currentUser !== null;
}

// Auto-load saat halaman dimuat
document.addEventListener('DOMContentLoaded', function() {
    // Cek apakah ada fungsi showLogin/showRegister di halaman
    if (document.getElementById('login') && document.getElementById('register')) {
        // Default tampilkan login
        showLogin();
    }
});

// Export fungsi untuk digunakan di halaman lain
window.EsportBosAuth = {
    login: handleLogin,
    register: handleRegister,
    logout: handleLogout,
    checkAuth: checkAuth,
    logoutUser: handleLogout
};
