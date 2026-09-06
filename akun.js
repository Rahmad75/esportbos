// ===== ESPORTBOS - HALAMAN AKUN =====

document.addEventListener('DOMContentLoaded', function() {
    if (typeof EsportBosAuth !== 'undefined') {
        EsportBosAuth.requireAuth();
        const user = JSON.parse(localStorage.getItem('esportbos_current_user'));
        if (user) {
            document.getElementById('userName').textContent = user.username;
            document.getElementById('profileUsername').textContent = user.username;
            document.getElementById('profileEmail').textContent = user.email;
            document.getElementById('profileRole').textContent = user.role === 'admin' ? '👑 OWNER' : 'User';
            document.getElementById('profileJoinDate').textContent = user.createdAt ? new Date(user.createdAt).toLocaleDateString('id-ID') : 'N/A';
            
            // Load foto profil
            const savedPhoto = localStorage.getItem('esportbos_profile_photo_' + user.email);
            if (savedPhoto) {
                document.getElementById('profilePhoto').src = savedPhoto;
                document.getElementById('navProfilePic').src = savedPhoto;
            }
            
            // Generate referral code jika belum ada
            generateReferralCode(user);
            renderReferralStats(user);
        }
    }
    
    updateFundsDisplay();
});

function updateFundsDisplay() {
    const funds = parseInt(localStorage.getItem('esportbos_team_funds') || '10000');
    const display = document.getElementById('teamFundsDisplay');
    if (display) display.textContent = funds.toLocaleString();
}

// Upload Foto Profil
function uploadPhoto(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (file.size > 2 * 1024 * 1024) {
        alert('❌ Ukuran file terlalu besar! Maksimal 2MB.');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const photoData = e.target.result;
        const user = JSON.parse(localStorage.getItem('esportbos_current_user'));
        
        // Simpan foto
        localStorage.setItem('esportbos_profile_photo_' + user.email, photoData);
        
        // Update tampilan
        document.getElementById('profilePhoto').src = photoData;
        document.getElementById('navProfilePic').src = photoData;
        
        alert('✅ Foto profil berhasil diupdate!');
    };
    reader.readAsDataURL(file);
}

// Generate Referral Code
function generateReferralCode(user) {
    let referralData = JSON.parse(localStorage.getItem('esportbos_referrals') || '{}');
    
    if (!referralData[user.email]) {
        // Generate kode unik dari username
        const code = 'ESB-' + user.username.toUpperCase().substring(0, 4) + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
        referralData[user.email] = {
            code: code,
            referrals: [],
            bonus: 0
        };
        localStorage.setItem('esportbos_referrals', JSON.stringify(referralData));
    }
    
    document.getElementById('referralCode').textContent = referralData[user.email].code;
}

function copyReferralCode() {
    const code = document.getElementById('referralCode').textContent;
    navigator.clipboard.writeText(code).then(() => {
        alert('✅ Kode referral disalin: ' + code);
    }).catch(() => {
        // Fallback untuk browser lama
        const textArea = document.createElement('textarea');
        textArea.value = code;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        alert('✅ Kode referral disalin: ' + code);
    });
}

function renderReferralStats(user) {
    const referralData = JSON.parse(localStorage.getItem('esportbos_referrals') || '{}');
    const myReferral = referralData[user.email];
    
    if (myReferral) {
        document.getElementById('totalReferrals').textContent = myReferral.referrals.length;
        document.getElementById('referralBonus').textContent = myReferral.bonus.toLocaleString() + ' Gold';
        
        const list = document.getElementById('referralList');
        if (myReferral.referrals.length === 0) {
            list.innerHTML = '<p style="color:#999; text-align:center;">Belum ada referral.</p>';
        } else {
            list.innerHTML = myReferral.referrals.map(r => `
                <div class="referral-item">
                    <span>${r.username}</span>
                    <span class="referral-date">${r.date}</span>
                    <span class="referral-bonus">+500 Gold</span>
                </div>
            `).join('');
        }
    }
}

// Fungsi untuk dipanggil saat user baru register dengan referral code
window.applyReferralCode = function(referralCode, newUserEmail) {
    const referralData = JSON.parse(localStorage.getItem('esportbos_referrals') || '{}');
    
    // Cari pemilik kode referral
    let referrerEmail = null;
    for (let email in referralData) {
        if (referralData[email].code === referralCode) {
            referrerEmail = email;
            break;
        }
    }
    
    if (!referrerEmail) {
        return { success: false, message: 'Kode referral tidak valid!' };
    }
    
    if (referrerEmail === newUserEmail) {
        return { success: false, message: 'Tidak bisa menggunakan kode referral sendiri!' };
    }
    
    // Tambah referral
    const newUser = JSON.parse(localStorage.getItem('esportbos_current_user'));
    referralData[referrerEmail].referrals.push({
        email: newUserEmail,
        username: newUser.username,
        date: new Date().toLocaleDateString('id-ID')
    });
    referralData[referrerEmail].bonus += 500;
    
    localStorage.setItem('esportbos_referrals', JSON.stringify(referralData));
    
    // Tambah bonus gold ke referrer
    const currentFunds = parseInt(localStorage.getItem('esportbos_team_funds') || '10000');
    localStorage.setItem('esportbos_team_funds', (currentFunds + 500).toString());
    
    return { success: true, message: 'Referral berhasil! Referrer mendapat 500 Gold bonus!' };
};

