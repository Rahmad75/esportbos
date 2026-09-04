// ===== ESPORTBOS - SIMPLE AUTH (LOCALSTORAGE) =====

let currentUser = null;

function register(username, email, password) {
    const users = JSON.parse(localStorage.getItem('esportbos_users') || '[]');
    
    if (users.find(u => u.email === email)) {
        alert('Email sudah terdaftar!');
        return false;
    }
    
    users.push({ username, email, password });
    localStorage.setItem('esportbos_users', JSON.stringify(users));
    
    alert('Registrasi berhasil! Silakan login.');
    showLogin();
    return true;
}

function login(email, password) {
    const users = JSON.parse(localStorage.getItem('esportbos_users') || '[]');
    const user = users.find(u => u.email === email && u.password === password);
    
    if (!user) {
        alert('Email atau password salah!');
        return false;
    }
    
    currentUser = user;
    localStorage.setItem('esportbos_current_user', JSON.stringify(user));
    
    alert('Login berhasil! Selamat datang, ' + user.username + '!');
    window.location.href = 'dashboard.html';
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

    const dashboardBody = document.querySelector('.dashboard-body');
    if (dashboardBody) {
        requireAuth();
        
        if (currentUser) {
            const userNameSpan = document.getElementById('userName');
            if (userNameSpan) {
                userNameSpan.textContent = currentUser.username;
            }
        }
    }
});

window.EsportBosAuth = {
    register,
    login,
    logout,
    checkAuth,
    requireAuth,
    showRegister,
    showLogin
};
