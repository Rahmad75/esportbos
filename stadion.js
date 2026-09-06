// ===== ESPORTBOS - STADION =====

// Database Level Stadion
const stadionLevels = {
    1: { name: "Gaming House", capacity: 100, ticketPrice: 50, income: 5000, upgradeCost: 15000 },
    2: { name: "Arena Esport", capacity: 500, ticketPrice: 100, income: 25000, upgradeCost: 50000 },
    3: { name: "Stadion Nasional", capacity: 2000, ticketPrice: 200, income: 100000, upgradeCost: 200000 },
    4: { name: "Super Arena", capacity: 10000, ticketPrice: 500, income: 500000, upgradeCost: null }
};

// Load Data
function loadStadionData() {
    const saved = localStorage.getItem('esportbos_stadion');
    if (saved) return JSON.parse(saved);
    return {
        level: 1,
        pendingIncome: 0,
        totalHomeMatches: 0,
        totalIncome: 0
    };
}

function saveStadionData(data) {
    localStorage.setItem('esportbos_stadion', JSON.stringify(data));
}

function getTeamFunds() {
    return parseInt(localStorage.getItem('esportbos_team_funds') || '10000');
}

function updateFundsDisplay() {
    const funds = getTeamFunds();
    const display = document.getElementById('teamFundsDisplay');
    if (display) display.textContent = funds.toLocaleString();
}

// Render Overview
function renderOverview() {
    const stadionData = loadStadionData();
    const level = stadionLevels[stadionData.level];
    
    document.getElementById('stadionName').textContent = level.name;
    document.getElementById('stadionLevel').textContent = stadionData.level;
    document.getElementById('capacity').textContent = level.capacity.toLocaleString();
    document.getElementById('ticketPrice').textContent = level.ticketPrice.toLocaleString();
    document.getElementById('matchIncome').textContent = level.income.toLocaleString();
    
    // Render visual stadion
    renderStadionArt(stadionData.level);
}

// Render Stadion Art (Simple ASCII-like visual)
function renderStadionArt(level) {
    const container = document.getElementById('stadionArt');
    if (!container) return;
    
    const visuals = {
        1: `
            <div class="art-building small">
                <div class="art-roof">🏠</div>
                <div class="art-body"></div>
            </div>
        `,
        2: `
            <div class="art-building medium">
                <div class="art-roof">🏟️</div>
                <div class="art-body">⚡</div>
                <div class="art-crowd">👥👥👥</div>
            </div>
        `,
        3: `
            <div class="art-building large">
                <div class="art-roof">🏛️</div>
                <div class="art-body">🎯</div>
                <div class="art-crowd">👥👥👥</div>
                <div class="art-lights">💡💡💡</div>
            </div>
        `,
        4: `
            <div class="art-building xlarge">
                <div class="art-roof">🌟</div>
                <div class="art-body">🏆</div>
                <div class="art-crowd">👥👥👥👥👥👥👥</div>
                <div class="art-lights">💡💡💡💡💡</div>
                <div class="art-flag">🚩🚩</div>
            </div>
        `
    };
    
    container.innerHTML = visuals[level] || visuals[1];
}

// Render Upgrade Stages
function renderUpgradeStages() {
    const stadionData = loadStadionData();
    const currentLevel = stadionData.level;
    
    for (let i = 1; i <= 4; i++) {
        const stage = document.getElementById(`stage${i}`);
        if (!stage) continue;
        
        stage.className = 'stage-card';
        
        if (i < currentLevel) {
            stage.classList.add('completed');
            stage.querySelector('.stage-status').textContent = '✅ Selesai';
            const btn = stage.querySelector('button');
            if (btn) {
                btn.disabled = true;
                btn.textContent = '✅ Selesai';
            }
        } else if (i === currentLevel) {
            stage.classList.add('current');
            stage.querySelector('.stage-status').textContent = '📍 Saat Ini';
            const btn = stage.querySelector('button');
            if (btn && i < 4) {
                const cost = stadionLevels[i].upgradeCost;
                btn.disabled = false;
                btn.textContent = `⬆️ Upgrade (${cost.toLocaleString()} G)`;
                btn.onclick = () => upgradeStadion(i);
            } else if (btn && i === 4) {
                btn.disabled = true;
                btn.textContent = ' Level MAX';
            }
        } else {
            stage.classList.add('locked');
            stage.querySelector('.stage-status').textContent = '🔒 Terkunci';
            const btn = stage.querySelector('button');
            if (btn) {
                btn.disabled = true;
                const cost = stadionLevels[i].upgradeCost;
                btn.textContent = ` Upgrade (${cost.toLocaleString()} G)`;
            }
        }
    }
}