// Reset Functions
function resetData(key) {
    if (!confirm(`⚠️ Yakin ingin mereset ${key}?`)) return;
    localStorage.removeItem(key);
    alert(`✅ Data ${key} berhasil direset!`);
}

function resetEconomy() {
    if (!confirm('⚠️ Yakin ingin mereset dana klub ke 10.000 Gold?')) return;
    localStorage.setItem('esportbos_team_funds', '10000');
    updateFundsDisplay();
    alert('✅ Ekonomi berhasil direset!');
}

function factoryReset() {
    const confirmText = prompt('⚠️ PERINGATAN! Ketik "RESET SEMUA" untuk melanjutkan.');
    if (confirmText === 'RESET SEMUA') {
        // Simpan data user & referral
        const users = localStorage.getItem('esportbos_users');
        const currentUser = localStorage.getItem('esportbos_current_user');
        const referrals = localStorage.getItem('esportbos_referrals');
        const profilePhotos = {};
        
        // Simpan foto profil
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('esportbos_profile_photo_')) {
                profilePhotos[key] = localStorage.getItem(key);
            }
        }
        
        // Clear semua
        localStorage.clear();
        
        // Restore data user
        if (users) localStorage.setItem('esportbos_users', users);
        if (currentUser) localStorage.setItem('esportbos_current_user', currentUser);
        if (referrals) localStorage.setItem('esportbos_referrals', referrals);
        
        // Restore foto profil
        for (let key in profilePhotos) {
            localStorage.setItem(key, profilePhotos[key]);
        }
        
        // Reset dana klub
        localStorage.setItem('esportbos_team_funds', '10000');
        
        alert(' Factory reset berhasil! Semua data game telah direset.');
        location.reload();
    } else {
        alert('❌ Reset dibatalkan.');
    }
}

function switchAkunTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(`tab-${tabName}`).style.display = 'block';
    event.target.classList.add('active');
}
// ===== LELANG REFERRAL =====

function loadAuction() {
    const auctionInfo = EsportBosAuth.getAuctionInfo();
    const infoContainer = document.getElementById('auctionInfo');
    const actionsContainer = document.getElementById('auctionActions');
    const poolContainer = document.getElementById('auctionPool');
    
    if (!infoContainer) return;
    
    // Render info lelang
    if (auctionInfo.highestBidder) {
        const users = JSON.parse(localStorage.getItem('esportbos_users') || '[]');
        const winner = users.find(u => u.email === auctionInfo.highestBidder);
        const isWinner = winner?.email === currentUser.email;
        const timeLeft = auctionInfo.endTime ? getTimeLeft(auctionInfo.endTime) : 'Tidak diketahui';
        
        infoContainer.innerHTML = `
            <div class="auction-status ${isWinner ? 'winning' : 'losing'}">
                <div class="auction-winner">
                    <span class="winner-label">Pemenang Saat Ini:</span>
                    <span class="winner-name">${winner?.username || 'Unknown'} ${isWinner ? '👑 (KAMU!)' : ''}</span>
                </div>
                <div class="auction-bid">
                    <span class="bid-label">Bid Tertinggi:</span>
                    <span class="bid-value">${auctionInfo.highestBid.toLocaleString()} Gold</span>
                </div>
                <div class="auction-timer">
                    <span class="timer-label">Berakhir Dalam:</span>
                    <span class="timer-value">${timeLeft}</span>
                </div>
                <div class="auction-pool-count">
                    <span class="pool-label">User di Pool:</span>
                    <span class="pool-value">${auctionInfo.poolCount} orang</span>
                </div>
            </div>
        `;
    } else {
        infoContainer.innerHTML = `
            <div class="auction-status empty">
                <p>🏁 Belum ada yang bid. Jadilah yang pertama!</p>
                <p class="info-text">User di pool lelang: <strong>${auctionInfo.poolCount} orang</strong></p>
            </div>
        `;
    }
    
    // Render actions
    const funds = parseInt(localStorage.getItem('esportbos_team_funds') || '10000');
    const minBid = auctionInfo.highestBid > 0 ? auctionInfo.highestBid + 1000 : AUCTION_START_BID;
    const isWinner = auctionInfo.highestBidder === currentUser.email;
    
    actionsContainer.innerHTML = `
        <div class="auction-bid-form">
            <div class="bid-input-group">
                <label>Minimum Bid: <strong>${minBid.toLocaleString()} Gold</strong></label>
                <input type="number" id="bidAmount" min="${minBid}" value="${minBid}" step="1000">
                <button class="btn-futuristic" onclick="submitBid(${minBid})" ${isWinner ? 'disabled' : ''}>
                    ${isWinner ? '👑 Kamu Pemenang' : '🔨 Bid Sekarang'}
                </button>
            </div>
            ${isWinner && auctionInfo.poolCount > 0 ? `
                <button class="btn-claim" onclick="claimAuction()">🎁 Klaim ${auctionInfo.poolCount} Referral!</button>
            ` : ''}
        </div>
    `;
    
    // Render pool
    if (auctionInfo.poolCount > 0) {
        poolContainer.innerHTML = `
            <h4 style="margin-top: 20px;"> User dalam Pool Lelang:</h4>
            <div class="auction-pool-list">
                ${auctionInfo.pool.slice(0, 10).map(p => `
                    <div class="pool-item">
                        <span class="pool-email">${p.email}</span>
                        <span class="pool-date">${new Date(p.date).toLocaleDateString('id-ID')}</span>
                    </div>
                `).join('')}
                ${auctionInfo.poolCount > 10 ? `<p style="text-align:center; color:#999;">...dan ${auctionInfo.poolCount - 10} lainnya</p>` : ''}
            </div>
        `;
    } else {
        poolContainer.innerHTML = '<p style="text-align:center; color:#999; margin-top:20px;">Pool lelang kosong. Belum ada user baru tanpa referral.</p>';
    }
}

