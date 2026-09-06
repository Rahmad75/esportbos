// ===== ESPORTBOS - AUTH & ADMIN SYSTEM =====

// DAFTAR EMAIL OWNER (Gak case-sensitive)
const ADMIN_EMAILS = [
    'muhammadgazali75@gmail.com',
    'angriyani1977@gmail.com',
    'm.gazali1975@gmail.com'
];

let currentUser = null;

function register(username, email, password) {
    const users = JSON.parse(localStorage.getItem('esportbos_users') || '[]');
    
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
        alert('Email sudah terdaftar!');
        return false;
    }
    
    // Cek apakah email ini adalah admin
    const isAdmin = ADMIN_EMAILS.includes(email.toLowerCase());
    
    users.push({ 
        username, 
        email: email.toLowerCase(), 
        password, 
        role: isAdmin ? 'admin' : 'user',
        createdAt: new Date().toISOString()
    });
    localStorage.setItem('esportbos_users', JSON.stringify(users));
    
    alert(isAdmin ? '👑 Registrasi Owner berhasil! Silakan login.' : 'Registrasi berhasil! Silakan login.');
    showLogin();
    return true;
}

function login(email, password) {
    const users = JSON.parse(localStorage.getItem('esportbos_users') || '[]');
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
    
    if (!user) {
        alert('Email atau password salah!');
        return false;
    }
    
    currentUser = user;
    localStorage.setItem('esportbos_current_user', JSON.stringify(user));
    
    alert(`Login berhasil! Selamat datang, ${user.role === 'admin' ? '👑 OWNER' : ''} ${user.username}!`);
    
    // Redirect khusus untuk admin
    if (user.role === 'admin') {
        window.location.href = 'admin.html';
    } else {
        window.location.href = 'dashboard.html';
    }
    return true;
}

function logout() {
    localStorage.removeItem('esportbos_current_user');
    currentUser = null;
    window.location.href = 'index.html';
}

function checkAuth() {
    const savedUser = localStorage.getItem('esportbos_current_user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        return true;
    }
    return false;
}

function requireAuth() {
    if (!checkAuth()) {
        alert('Silakan login terlebih dahulu!');
        window.location.href = 'index.html';
        return false;
    }
    return true;
}

function requireAdmin() {
    if (!checkAuth() || currentUser.role !== 'admin') {
        alert('🚫 AKSES DITOLAK! Halaman ini khusus untuk Owner.');
        window.location.href = 'dashboard.html';
        return false;
    }
    return true;
}

function showRegister() {
    const loginDiv = document.getElementById('login');
    const registerDiv = document.getElementById('register');
    if (loginDiv && registerDiv) {
        loginDiv.style.display = 'none';
        registerDiv.style.display = 'block';
    }
}

function showLogin() {
    const loginDiv = document.getElementById('login');
    const registerDiv = document.getElementById('register');
    if (loginDiv && registerDiv) {
        registerDiv.style.display = 'none';
        loginDiv.style.display = 'block';
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            login(email, password);
        });
    }

    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const username = document.getElementById('registerUsername').value;
            const email = document.getElementById('registerEmail').value;
            const password = document.getElementById('registerPassword').value;
            register(username, email, password);
        });
    }

    // Auto redirect jika sudah login
    if (checkAuth()) {
        if (currentUser.role === 'admin' && window.location.pathname.includes('index.html')) {
            window.location.href = 'admin.html';
        }
    }
});

window.EsportBosAuth = {
    register, login, logout, checkAuth, requireAuth, requireAdmin, showRegister, showLogin
};
