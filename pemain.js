// ===== ESPORTBOS - HALAMAN PEMAIN =====

// Data default pemain (dummy)
const defaultPlayers = [
    {
        id: 1,
        nama: "Faker Jr.",
        posisi: "Mid Laner",
        role: "Carry",
        umur: 21,
        negara: "🇰🇷 Korea",
        kontrak: "2027",
        gaji: 15000,
        stats: { mechanics: 92, gameSense: 88, teamwork: 85, stamina: 95 },
        avatar: "FakerJr",
        avatarIndex: 12  // Tambahin ini
    },
    {
        id: 2,
        nama: "JungleKing",
        posisi: "Jungler",
        role: "Support",
        umur: 23,
        negara: "🇮🇩 Indonesia",
        kontrak: "2026",
        gaji: 12000,
        stats: { mechanics: 85, gameSense: 90, teamwork: 88, stamina: 92 },
        avatar: "JungleKing",
        avatarIndex: 34  // Tambahin ini
    },
    {
        id: 3,
        nama: "TopLaner99",
        posisi: "Top Laner",
        role: "Tank",
        umur: 24,
        negara: "🇷 Brazil",
        kontrak: "2026",
        gaji: 11000,
        stats: { mechanics: 82, gameSense: 80, teamwork: 90, stamina: 88 },
        avatar: "TopLaner99",
        avatarIndex: 67  // Tambahin ini
    },
    {
        id: 4,
        nama: "ADCarry",
        posisi: "AD Carry",
        role: "Carry",
        umur: 20,
        negara: "🇨🇳 China",
        kontrak: "2028",
        gaji: 18000,
        stats: { mechanics: 95, gameSense: 82, teamwork: 78, stamina: 90 },
        avatar: "ADCarry",
        avatarIndex: 45  // Tambahin ini
    },
    {
        id: 5,
        nama: "SupportPro",
        posisi: "Support",
        role: "Support",
        umur: 25,
        negara: "🇪🇺 Europe",
        kontrak: "2025",
        gaji: 9000,
        stats: { mechanics: 78, gameSense: 92, teamwork: 95, stamina: 85 },
        avatar: "SupportPro",
        avatarIndex: 89  // Tambahin ini
    }
];
// Load pemain dari localStorage atau pakai default
function loadPlayers() {
    const saved = localStorage.getItem('esportbos_players');
    if (saved) {
        return JSON.parse(saved);
    }
    // Simpan default ke localStorage
    localStorage.setItem('esportbos_players', JSON.stringify(defaultPlayers));
    return defaultPlayers;
}

// Save pemain ke localStorage
function savePlayers(players) {
    localStorage.setItem('esportbos_players', JSON.stringify(players));
}

function getAvatarUrl(seed) {
    // Pakai DiceBear dengan seed dari nama pemain
    // Ini pasti jalan dan konsisten
    return `https://api.dicebear.com/7.x/initials/svg?seed=${seed}&backgroundColor=00d4ff,764ba2,667eea&color=ffffff&fontSize=35&fontWeight=bold`;
}