function submitBid(minBid) {
    const input = document.getElementById('bidAmount');
    const amount = parseInt(input.value);
    
    if (!amount || amount < minBid) {
        alert(`❌ Bid minimal ${minBid.toLocaleString()} Gold!`);
        return;
    }
    
    if (!confirm(`Yakin bid ${amount.toLocaleString()} Gold untuk lelang referral?`)) return;
    
    const success = EsportBosAuth.placeAuctionBid(amount);
    
    if (success) {
        alert(`✅ Bid ${amount.toLocaleString()} Gold berhasil! Kamu sekarang jadi pemenang lelang.`);
        updateFundsDisplay();
        loadAuction();
    }
}

function claimAuction() {
    if (!confirm('Yakin mau klaim semua user di pool lelang sebagai referral kamu?')) return;
    
    const result = EsportBosAuth.claimAuctionReferrals();
    
    if (result.claimed > 0) {
        alert(`🎉 Berhasil klaim ${result.claimed} referral! Bonus: +${result.bonus.toLocaleString()} Gold`);
        updateFundsDisplay();
        loadReferral();
        loadAuction();
    }
}

function getTimeLeft(endTime) {
    const end = new Date(endTime).getTime();
    const now = Date.now();
    const diff = end - now;
    
    if (diff <= 0) return 'Sudah berakhir';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    return `${days} hari ${hours} jam`;
}

// Update loadReferral untuk include auction stats
const originalLoadReferral = loadReferral;
loadReferral = function() {
    const user = JSON.parse(localStorage.getItem('esportbos_current_user'));
    if (!user) return;
    
    const code = user.referralCode || '-';
    document.getElementById('myReferralCode').textContent = code;
    
    const baseUrl = window.location.origin + window.location.pathname.replace('akun.html', 'index.html');
    const link = `${baseUrl}?ref=${code}`;
    document.getElementById('referralLink').value = link;
    
    const stats = EsportBosAuth.getReferralStats();
    document.getElementById('referralCount').textContent = stats.count;
    document.getElementById('referralDirect').textContent = stats.direct;
    document.getElementById('referralAuction').textContent = stats.auction;
    document.getElementById('referralBonus').textContent = stats.totalBonus.toLocaleString() + ' Gold';
    
    const users = JSON.parse(localStorage.getItem('esportbos_users') || '[]');
    const currentUserData = users.find(u => u.email === user.email);
    const referrals = currentUserData?.referrals || [];
    
    const listContainer = document.getElementById('referralList');
    if (referrals.length === 0) {
        listContainer.innerHTML = '<p style="text-align:center; color:#999; margin-top: 20px;">Belum ada teman yang daftar pakai kode referral kamu. Yuk share!</p>';
    } else {
        listContainer.innerHTML = `
            <h4 style="margin-top: 30px;">📋 Daftar Teman yang Direfer:</h4>
            <div class="referral-list-items">
                ${referrals.map(r => `
                    <div class="referral-item">
                        <span class="referral-email">${r.email}</span>
                        <span class="referral-date">${new Date(r.date).toLocaleDateString('id-ID')}</span>
                        <span class="referral-type">${r.type === 'direct' ? '🔗 Link' : '🏆 Lelang'}</span>
                        <span class="referral-bonus">+2,000 G</span>
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    // Load auction juga
    loadAuction();
};
