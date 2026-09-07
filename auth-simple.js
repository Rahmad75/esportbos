// ===== ESPORTBOS - AUTH, REFERRAL & AUCTION SYSTEM =====

// DAFTAR EMAIL OWNER
const ADMIN_EMAILS = [
    'muhammadgazali75@gmail.com',
    'angriyani1977@gmail.com',
    'm.gazali1975@gmail.com'
];

// KONFIGURASI REFERRAL
const REFERRAL_BONUS_GIVER = 2000;
const REFERRAL_BONUS_RECEIVER = 1000;

// KONFIGURASI LELANG REFERRAL
const AUCTION_START_BID = 5000;
const AUCTION_DURATION_DAYS = 30;

let currentUser = null;

// Generate kode referral unik
function generateReferralCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'REF-';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function generateAvatarSeed() {
    return 'user_' + Math.random().toString(36).substring(2, 10);
}

// Ambil kode referral dari URL (?ref=CODE)
function getReferralFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('ref');
}

function register(username, email, password, referralCode = '') {
    const users = JSON.parse(localStorage.getItem('esportbos_users') || '[]');
    
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
        alert('❌ Email sudah terdaftar!');
        return false;
    }
    // Saat user register, inisialisasi saldo
function initializeBalances(email) {
    // Cek apakah sudah ada, kalau belum buat baru
    if (!localStorage.getItem(`esportbos_diamonds_${email}`)) {
        localStorage.setItem(`esportbos_diamonds_${email}`, '0');
    }
    if (!localStorage.getItem(`esportbos_currency_${email}`)) {
        localStorage.setItem(`esportbos_currency_${email}`, '1000'); // Bonus awal 1000 Currency
    }
    // Gold udah ada di 'esportbos_team_funds'
}
    const isAdmin = ADMIN_EMAILS.includes(email.toLowerCase());
    const newCode = generateReferralCode();
    const avatarSeed = generateAvatarSeed();
    
    const newUser = { 
        username, 
        email: email.toLowerCase(), 
        password, 
        role: isAdmin ? 'admin' : 'user',
        referralCode: newCode,
        referredBy: null,
        avatarSeed: avatarSeed,
        createdAt: new Date().toISOString()
    };
    
    // Cek apakah ada kode referral (dari URL atau input manual)
    const urlRef = getReferralFromURL();
    const finalRefCode = referralCode || urlRef;
    
    if (finalRefCode && finalRefCode.trim() !== '') {
        const referrer = users.find(u => u.referralCode === finalRefCode.trim().toUpperCase());
        if (referrer) {
            newUser.referredBy = referrer.email;
            
            // Bonus untuk referrer
            const referrerFunds = parseInt(localStorage.getItem(`esportbos_funds_${referrer.email}`) || '10000');
            localStorage.setItem(`esportbos_funds_${referrer.email}`, (referrerFunds + REFERRAL_BONUS_GIVER).toString());
            
            // Catat referral
            if (!referrer.referrals) referrer.referrals = [];
            referrer.referrals.push({ 
                email: email.toLowerCase(), 
                date: new Date().toISOString(),
                type: 'direct'
            });
            
            const refIndex = users.findIndex(u => u.email === referrer.email);
            users[refIndex] = referrer;
            
            alert(`✅ Registrasi berhasil! Kamu dapat bonus ${REFERRAL_BONUS_RECEIVER} Gold dari referral ${referrer.username}!`);
        } else {
            alert('⚠️ Kode referral tidak valid, registrasi tetap berhasil tanpa bonus.');
        }
    } else {
        // TIDAK ADA REFERRAL → Masuk ke pool lelang
        newUser.needsAuction = true;
        addToAuctionPool(newUser.email);
        alert('✅ Registrasi berhasil! Kamu akan masuk ke pool lelang referral bulanan.');
    }
    
    users.push(newUser);
    localStorage.setItem('esportbos_users', JSON.stringify(users));
    
    // Inisialisasi dana klub
    let initialFunds = 10000;
    if (newUser.referredBy) initialFunds += REFERRAL_BONUS_RECEIVER;
    localStorage.setItem(`esportbos_funds_${newUser.email}`, initialFunds.toString());
    
    alert(isAdmin ? '👑 Registrasi Owner berhasil! Silakan login.' : `Registrasi berhasil! Dana awal: ${initialFunds.toLocaleString()} Gold`);
    showLogin();
    return true;
}

