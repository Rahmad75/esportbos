
// ===== ESPORTBOS - SIMPLE AUTH (LOCALSTORAGE) =====

// Simpan user yang udah login
let currentUser = null;

// Register
function register(username, email, password) {
    // Cek apakah user udah ada
    const users = JSON.parse(localStorage.getItem('esportbos_users') || '[]');
    
    if (users.find(u => u.email === email)) {
        alert('Email sudah terdaftar!');
        return false;
    }
    
    // Simpan user baru
    users.push({ username, email, password });
    localStorage.setItem('esportbos_users', JSON.stringify(users));
    
    alert('Registrasi berhasil! Silakan login.');
    showLogin();
    return true;
}

// Login
function login(email, password) {
    const users = JSON.parse(localStorage.getItem('esportbos_users') || '[]');
    const user = users.find(u => u.email === email && u.password === password);
    
    if (!user) {
        alert('Email atau password salah!');
        return false;
    }
    
    // Simpan session
    currentUser = user;
    localStorage.setItem('esportbos_current_user', JSON.stringify(user));
    
    alert('Login berhasil! Selamat datang, ' + user.username + '!');
    window.location.href = 'dashboard.html';
    return true;
}

// Logout
function logout() {
    localStorage.removeItem('esportbos_current_user');
    currentUser = null;
    window.location.href = 'index.html';
}

// Cek apakah sudah login
function checkAuth() {
    const savedUser = localStorage.getItem('esportbos_current_user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        return true;
    }
    return false;
}

// Protect halaman
function requireAuth() {
    if (!checkAuth()) {
        alert('Silakan login terlebih dahulu!');
        window.location.href = 'index.html';
        return false;
    }
    return true;
}

// Show/Hide forms
function showRegister() {
    document.getElementById('login').style.display = 'none';
    document.getElementById('register').style.display = 'block';
}

function showLogin() {
    document.getElementById('register').style.display = 'none';
    document.getElementById('login').style.display = 'block';
}

// Event Listeners
document.addEventListener('DOMContentLoaded', function() {
    // Form Login
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            login(email, password);
        });
    }

    // Form Register
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

    // Auto-check auth di dashboard
    const dashboardBody = document.querySelector('.dashboard-body');
    if (dashboardBody) {
        requireAuth();
        
        // Tampilkan nama user
        if (currentUser) {
            const userNameSpan = document.getElementById('userName');
            if (userNameSpan) {
                userNameSpan.textContent = currentUser.username;
            }
        }
    }
});

// Expose ke window
window.EsportBosAuth = {
    register,
    login,
    logout,
    checkAuth,
    requireAuth,
    showRegister,
    showLogin
};