// Render roster
function renderRoster() {
    const players = loadPlayers();
    const grid = document.getElementById('rosterGrid');
    
    if (!grid) return;
    
    grid.innerHTML = '';
    
    players.forEach(player => {
        const avgStats = Math.round(
            (player.stats.mechanics + player.stats.gameSense + player.stats.teamwork + player.stats.stamina) / 4
        );
        
        const card = document.createElement('div');
        card.className = 'player-card';
        card.innerHTML = `
            <div class="player-avatar-wrapper">
                <img src="${getAvatarUrl(player.avatar)}" alt="${player.nama}" class="player-avatar">
                <div class="player-role-badge ${player.role.toLowerCase()}">${player.role}</div>
            </div>
            <div class="player-info">
                <h3 class="player-name">${player.nama}</h3>
                <div class="player-position">${player.posisi}</div>
                <div class="player-meta">
                    <span>${player.umur} thn</span>
                    <span>${player.negara}</span>
                </div>
                <div class="player-stats-mini">
                    <div class="stat-mini">
                        <span class="stat-label">MEC</span>
                        <div class="stat-bar"><div class="stat-fill" style="width: ${player.stats.mechanics}%"></div></div>
                        <span class="stat-value">${player.stats.mechanics}</span>
                    </div>
                    <div class="stat-mini">
                        <span class="stat-label">GS</span>
                        <div class="stat-bar"><div class="stat-fill" style="width: ${player.stats.gameSense}%"></div></div>
                        <span class="stat-value">${player.stats.gameSense}</span>
                    </div>
                    <div class="stat-mini">
                        <span class="stat-label">TW</span>
                        <div class="stat-bar"><div class="stat-fill" style="width: ${player.stats.teamwork}%"></div></div>
                        <span class="stat-value">${player.stats.teamwork}</span>
                    </div>
                </div>
                <div class="player-footer">
                    <span class="player-rating">⭐ ${avgStats}</span>
                    <button class="btn-detail" onclick="showPlayerDetail(${player.id})">Detail</button>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
    
    document.getElementById('totalPlayers').textContent = players.length;
}

// Tampilkan detail pemain di modal
function showPlayerDetail(id) {
    const players = loadPlayers();
    const player = players.find(p => p.id === id);
    if (!player) return;
    
    const modal = document.getElementById('playerModal');
    const modalBody = document.getElementById('modalBody');
    
    modalBody.innerHTML = `
        <div class="player-detail">
            <div class="player-detail-header">
                <img src="${getAvatarUrl(player.avatar)}" alt="${player.nama}" class="player-avatar-large">
                <div>
                    <h2>${player.nama}</h2>
                    <p class="player-position-large">${player.posisi} • ${player.role}</p>
                    <p>${player.umur} tahun • ${player.negara}</p>
                </div>
            </div>
            
            <div class="player-stats-detail">
                <h3>📊 Statistik Pemain</h3>
                <div class="stat-detail-row">
                    <span>Mechanics</span>
                    <div class="stat-bar-large"><div class="stat-fill" style="width: ${player.stats.mechanics}%"></div></div>
                    <span>${player.stats.mechanics}/100</span>
                </div>
                <div class="stat-detail-row">
                    <span>Game Sense</span>
                    <div class="stat-bar-large"><div class="stat-fill" style="width: ${player.stats.gameSense}%"></div></div>
                    <span>${player.stats.gameSense}/100</span>
                </div>
                <div class="stat-detail-row">
                    <span>Teamwork</span>
                    <div class="stat-bar-large"><div class="stat-fill" style="width: ${player.stats.teamwork}%"></div></div>
                    <span>${player.stats.teamwork}/100</span>
                </div>
                <div class="stat-detail-row">
                    <span>Stamina</span>
                    <div class="stat-bar-large"><div class="stat-fill" style="width: ${player.stats.stamina}%"></div></div>
                    <span>${player.stats.stamina}/100</span>
                </div>
            </div>
            
            <div class="player-contract-info">
                <h3> Informasi Kontrak</h3>
                <div class="contract-grid">
                    <div class="contract-item">
                        <span class="contract-label">Berakhir</span>
                        <span class="contract-value">${player.kontrak}</span>
                    </div>
                    <div class="contract-item">
                        <span class="contract-label">Gaji/Bulan</span>
                        <span class="contract-value">💰 ${player.gaji.toLocaleString()}</span>
                    </div>
                </div>
            </div>
            
            <div class="player-actions">
                <button class="btn-futuristic btn-small" onclick="latihPemain(${player.id})">🏋️ Latih</button>
                <button class="btn-futuristic btn-small btn-secondary" onclick="jualPemain(${player.id})">💰 Jual</button>
                <button class="btn-futuristic btn-small btn-secondary" onclick="perpanjangKontrak(${player.id})">📝 Perpanjang</button>
            </div>
        </div>
    `;
    
    modal.style.display = 'block';
}

function closeModal() {
    document.getElementById('playerModal').style.display = 'none';
}

function latihPemain(id) {
    const players = loadPlayers();
    const player = players.find(p => p.id === id);
    if (!player) return;
    
    // Random increase stats
    player.stats.mechanics = Math.min(100, player.stats.mechanics + Math.floor(Math.random() * 3));
    player.stats.gameSense = Math.min(100, player.stats.gameSense + Math.floor(Math.random() * 3));
    
    savePlayers(players);
    renderRoster();
    closeModal();
    alert(`✅ ${player.nama} berhasil dilatih! Stats meningkat.`);
}

function jualPemain(id) {
    if (!confirm('Yakin mau jual pemain ini?')) return;
    
    let players = loadPlayers();
    const player = players.find(p => p.id === id);
    if (!player) return;
    
    players = players.filter(p => p.id !== id);
    savePlayers(players);
    renderRoster();
    closeModal();
    alert(`💰 ${player.nama} berhasil dijual!`);
}

function perpanjangKontrak(id) {
    const players = loadPlayers();
    const player = players.find(p => p.id === id);
    if (!player) return;
    
    player.kontrak = String(parseInt(player.kontrak) + 2);
    savePlayers(players);
    renderRoster();
    closeModal();
    alert(`📝 Kontrak ${player.nama} diperpanjang sampai ${player.kontrak}!`);
}

function tambahPemain() {
    alert('🔜 Fitur rekrut pemain akan segera hadir! Nanti bisa scout & bidding di Transfer Market.');
}

function simulasiLatihan() {
    const players = loadPlayers();
    players.forEach(p => {
        p.stats.stamina = Math.min(100, p.stats.stamina + Math.floor(Math.random() * 5));
    });
    savePlayers(players);
    renderRoster();
    alert('🏋️ Tim berhasil dilatih! Stamina semua pemain meningkat.');
}

function pilihKapten() {
    alert('⭐ Fitur pilih kapten akan segera hadir!');
}

// Init
document.addEventListener('DOMContentLoaded', function() {
    // Cek auth
    if (typeof EsportBosAuth !== 'undefined') {
        EsportBosAuth.requireAuth();
        
        const user = JSON.parse(localStorage.getItem('esportbos_current_user'));
        if (user) {
            const userNameSpan = document.getElementById('userName');
            if (userNameSpan) userNameSpan.textContent = user.username;
        }
    }
    
    renderRoster();
    
    // Close modal kalau klik di luar
    window.onclick = function(event) {
        const modal = document.getElementById('playerModal');
        if (event.target === modal) {
            closeModal();
        }
    };
});