// ===== SISTEM LELANG REFERRAL =====

function addToAuctionPool(email) {
    let pool = JSON.parse(localStorage.getItem('esportbos_auction_pool') || '[]');
    pool.push({ email, date: new Date().toISOString() });
    localStorage.setItem('esportbos_auction_pool', JSON.stringify(pool));
}

function placeAuctionBid(amount) {
    if (!currentUser) return false;
    
    const funds = parseInt(localStorage.getItem(`esportbos_funds_${currentUser.email}`) || '10000');
    if (funds < amount) {
        alert('❌ Dana tidak cukup untuk bid!');
        return false;
    }
    
    let auction = JSON.parse(localStorage.getItem('esportbos_referral_auction') || '{}');
    
    // Cek apakah user sudah bid sebelumnya
    if (auction.highestBidder === currentUser.email && auction.highestBid >= amount) {
        alert('❌ Kamu sudah jadi pemenang dengan bid lebih tinggi!');
        return false;
    }
    
    // Kurangi dana
    localStorage.setItem(`esportbos_funds_${currentUser.email}`, (funds - amount).toString());
    
    // Update auction
    auction = {
        highestBidder: currentUser.email,
        highestBid: amount,
        startTime: auction.startTime || new Date().toISOString(),
        endTime: new Date(Date.now() + AUCTION_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString()
    };
    
    localStorage.setItem('esportbos_referral_auction', JSON.stringify(auction));
    return true;
}

function getAuctionInfo() {
    const auction = JSON.parse(localStorage.getItem('esportbos_referral_auction') || '{}');
    const pool = JSON.parse(localStorage.getItem('esportbos_auction_pool') || '[]');
    
    return {
        highestBidder: auction.highestBidder || null,
        highestBid: auction.highestBid || 0,
        endTime: auction.endTime || null,
        poolCount: pool.length,
        pool: pool
    };
}

function claimAuctionReferrals() {
    if (!currentUser) return { claimed: 0, bonus: 0 };
    
    const auction = JSON.parse(localStorage.getItem('esportbos_referral_auction') || '{}');
    if (auction.highestBidder !== currentUser.email) {
        alert('❌ Kamu bukan pemenang lelang!');
        return { claimed: 0, bonus: 0 };
    }
    
    const pool = JSON.parse(localStorage.getItem('esportbos_auction_pool') || '[]');
    if (pool.length === 0) {
        alert('⚠️ Tidak ada user di pool lelang!');
        return { claimed: 0, bonus: 0 };
    }
    
    const users = JSON.parse(localStorage.getItem('esportbos_users') || '[]');
    const userIndex = users.findIndex(u => u.email === currentUser.email);
    
    let claimed = 0;
    let bonus = 0;
    
    pool.forEach(p => {
        const pIndex = users.findIndex(u => u.email === p.email);
        if (pIndex !== -1) {
            users[pIndex].referredBy = currentUser.email;
            users[pIndex].needsAuction = false;
            
            if (!users[userIndex].referrals) users[userIndex].referrals = [];
            users[userIndex].referrals.push({
                email: p.email,
                date: p.date,
                type: 'auction'
            });
            
            claimed++;
            bonus += REFERRAL_BONUS_GIVER;
        }
    });
    
    // Tambah bonus ke dana
    const funds = parseInt(localStorage.getItem(`esportbos_funds_${currentUser.email}`) || '10000');
    localStorage.setItem(`esportbos_funds_${currentUser.email}`, (funds + bonus).toString());
    
    // Reset pool
    localStorage.setItem('esportbos_auction_pool', '[]');
    localStorage.setItem('esportbos_users', JSON.stringify(users));
    
    return { claimed, bonus };
}

function login(email, password) {
    const users = JSON.parse(localStorage.getItem('esportbos_users') || '[]');
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
    
    if (!user) {
        alert('❌ Email atau password salah!');
        return false;
    }
    
    currentUser = user;
    localStorage.setItem('esportbos_current_user', JSON.stringify(user));
    
    if (!localStorage.getItem(`esportbos_funds_${user.email}`)) {
        localStorage.setItem(`esportbos_funds_${user.email}`, '10000');
    }
    localStorage.setItem('esportbos_team_funds', localStorage.getItem(`esportbos_funds_${user.email}`));
    
    alert(`Login berhasil! Selamat datang, ${user.role === 'admin' ? '👑 OWNER ' : ''}${user.username}!`);
    
    if (user.role === 'admin') {
        window.location.href = 'admin.html';
    } else {
        window.location.href = 'dashboard.html';
    }
    return true;
}

function updateProfile(updates) {
    if (!currentUser) return false;
    
    const users = JSON.parse(localStorage.getItem('esportbos_users') || '[]');
    const userIndex = users.findIndex(u => u.email === currentUser.email);
    
    if (userIndex === -1) return false;
    
    Object.keys(updates).forEach(key => {
        users[userIndex][key] = updates[key];
        currentUser[key] = updates[key];
    });
    
    localStorage.setItem('esportbos_users', JSON.stringify(users));
    localStorage.setItem('esportbos_current_user', JSON.stringify(currentUser));
    return true;
}

function changePassword(oldPassword, newPassword) {
    if (!currentUser) return false;
    if (currentUser.password !== oldPassword) {
        alert('❌ Password lama salah!');
        return false;
    }
    if (newPassword.length < 6) {
        alert('❌ Password minimal 6 karakter!');
        return false;
    }
    return updateProfile({ password: newPassword });
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

function getReferralStats() {
    if (!currentUser) return { count: 0, totalBonus: 0, direct: 0, auction: 0 };
    const users = JSON.parse(localStorage.getItem('esportbos_users') || '[]');
    const user = users.find(u => u.email === currentUser.email);
    const referrals = user?.referrals || [];
    
    const direct = referrals.filter(r => r.type === 'direct').length;
    const auction = referrals.filter(r => r.type === 'auction').length;
    
    return {
        count: referrals.length,
        totalBonus: referrals.length * REFERRAL_BONUS_GIVER,
        direct,
        auction
    };
}

function showRegister() {
    const loginDiv = document.getElementById('login');
    const registerDiv = document.getElementById('register');
    if (loginDiv && registerDiv) {
        loginDiv.style.display = 'none';
        registerDiv.style.display = 'block';
        
        // Auto-fill referral code dari URL
        const urlRef = getReferralFromURL();
        if (urlRef) {
            const refInput = document.getElementById('registerReferral');
            if (refInput) {
                refInput.value = urlRef;
                refInput.style.background = '#e8f5e9';
                refInput.style.borderColor = '#28a745';
            }
        }
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
            const referralCode = document.getElementById('registerReferral')?.value || '';
            register(username, email, password, referralCode);
        });
    }

    // Cek referral dari URL saat halaman load
    const urlRef = getReferralFromURL();
    if (urlRef) {
        showRegister();
    }

    if (checkAuth()) {
        if (currentUser.role === 'admin' && window.location.pathname.includes('index.html')) {
            window.location.href = 'admin.html';
        }
    }
});

window.EsportBosAuth = {
    register, login, logout, checkAuth, requireAuth, requireAdmin,
    updateProfile, changePassword, getReferralStats, showRegister, showLogin,
    placeAuctionBid, getAuctionInfo, claimAuctionReferrals
};
