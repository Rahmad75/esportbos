// ===== ESPORTBOS - TIM TEKNIS =====

// Database Staff
const staffDB = [
    { 
        id: 'coach', 
        name: "Head Coach", 
        role: "Pelatih Utama", 
        icon: "🧢", 
        desc: "Meningkatkan Team Synergy dan efektivitas Taktik.", 
        baseCost: 5000, 
        upgradeCost: 3000, 
        bonusLabel: "Synergy Bonus", 
        maxLevel: 5 
    },
    { 
        id: 'analyst', 
        name: "Data Analyst", 
        role: "Analis Data", 
        icon: "", 
        desc: "Meningkatkan kualitas Scout Akademi dan prediksi lawan.", 
        baseCost: 4000, 
        upgradeCost: 2500, 
        bonusLabel: "Scout Quality", 
        maxLevel: 5 
    },
    { 
        id: 'doctor', 
        name: "Team Doctor", 
        role: "Dokter Tim", 
        icon: "⚕️", 
        desc: "Mempercepat pemulihan Energy pemain setelah latihan/match.", 
        baseCost: 3500, 
        upgradeCost: 2000, 
        bonusLabel: "Recovery Rate", 
        maxLevel: 5 
    },
    { 
        id: 'manager', 
        name: "Team Manager", 
        role: "Manajer Operasional", 
        icon: "", 
        desc: "Meningkatkan pendapatan dari Sponsor dan Popularitas Klub.", 
        baseCost: 4500, 
        upgradeCost: 2800, 
        bonusLabel: "Income Bonus", 
        maxLevel: 5 
    }
];

// Load Data
function loadStaffData() {
    const saved = localStorage.getItem('esportbos_staff');
    if (saved) return JSON.parse(saved);
    return {
        coach: 0, analyst: 0, doctor: 0, manager: 0
    };
}

function saveStaffData(data) {
    localStorage.setItem('esportbos_staff', JSON.stringify(data));
}

function getTeamFunds() {
    return parseInt(localStorage.getItem('esportbos_team_funds') || '10000');
}

function updateFundsDisplay() {
    const funds = getTeamFunds();
    const display = document.getElementById('teamFundsDisplay');
    if (display) display.textContent = funds.toLocaleString();
}

function getAvatarUrl(seed) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        hash = hash & hash;
    }
    const photoNum = Math.abs(hash) % 100;
    return `https://randomuser.me/api/portraits/men/${photoNum}.jpg`;
}

// Render Staff Grid
function renderStaff() {
    const grid = document.getElementById('staffGrid');
    if (!grid) return;
    
    const staffData = loadStaffData();
    
    grid.innerHTML = staffDB.map(staff => {
        const level = staffData[staff.id];
        const isMax = level >= staff.maxLevel;
        const currentCost = level === 0 ? staff.baseCost : staff.upgradeCost;
        
        return `
            <div class="staff-card ${level > 0 ? 'hired' : ''}">
                <div class="staff-header">
                    <div class="staff-icon">${staff.icon}</div>
                    <div class="staff-info">
                        <h4>${staff.name}</h4>
                        <p class="staff-role">${staff.role}</p>
                    </div>
                </div>
                <p class="staff-desc">${staff.desc}</p>
                
                <div class="staff-level">
                    <span>Level:</span>
                    <div class="level-dots">
                        ${Array.from({length: staff.maxLevel}, (_, i) => 
                            `<div class="dot ${i < level ? 'active' : ''}"></div>`
                        ).join('')}
                    </div>
                </div>

                <div class="staff-action">
                    ${isMax 
                        ? `<button class="btn-maxed" disabled>✅ Level MAX</button>` 
                        : `<button class="btn-hire" onclick="confirmStaffAction('${staff.id}')">
                            ${level === 0 ? '🤝 Rekrut' : '⬆️ Upgrade'} (${currentCost.toLocaleString()} G)
                           </button>`
                    }
                </div>
            </div>
        `;
    }).join('');

    renderBonusSummary(staffData);
}

