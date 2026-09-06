// ===== ESPORTBOS - TRANSFER MARKET =====

// Inisialisasi Dana Klub (jika belum ada)
function initTeamFunds() {
    if (!localStorage.getItem('esportbos_team_funds')) {
        localStorage.setItem('esportbos_team_funds', '10000'); // Modal awal 10.000 Gold
    }
    return parseInt(localStorage.getItem('esportbos_team_funds'));
}

function updateFundsDisplay() {
    const funds = initTeamFunds();
    const display = document.getElementById('teamFundsDisplay');
    if (display) display.textContent = funds.toLocaleString();
}

// Generate Pemain Market (Dummy Pool)
const marketPlayerPool = [
    { nama: "ShadowStrike", posisi: "Top", role: "Tank", stats: { mechanics: 80, gameSense: 75, teamwork: 85, stamina: 90 }, harga: 4500 },
    { nama: "ViperKing", posisi: "Jungle", role: "Carry", stats: { mechanics: 88, gameSense: 82, teamwork: 70, stamina: 85 }, harga: 8500 },
    { nama: "MidLaneGod", posisi: "Mid", role: "Carry", stats: { mechanics: 95, gameSense: 90, teamwork: 75, stamina: 80 }, harga: 18000 },
    { nama: "BotLaneCarry", posisi: "ADC", role: "Carry", stats: { mechanics: 92, gameSense: 85, teamwork: 80, stamina: 88 }, harga: 15000 },
    { nama: "SupportMaster", posisi: "Support", role: "Support", stats: { mechanics: 75, gameSense: 95, teamwork: 98, stamina: 85 }, harga: 9000 },
    { nama: "RookieStar", posisi: "Mid", role: "Carry", stats: { mechanics: 70, gameSense: 65, teamwork: 60, stamina: 95 }, harga: 2500 },
    { nama: "OldVeteran", posisi: "Top", role: "Tank", stats: { mechanics: 78, gameSense: 88, teamwork: 90, stamina: 70 }, harga: 6000 },
    { nama: "FlashyPlayer", posisi: "ADC", role: "Carry", stats: { mechanics: 85, gameSense: 70, teamwork: 65, stamina: 80 }, harga: 7500 }
];

// Load Market (Simulasi dinamis)
function getMarketPlayers() {
    let market = localStorage.getItem('esportbos_market');
    if (!market) {
        // Tambahin ID unik dan avatar seed
        const initialMarket = marketPlayerPool.map((p, i) => ({
            ...p,
            id: 100 + i,
            avatar: p.nama,
            avatarIndex: i + 10
        }));
        localStorage.setItem('esportbos_market', JSON.stringify(initialMarket));
        return initialMarket;
    }
    return JSON.parse(market);
}

function saveMarketPlayers(market) {
    localStorage.setItem('esportbos_market', JSON.stringify(market));
}

function getMyPlayers() {
    return JSON.parse(localStorage.getItem('esportbos_players') || '[]');
}

