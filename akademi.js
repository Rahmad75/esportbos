// ===== ESPORTBOS - AKADEMI MUDA =====

// Academy levels config
const academyLevels = {
    1: { scoutCost: 500, quality: 'Basic', maxPotential: 75, upgradeCost: 5000 },
    2: { scoutCost: 800, quality: 'Advanced', maxPotential: 85, upgradeCost: 10000 },
    3: { scoutCost: 1200, quality: 'Expert', maxPotential: 90, upgradeCost: 20000 },
    4: { scoutCost: 1800, quality: 'Master', maxPotential: 95, upgradeCost: 40000 },
    5: { scoutCost: 2500, quality: 'Legendary', maxPotential: 99, upgradeCost: null }
};

// First names & last names untuk generate nama random
const firstNames = ['Rizky', 'Dimas', 'Fajar', 'Bayu', 'Andi', 'Budi', 'Rudi', 'Agus', 'Yoga', 'Irfan', 'Raka', 'Gilang', 'Aldi', 'Fikri', 'Rian'];
const lastNames = ['Pratama', 'Wibowo', 'Saputra', 'Hidayat', 'Nugroho', 'Susanto', 'Wijaya', 'Kurniawan', 'Setiawan', 'Purnama', 'Ramadhan', 'Firmansyah', 'Maulana', 'Santoso', 'Permana'];

// Load academy data
function loadAcademyData() {
    const saved = localStorage.getItem('esportbos_academy');
    if (saved) {
        return JSON.parse(saved);
    }
    return {
        level: 1,
        scoutedPlayers: [],
        history: []
    };
}

function saveAcademyData(data) {
    localStorage.setItem('esportbos_academy', JSON.stringify(data));
}

function getTeamFunds() {
    return parseInt(localStorage.getItem('esportbos_team_funds') || '10000');
}

function updateFundsDisplay() {
    const funds = getTeamFunds();
    const display = document.getElementById('teamFundsDisplay');
    if (display) display.textContent = funds.toLocaleString();
}

function getAvatarUrl(seed, index) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        hash = hash & hash;
    }
    const photoNum = Math.abs(hash) % 100;
    return `https://randomuser.me/api/portraits/men/${photoNum}.jpg`;
}

// Generate random young player
function generateYoungPlayer(academyLevel) {
    const config = academyLevels[academyLevel];
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const nama = `${firstName} ${lastName}`;
    
    const positions = ['Top', 'Jungle', 'Mid', 'ADC', 'Support'];
    const roles = ['Carry', 'Tank', 'Support', 'Fighter', 'Mage'];
    const posisi = positions[Math.floor(Math.random() * positions.length)];
    const role = roles[Math.floor(Math.random() * roles.length)];
    
    // Age 16-19
    const umur = Math.floor(Math.random() * 4) + 16;
    
    // Stats dasar (40-60)
    const baseStats = 40 + Math.floor(Math.random() * 20);
    
    // Potential (lebih tinggi dari stats, max sesuai level akademi)
    const potential = baseStats + Math.floor(Math.random() * (config.maxPotential - baseStats));
    
    const stats = {
        mechanics: baseStats + Math.floor(Math.random() * 10),
        gameSense: baseStats + Math.floor(Math.random() * 10),
        teamwork: baseStats + Math.floor(Math.random() * 10),
        stamina: baseStats + Math.floor(Math.random() * 15)
    };
    
    // Harga murah (500-2000)
    const harga = Math.floor(Math.random() * 1500) + 500;
    
    return {
        id: Date.now() + Math.random(),
        nama: nama,
        posisi: posisi,
        role: role,
        umur: umur,
        stats: stats,
        potential: potential,
        harga: harga,
        avatar: nama,
        avatarIndex: Math.floor(Math.random() * 100),
        scoutedAt: new Date().toLocaleDateString('id-ID')
    };
}