// Render Bonus Summary
function renderBonusSummary(staffData) {
    const container = document.getElementById('bonusSummary');
    if (!container) return;
    
    let html = '';
    let hasBonus = false;

    if (staffData.coach > 0) {
        hasBonus = true;
        html += `<div class="bonus-item"><span> Head Coach (Lv ${staffData.coach})</span><span class="bonus-val">+${staffData.coach * 5}% Team Synergy</span></div>`;
    }
    if (staffData.analyst > 0) {
        hasBonus = true;
        html += `<div class="bonus-item"><span>📊 Data Analyst (Lv ${staffData.analyst})</span><span class="bonus-val">+${staffData.analyst * 10}% Scout Quality</span></div>`;
    }
    if (staffData.doctor > 0) {
        hasBonus = true;
        html += `<div class="bonus-item"><span>⚕️ Team Doctor (Lv ${staffData.doctor})</span><span class="bonus-val">+${staffData.doctor * 15}% Energy Recovery</span></div>`;
    }
    if (staffData.manager > 0) {
        hasBonus = true;
        html += `<div class="bonus-item"><span>💼 Team Manager (Lv ${staffData.manager})</span><span class="bonus-val">+${staffData.manager * 8}% Sponsor Income</span></div>`;
    }

    if (!hasBonus) {
        html = '<p style="text-align:center; color:#999; grid-column: 1/-1;">Belum ada staff yang direkrut. Rekrut staff untuk mendapatkan bonus pasif!</p>';
    }

    container.innerHTML = html;
}

// Confirm Action
function confirmStaffAction(staffId) {
    const staff = staffDB.find(s => s.id === staffId);
    if (!staff) return;
    
    const staffData = loadStaffData();
    const level = staffData[staffId];
    const cost = level === 0 ? staff.baseCost : staff.upgradeCost;
    const funds = getTeamFunds();
    
    if (funds < cost) {
        alert(`❌ Dana tidak cukup! Kamu butuh ${cost.toLocaleString()} Gold.`);
        return;
    }
    
    const modal = document.getElementById('staffModal');
    const body = document.getElementById('staffModalBody');
    
    body.innerHTML = `
        <div class="staff-confirm">
            <h3>${level === 0 ? 'Rekrut' : 'Upgrade'} Staff</h3>
            <div class="confirm-staff">
                <div class="confirm-icon">${staff.icon}</div>
                <div>
                    <h2>${staff.name}</h2>
                    <p>${staff.role}</p>
                </div>
            </div>
            <div class="confirm-details">
                <div class="detail-row">
                    <span>Level Saat Ini:</span>
                    <span>${level} / ${staff.maxLevel}</span>
                </div>
                <div class="detail-row">
                    <span>Level Berikutnya:</span>
                    <span class="price positive">${level + 1}</span>
                </div>
                <div class="detail-row">
                    <span>Biaya:</span>
                    <span class="price">${cost.toLocaleString()} Gold</span>
                </div>
                <div class="detail-row">
                    <span>Bonus Aktif:</span>
                    <span>${staff.bonusLabel} +${(level + 1) * (staff.id === 'coach' ? 5 : staff.id === 'analyst' ? 10 : staff.id === 'doctor' ? 15 : 8)}%</span>
                </div>
            </div>
            <div class="confirm-actions">
                <button class="btn-cancel" onclick="closeStaffModal()">Batal</button>
                <button class="btn-hire" onclick="executeStaffAction('${staff.id}', ${cost})">✅ Ya, Lanjutkan!</button>
            </div>
        </div>
    `;
    
    modal.style.display = 'block';
}

// Execute Action
function executeStaffAction(staffId, cost) {
    let funds = getTeamFunds();
    if (funds < cost) {
        alert('❌ Dana tidak cukup!');
        return;
    }
    
    funds -= cost;
    localStorage.setItem('esportbos_team_funds', funds.toString());
    
    const staffData = loadStaffData();
    staffData[staffId]++;
    saveStaffData(staffData);
    
    updateFundsDisplay();
    renderStaff();
    closeStaffModal();
    
    const staff = staffDB.find(s => s.id === staffId);
    alert(`✅ ${staff.name} berhasil ${staffData[staffId] === 1 ? 'direkrut' : 'di-upgrade'} ke Level ${staffData[staffId]}!`);
}

function closeStaffModal() {
    document.getElementById('staffModal').style.display = 'none';
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
    renderStaff();
    
    window.onclick = function(event) {
        const modal = document.getElementById('staffModal');
        if (event.target === modal) {
            closeStaffModal();
        }
    };
});