// Upgrade Stadion
function upgradeStadion(targetLevel) {
    const stadionData = loadStadionData();
    const currentLevel = stadionData.level;
    
    if (targetLevel !== currentLevel + 1) {
        alert('❌ Kamu harus upgrade secara berurutan!');
        return;
    }
    
    const cost = stadionLevels[currentLevel].upgradeCost;
    const funds = getTeamFunds();
    
    if (funds < cost) {
        alert(`❌ Dana tidak cukup! Kamu butuh ${cost.toLocaleString()} Gold.`);
        return;
    }
    
    if (!confirm(`Upgrade stadion ke Level ${targetLevel} seharga ${cost.toLocaleString()} Gold?`)) {
        return;
    }
    
    // Kurangi dana
    localStorage.setItem('esportbos_team_funds', (funds - cost).toString());
    
    // Upgrade level
    stadionData.level = targetLevel;
    saveStadionData(stadionData);
    
    updateFundsDisplay();
    renderOverview();
    renderUpgradeStages();
    renderIncome();
    
    alert(`🏟️ Stadion berhasil di-upgrade ke ${stadionLevels[targetLevel].name}!`);
}

// Render Income
function renderIncome() {
    const stadionData = loadStadionData();
    
    document.getElementById('pendingIncome').textContent = stadionData.pendingIncome.toLocaleString() + ' Gold';
    document.getElementById('totalHomeMatches').textContent = stadionData.totalHomeMatches;
    document.getElementById('totalIncome').textContent = stadionData.totalIncome.toLocaleString() + ' Gold';
}

// Claim Ticket Income
function claimTicketIncome() {
    const stadionData = loadStadionData();
    
    if (stadionData.pendingIncome === 0) {
        alert('⚠️ Tidak ada pendapatan yang bisa diklaim!');
        return;
    }
    
    let funds = getTeamFunds();
    funds += stadionData.pendingIncome;
    localStorage.setItem('esportbos_team_funds', funds.toString());
    
    const claimed = stadionData.pendingIncome;
    stadionData.pendingIncome = 0;
    saveStadionData(stadionData);
    
    updateFundsDisplay();
    renderIncome();
    
    showStadionModal('💰 Pendapatan Diklaim!', `
        <div style="text-align:center; padding: 20px;">
            <h2 style="color: #28a745;">BERHASIL!</h2>
            <div style="font-size: 48px; font-weight: 900; color: #28a745; margin: 20px 0;">
                +${claimed.toLocaleString()} Gold
            </div>
            <p>Pendapatan tiket berhasil diklaim!</p>
            <p style="margin-top: 20px; font-weight: bold;">Saldo Baru: ${funds.toLocaleString()} Gold</p>
        </div>
    `);
}

// Simulasi pendapatan dari match (dipanggil dari pertandingan.js)
function addMatchIncome() {
    const stadionData = loadStadionData();
    const level = stadionLevels[stadionData.level];
    
    // Simulasi okupansi 70-100%
    const occupancy = 0.7 + Math.random() * 0.3;
    const income = Math.round(level.income * occupancy);
    
    stadionData.pendingIncome += income;
    stadionData.totalHomeMatches++;
    stadionData.totalIncome += income;
    saveStadionData(stadionData);
    
    return income;
}

// Modal Helpers
function showStadionModal(title, content) {
    document.getElementById('stadionModalBody').innerHTML = `<h3>${title}</h3>${content}`;
    document.getElementById('stadionModal').style.display = 'block';
}

function closeStadionModal() {
    document.getElementById('stadionModal').style.display = 'none';
}

function switchStadionTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(`tab-${tabName}`).style.display = 'block';
    event.target.classList.add('active');
    
    if (tabName === 'overview') renderOverview();
    if (tabName === 'upgrade') renderUpgradeStages();
    if (tabName === 'income') renderIncome();
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
    renderOverview();
    renderUpgradeStages();
    renderIncome();
    
    window.onclick = function(event) {
        const modal = document.getElementById('stadionModal');
        if (event.target === modal) {
            closeStadionModal();
        }
    };
});

// Export function untuk dipanggil dari pertandingan.js
window.EsportBosStadion = {
    addMatchIncome
};