// Do scout
function doScout() {
    const academyData = loadAcademyData();
    const config = academyLevels[academyData.level];
    const funds = getTeamFunds();
    
    if (funds < config.scoutCost) {
        alert(`❌ Dana tidak cukup! Kamu butuh ${config.scoutCost.toLocaleString()} Gold untuk scout.`);
        return;
    }
    
    // Kurangi dana
    localStorage.setItem('esportbos_team_funds', (funds - config.scoutCost).toString());
    updateFundsDisplay();
    
    // Generate 3 pemain muda
    const newPlayers = [];
    for (let i = 0; i < 3; i++) {
        newPlayers.push(generateYoungPlayer(academyData.level));
    }
    
    // Tambah ke scouted players
    academyData.scoutedPlayers = [...newPlayers, ...academyData.scoutedPlayers];
    // Batasi 15 pemain di list
    if (academyData.scoutedPlayers.length > 15) {
        academyData.scoutedPlayers = academyData.scoutedPlayers.slice(0, 15);
    }
    
    saveAcademyData(academyData);
    renderScoutedPlayers();
    
    alert(`✅ Scout berhasil! Ditemukan ${newPlayers.length} pemain muda berbakat!`);
}

// Render scouted players
function renderScoutedPlayers() {
    const container = document.getElementById('scoutedPlayers');
    if (!container) return;
    
    const academyData = loadAcademyData();
    
    if (academyData.scoutedPlayers.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#999;">Belum ada pemain yang di-scout. Klik tombol di atas untuk mulai mencari!</p>';
        return;
    }
    
    container.innerHTML = `
        <div class="scouted-grid">
            ${academyData.scoutedPlayers.map(p => {
                const avgStats = Math.round((p.stats.mechanics + p.stats.gameSense + p.stats.teamwork + p.stats.stamina) / 4);
                const potentialColor = p.potential >= 90 ? '#ffd700' : p.potential >= 80 ? '#00d4ff' : '#28a745';
                
                return `
                    <div class="young-player-card">
                        <div class="player-header">
                            <img src="${getAvatarUrl(p.avatar, p.avatarIndex)}" class="young-avatar">
                            <div class="player-info">
                                <h4>${p.nama}</h4>
                                <p class="player-age">${p.umur} tahun • ${p.posisi}</p>
                                <div class="potential-badge" style="background: ${potentialColor};">
                                    ⭐ Potential: ${p.potential}
                                </div>
                            </div>
                        </div>
                        <div class="player-stats">
                            <div class="stat-item">
                                <span>MEC</span>
                                <strong>${p.stats.mechanics}</strong>
                            </div>
                            <div class="stat-item">
                                <span>GS</span>
                                <strong>${p.stats.gameSense}</strong>
                            </div>
                            <div class="stat-item">
                                <span>TW</span>
                                <strong>${p.stats.teamwork}</strong>
                            </div>
                            <div class="stat-item">
                                <span>STA</span>
                                <strong>${p.stats.stamina}</strong>
                            </div>
                        </div>
                        <div class="player-price">
                            💰 ${p.harga.toLocaleString()} Gold
                        </div>
                        <button class="btn-recruit" onclick="confirmRecruit(${p.id})">Rekrut Pemain</button>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// Confirm recruit
function confirmRecruit(playerId) {
    const academyData = loadAcademyData();
    const player = academyData.scoutedPlayers.find(p => p.id === playerId);
    if (!player) return;
    
    const funds = getTeamFunds();
    
    if (funds < player.harga) {
        alert(`❌ Dana tidak cukup! Kamu butuh ${player.harga.toLocaleString()} Gold.`);
        return;
    }
    
    const modal = document.getElementById('recruitModal');
    const body = document.getElementById('recruitModalBody');
    
    const potentialColor = player.potential >= 90 ? '#ffd700' : player.potential >= 80 ? '#00d4ff' : '#28a745';
    
    body.innerHTML = `
        <div class="recruit-confirm">
            <h3>Konfirmasi Rekrutmen</h3>
            <div class="confirm-player">
                <img src="${getAvatarUrl(player.avatar, player.avatarIndex)}" class="confirm-avatar">
                <div>
                    <h2>${player.nama}</h2>
                    <p>${player.umur} tahun • ${player.posisi} • ${player.role}</p>
                    <div class="potential-display" style="background: ${potentialColor};">
                        ⭐ Potential: ${player.potential}
                    </div>
                </div>
            </div>
            <div class="confirm-details">
                <div class="detail-row">
                    <span>Stats Saat Ini:</span>
                    <span>Avg ${Math.round((player.stats.mechanics + player.stats.gameSense + player.stats.teamwork + player.stats.stamina) / 4)}</span>
                </div>
                <div class="detail-row">
                    <span>Potensi Maksimal:</span>
                    <span class="price positive">${player.potential}</span>
                </div>
                <div class="detail-row">
                    <span>Biaya Rekrut:</span>
                    <span class="price">${player.harga.toLocaleString()} Gold</span>
                </div>
                <div class="detail-row">
                    <span>Sisa Dana:</span>
                    <span>${(funds - player.harga).toLocaleString()} Gold</span>
                </div>
            </div>
            <div class="confirm-actions">
                <button class="btn-cancel" onclick="closeRecruitModal()">Batal</button>
                <button class="btn-recruit" onclick="executeRecruit(${player.id})">✅ Ya, Rekrut!</button>
            </div>
        </div>
    `;
    
    modal.style.display = 'block';
}

// Execute recruit
function executeRecruit(playerId) {
    const academyData = loadAcademyData();
    const playerIndex = academyData.scoutedPlayers.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return;
    
    const player = academyData.scoutedPlayers[playerIndex];
    let funds = getTeamFunds();
    
    if (funds < player.harga) {
        alert('❌ Dana tidak cukup!');
        return;
    }
    
    // Kurangi dana
    funds -= player.harga;
    localStorage.setItem('esportbos_team_funds', funds.toString());
    
    // Tambah ke tim
    const myPlayers = JSON.parse(localStorage.getItem('esportbos_players') || '[]');
    const newId = myPlayers.length > 0 ? Math.max(...myPlayers.map(p => p.id)) + 1 : 1;
    myPlayers.push({
        ...player,
        id: newId,
        energy: 100
    });
    localStorage.setItem('esportbos_players', JSON.stringify(myPlayers));
    
    // Hapus dari scouted
    academyData.scoutedPlayers.splice(playerIndex, 1);
    
    // Tambah ke history
    academyData.history.unshift({
        nama: player.nama,
        posisi: player.posisi,
        potential: player.potential,
        harga: player.harga,
        date: new Date().toLocaleDateString('id-ID')
    });
    
    saveAcademyData(academyData);
    updateFundsDisplay();
    renderScoutedPlayers();
    renderAcademyHistory();
    
    closeRecruitModal();
    
    alert(`🎉 Selamat! ${player.nama} (Potential: ${player.potential}) resmi bergabung dengan akademi RRQ Hoshi!`);
}

// Upgrade academy
function upgradeAcademy() {
    const academyData = loadAcademyData();
    const currentLevel = academyData.level;
    
    if (currentLevel >= 5) {
        alert('🏆 Akademi sudah level maksimal!');
        return;
    }
    
    const nextLevel = currentLevel + 1;
    const config = academyLevels[currentLevel];
    const funds = getTeamFunds();
    
    if (funds < config.upgradeCost) {
        alert(`❌ Dana tidak cukup! Kamu butuh ${config.upgradeCost.toLocaleString()} Gold untuk upgrade.`);
        return;
    }
    
    if (!confirm(`Upgrade akademi ke Level ${nextLevel} dengan biaya ${config.upgradeCost.toLocaleString()} Gold?`)) {
        return;
    }
    
    // Kurangi dana
    localStorage.setItem('esportbos_team_funds', (funds - config.upgradeCost).toString());
    
    // Upgrade level
    academyData.level = nextLevel;
    saveAcademyData(academyData);
    
    updateFundsDisplay();
    renderAcademyInfo();
    
    alert(`🎓 Akademi berhasil di-upgrade ke Level ${nextLevel}! Kualitas scout meningkat!`);
}

// Render academy info
function renderAcademyInfo() {
    const academyData = loadAcademyData();
    const currentConfig = academyLevels[academyData.level];
    
    document.getElementById('academyLevel').textContent = academyData.level;
    document.getElementById('scoutCost').textContent = `${currentConfig.scoutCost.toLocaleString()} Gold`;
    document.getElementById('scoutQuality').textContent = currentConfig.quality;
    
    document.getElementById('currentLevel').textContent = academyData.level;
    document.getElementById('currentScoutCost').textContent = currentConfig.scoutCost.toLocaleString();
    document.getElementById('currentQuality').textContent = currentConfig.quality;
    document.getElementById('currentMaxPotential').textContent = currentConfig.maxPotential;
    
    if (academyData.level < 5) {
        const nextConfig = academyLevels[academyData.level + 1];
        document.getElementById('nextLevel').textContent = academyData.level + 1;
        document.getElementById('nextScoutCost').textContent = nextConfig.scoutCost.toLocaleString();
        document.getElementById('nextQuality').textContent = nextConfig.quality;
        document.getElementById('nextMaxPotential').textContent = nextConfig.maxPotential;
        document.getElementById('upgradeCost').textContent = currentConfig.upgradeCost.toLocaleString();
        document.getElementById('upgradeBtn').style.display = 'block';
    } else {
        document.getElementById('nextLevel').textContent = 'MAX';
        document.getElementById('upgradeBtn').style.display = 'none';
    }
}

// Render history
function renderAcademyHistory() {
    const container = document.getElementById('academyHistory');
    if (!container) return;
    
    const academyData = loadAcademyData();
    
    if (academyData.history.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#999;">Belum ada riwayat rekrutan.</p>';
        return;
    }
    
    container.innerHTML = academyData.history.map(h => {
        const potentialColor = h.potential >= 90 ? '#ffd700' : h.potential >= 80 ? '#00d4ff' : '#28a745';
        return `
            <div class="history-item-academy">
                <div class="history-info">
                    <strong>${h.nama}</strong>
                    <span class="history-pos">${h.posisi}</span>
                    <span class="history-date">${h.date}</span>
                </div>
                <div class="history-potential" style="background: ${potentialColor};">
                    ⭐ ${h.potential}
                </div>
                <div class="history-price">
                    💰 ${h.harga.toLocaleString()} Gold
                </div>
            </div>
        `;
    }).join('');
}

function closeRecruitModal() {
    document.getElementById('recruitModal').style.display = 'none';
}

function switchAkademiTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(`tab-${tabName}`).style.display = 'block';
    event.target.classList.add('active');
    
    if (tabName === 'scout') renderScoutedPlayers();
    if (tabName === 'academy') renderAcademyInfo();
    if (tabName === 'history') renderAcademyHistory();
}

// Init
document.addEventListener('DOMContentLoaded', function() {
    if (typeof EsportBosAuth !== 'undefined') {
        EsportBosAuth.requireAuth();
        const user = JSON.parse(localStorage.getItem('esportbos_current_user'));
        if (user) {
            const userNameSpan = document.getElementById('userName');
            if (userNameSpan) userNameSpan.textContent = user.username;
        }
    }
    
    updateFundsDisplay();
    renderAcademyInfo();
    renderScoutedPlayers();
    renderAcademyHistory();
    
    window.onclick = function(event) {
        const modal = document.getElementById('recruitModal');
        if (event.target === modal) {
            closeRecruitModal();
        }
    };
});