function saveMyPlayers(players) {
    localStorage.setItem('esportbos_players', JSON.stringify(players));
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

// Render Market
function renderMarket() {
    const grid = document.getElementById('marketGrid');
    if (!grid) return;
    
    let players = getMarketPlayers();
    const posFilter = document.getElementById('filterPosition').value;
    const budgetFilter = document.getElementById('filterBudget').value;
    
    // Apply filters
    if (posFilter !== 'all') {
        players = players.filter(p => p.posisi === posFilter);
    }
    if (budgetFilter === 'low') players = players.filter(p => p.harga < 5000);
    else if (budgetFilter === 'mid') players = players.filter(p => p.harga >= 5000 && p.harga <= 15000);
    else if (budgetFilter === 'high') players = players.filter(p => p.harga > 15000);
    
    if (players.length === 0) {
        grid.innerHTML = '<p style="grid-column: 1/-1; text-align:center; color:#999;">Tidak ada pemain yang cocok dengan filter.</p>';
        return;
    }
    
    grid.innerHTML = players.map(p => {
        const avgStats = Math.round((p.stats.mechanics + p.stats.gameSense + p.stats.teamwork + p.stats.stamina) / 4);
        return `
            <div class="transfer-card">
                <div class="transfer-card-header">
                    <img src="${getAvatarUrl(p.avatar, p.avatarIndex)}" class="transfer-avatar">
                    <div class="transfer-info">
                        <h4>${p.nama}</h4>
                        <p class="transfer-pos">${p.posisi} • ${p.role}</p>
                        <div class="transfer-rating">⭐ ${avgStats} OVR</div>
                    </div>
                </div>
                <div class="transfer-stats-mini">
                    <div><span>MEC</span><strong>${p.stats.mechanics}</strong></div>
                    <div><span>GS</span><strong>${p.stats.gameSense}</strong></div>
                    <div><span>TW</span><strong>${p.stats.teamwork}</strong></div>
                </div>
                <div class="transfer-price">
                    💰 ${p.harga.toLocaleString()} Gold
                </div>
                <button class="btn-buy" onclick="confirmBuy(${p.id})">Beli Sekarang</button>
            </div>
        `;
    }).join('');
}

// Render My Team (untuk dijual)
function renderMyTeam() {
    const grid = document.getElementById('myTeamGrid');
    if (!grid) return;
    
    const players = getMyPlayers();
    
    if (players.length === 0) {
        grid.innerHTML = '<p style="grid-column: 1/-1; text-align:center; color:#999;">Tim kosong.</p>';
        return;
    }
    
    grid.innerHTML = players.map(p => {
        const avgStats = Math.round((p.stats.mechanics + p.stats.gameSense + p.stats.teamwork + p.stats.stamina) / 4);
        // Harga jual = 70% dari nilai rata-rata stats * 100
        const sellPrice = Math.round(avgStats * 100 * 0.7);
        
        return `
            <div class="transfer-card my-player">
                <div class="transfer-card-header">
                    <img src="${getAvatarUrl(p.avatar, p.avatarIndex)}" class="transfer-avatar">
                    <div class="transfer-info">
                        <h4>${p.nama}</h4>
                        <p class="transfer-pos">${p.posisi} • ${p.role}</p>
                        <div class="transfer-rating">⭐ ${avgStats} OVR</div>
                    </div>
                </div>
                <div class="transfer-stats-mini">
                    <div><span>MEC</span><strong>${p.stats.mechanics}</strong></div>
                    <div><span>GS</span><strong>${p.stats.gameSense}</strong></div>
                    <div><span>TW</span><strong>${p.stats.teamwork}</strong></div>
                </div>
                <div class="transfer-price sell-price">
                    💰 Harga Jual: ${sellPrice.toLocaleString()} Gold
                </div>
                <button class="btn-sell" onclick="confirmSell(${p.id}, ${sellPrice})">Jual Pemain</button>
            </div>
        `;
    }).join('');
}

// Beli Pemain
function confirmBuy(playerId) {
    const market = getMarketPlayers();
    const player = market.find(p => p.id === playerId);
    if (!player) return;
    
    const funds = initTeamFunds();
    
    if (funds < player.harga) {
        alert(`❌ Dana tidak cukup! Kamu butuh ${player.harga.toLocaleString()} Gold, tapi hanya punya ${funds.toLocaleString()} Gold.`);
        return;
    }
    
    const modal = document.getElementById('transferModal');
    const body = document.getElementById('transferModalBody');
    
    body.innerHTML = `
        <div class="transfer-confirm">
            <h3>Konfirmasi Pembelian</h3>
            <div class="confirm-player">
                <img src="${getAvatarUrl(player.avatar, player.avatarIndex)}" class="confirm-avatar">
                <div>
                    <h2>${player.nama}</h2>
                    <p>${player.posisi} • ${player.role}</p>
                </div>
            </div>
            <div class="confirm-details">
                <div class="detail-row">
                    <span>Harga:</span>
                    <span class="price">${player.harga.toLocaleString()} Gold</span>
                </div>
                <div class="detail-row">
                    <span>Sisa Dana Setelah Beli:</span>
                    <span class="price">${(funds - player.harga).toLocaleString()} Gold</span>
                </div>
            </div>
            <div class="confirm-actions">
                <button class="btn-cancel" onclick="closeTransferModal()">Batal</button>
                <button class="btn-buy" onclick="executeBuy(${player.id})">✅ Ya, Beli!</button>
            </div>
        </div>
    `;
    
    modal.style.display = 'block';
}

function executeBuy(playerId) {
    const market = getMarketPlayers();
    const playerIndex = market.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return;
    
    const player = market[playerIndex];
    let funds = initTeamFunds();
    
    if (funds < player.harga) {
        alert('❌ Dana tidak cukup!');
        return;
    }
    
    // Kurangi dana
    funds -= player.harga;
    localStorage.setItem('esportbos_team_funds', funds.toString());
    
    // Pindah ke tim saya
    const myPlayers = getMyPlayers();
    // Generate ID baru yang unik
    const newId = myPlayers.length > 0 ? Math.max(...myPlayers.map(p => p.id)) + 1 : 1;
    myPlayers.push({ ...player, id: newId });
    saveMyPlayers(myPlayers);
    
    // Hapus dari market
    market.splice(playerIndex, 1);
    saveMarketPlayers(market);
    
    // Catat history
    addTransferHistory('BUY', player.nama, player.harga);
    
    closeTransferModal();
    updateFundsDisplay();
    renderMarket();
    renderMyTeam();
    
    alert(`✅ Selamat! ${player.nama} resmi bergabung dengan RRQ Hoshi!`);
}

// Jual Pemain
function confirmSell(playerId, sellPrice) {
    const myPlayers = getMyPlayers();
    const player = myPlayers.find(p => p.id === playerId);
    if (!player) return;
    
    if (myPlayers.length <= 1) {
        alert('⚠️ Kamu harus punya minimal 1 pemain di tim!');
        return;
    }
    
    const modal = document.getElementById('transferModal');
    const body = document.getElementById('transferModalBody');
    
    body.innerHTML = `
        <div class="transfer-confirm">
            <h3>Konfirmasi Penjualan</h3>
            <div class="confirm-player">
                <img src="${getAvatarUrl(player.avatar, player.avatarIndex)}" class="confirm-avatar">
                <div>
                    <h2>${player.nama}</h2>
                    <p>${player.posisi} • ${player.role}</p>
                </div>
            </div>
            <div class="confirm-details">
                <div class="detail-row">
                    <span>Harga Jual:</span>
                    <span class="price positive">+${sellPrice.toLocaleString()} Gold</span>
                </div>
                <p class="warning-text">⚠️ Pemain ini akan hilang dari tim secara permanen!</p>
            </div>
            <div class="confirm-actions">
                <button class="btn-cancel" onclick="closeTransferModal()">Batal</button>
                <button class="btn-sell" onclick="executeSell(${player.id}, ${sellPrice})"> Ya, Jual!</button>
            </div>
        </div>
    `;
    
    modal.style.display = 'block';
}

function executeSell(playerId, sellPrice) {
    let myPlayers = getMyPlayers();
    const playerIndex = myPlayers.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return;
    
    const player = myPlayers[playerIndex];
    
    // Tambah dana
    let funds = initTeamFunds();
    funds += sellPrice;
    localStorage.setItem('esportbos_team_funds', funds.toString());
    
    // Hapus dari tim
    myPlayers.splice(playerIndex, 1);
    saveMyPlayers(myPlayers);
    
    // Catat history
    addTransferHistory('SELL', player.nama, sellPrice);
    
    closeTransferModal();
    updateFundsDisplay();
    renderMarket();
    renderMyTeam();
    
    alert(`💰 ${player.nama} berhasil dijual seharga ${sellPrice.toLocaleString()} Gold!`);
}

// Transfer History
function addTransferHistory(type, playerName, amount) {
    let history = JSON.parse(localStorage.getItem('esportbos_transfer_history') || '[]');
    history.unshift({
        type: type,
        player: playerName,
        amount: amount,
        date: new Date().toLocaleDateString('id-ID')
    });
    // Batasi 20 history
    if (history.length > 20) history = history.slice(0, 20);
    localStorage.setItem('esportbos_transfer_history', JSON.stringify(history));
}

function renderTransferHistory() {
    const container = document.getElementById('transferHistoryList');
    if (!container) return;
    
    const history = JSON.parse(localStorage.getItem('esportbos_transfer_history') || '[]');
    
    if (history.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#999;">Belum ada riwayat transfer.</p>';
        return;
    }
    
    container.innerHTML = history.map(h => `
        <div class="history-item-transfer ${h.type.toLowerCase()}">
            <div class="history-icon">${h.type === 'BUY' ? '🛒' : '💰'}</div>
            <div class="history-info">
                <strong>${h.type === 'BUY' ? 'Membeli' : 'Menjual'} ${h.player}</strong>
                <span class="history-date">${h.date}</span>
            </div>
            <div class="history-amount ${h.type === 'BUY' ? 'negative' : 'positive'}">
                ${h.type === 'BUY' ? '-' : '+'}${h.amount.toLocaleString()} Gold
            </div>
        </div>
    `).join('');
}

function closeTransferModal() {
    document.getElementById('transferModal').style.display = 'none';
}

function switchTransferTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(`tab-${tabName}`).style.display = 'block';
    event.target.classList.add('active');
    
    if (tabName === 'market') renderMarket();
    if (tabName === 'myteam') renderMyTeam();
    if (tabName === 'history') renderTransferHistory();
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
    
    initTeamFunds();
    updateFundsDisplay();
    renderMarket();
    
    window.onclick = function(event) {
        const modal = document.getElementById('transferModal');
        if (event.target === modal) {
            closeTransferModal();
        }
    };
});
