// ===== ESPORTBOS - KANTOR PUSAT =====

// Database Sponsor
const sponsorsDB = [
    { id: 1, name: "Warung Kopi Lokal", income: 800, reqPop: 0, logo: "☕", desc: "Sponsor lokal dari kedai kopi sebelah." },
    { id: 2, name: "TechGadget ID", income: 2500, reqPop: 30, logo: "💻", desc: "Toko gadget ternama, butuh popularitas 30%." },
    { id: 3, name: "Energy Drink Max", income: 5000, reqPop: 60, logo: "⚡", desc: "Minuman energi populer, butuh popularitas 60%." },
    { id: 4, name: "Global Airline", income: 12000, reqPop: 85, logo: "✈️", desc: "Maskapai internasional, butuh popularitas 85%." },
    { id: 5, name: "Crypto Exchange", income: 20000, reqPop: 95, logo: "🪙", desc: "Platform crypto global, butuh popularitas 95%." }
];

// Database Fasilitas
const facilitiesDB = {
    1: { name: "Ruko Sederhana", maxSlots: 2, popBonus: 0, upgradeCost: 10000 },
    2: { name: "Gedung Bertingkat", maxSlots: 4, popBonus: 5, upgradeCost: 25000 },
    3: { name: "Menara Esport", maxSlots: 6, popBonus: 10, upgradeCost: null }
};

// Load Data
function loadOfficeData() {
    const saved = localStorage.getItem('esportbos_office');
    if (saved) return JSON.parse(saved);
    return {
        level: 1,
        activeSponsors: [] // Array of sponsor IDs
    };
}

function saveOfficeData(data) {
    localStorage.setItem('esportbos_office', JSON.stringify(data));
}

function getTeamFunds() {
    return parseInt(localStorage.getItem('esportbos_team_funds') || '10000');
}

function updateFundsDisplay() {
    const funds = getTeamFunds();
    const display = document.getElementById('teamFundsDisplay');
    if (display) display.textContent = funds.toLocaleString();
}

function getWeeklyExpenses() {
    // Gaji pemain (simulasi: 100 gold per pemain per minggu)
    const players = JSON.parse(localStorage.getItem('esportbos_players') || '[]');
    return players.length * 100;
}

function getWeeklyIncome() {
    const officeData = loadOfficeData();
    let income = 0;
    officeData.activeSponsors.forEach(sponsorId => {
        const sponsor = sponsorsDB.find(s => s.id === sponsorId);
        if (sponsor) income += sponsor.income;
    });
    return income;
}

// Render Keuangan
function renderFinance() {
    const funds = getTeamFunds();
    const income = getWeeklyIncome();
    const expense = getWeeklyExpenses();
    const profit = income - expense;

    document.getElementById('currentBalance').textContent = funds.toLocaleString() + ' Gold';
    document.getElementById('weeklyIncome').textContent = '+' + income.toLocaleString() + ' Gold';
    document.getElementById('weeklyExpense').textContent = '-' + expense.toLocaleString() + ' Gold';
    
    const profitEl = document.getElementById('netProfit');
    profitEl.textContent = (profit >= 0 ? '+' : '') + profit.toLocaleString() + ' Gold';
    profitEl.style.color = profit >= 0 ? '#28a745' : '#dc3545';
}

function claimWeeklyIncome() {
    const income = getWeeklyIncome();
    const expense = getWeeklyExpenses();
    const profit = income - expense;
    
    let funds = getTeamFunds();
    funds += profit;
    localStorage.setItem('esportbos_team_funds', funds.toString());
    
    updateFundsDisplay();
    renderFinance();
    
    showKantorModal('💵 Klaim Pendapatan', `
        <div style="text-align:center; padding: 20px;">
            <h2 style="color: ${profit >= 0 ? '#28a745' : '#dc3545'};">${profit >= 0 ? 'PROFIT' : 'RUGI'} MINGGU INI</h2>
            <div style="font-size: 48px; font-weight: 900; color: ${profit >= 0 ? '#28a745' : '#dc3545'}; margin: 20px 0;">
                ${profit >= 0 ? '+' : ''}${profit.toLocaleString()} Gold
            </div>
            <p>Pemasukan: +${income.toLocaleString()} Gold</p>
            <p>Pengeluaran: -${expense.toLocaleString()} Gold</p>
            <p style="margin-top: 20px; font-weight: bold;">Saldo Baru: ${funds.toLocaleString()} Gold</p>
        </div>
    `);
}

// Render Sponsor
function renderSponsors() {
    const officeData = loadOfficeData();
    const currentPop = parseInt(document.getElementById('clubPopularity').textContent);
    
    document.getElementById('activeSponsorCount').textContent = officeData.activeSponsors.length;
    document.getElementById('maxSponsorSlots').textContent = facilitiesDB[officeData.level].maxSlots;

    const availableContainer = document.getElementById('availableSponsors');
    const activeContainer = document.getElementById('activeSponsors');
    
    availableContainer.innerHTML = '';
    activeContainer.innerHTML = '';

    sponsorsDB.forEach(sponsor => {
        const isActive = officeData.activeSponsors.includes(sponsor.id);
        const isLocked = currentPop < sponsor.reqPop;
        const isFull = officeData.activeSponsors.length >= facilitiesDB[officeData.level].maxSlots;

        const cardHTML = `
            <div class="sponsor-card ${isActive ? 'active' : ''} ${isLocked ? 'locked' : ''}">
                <div class="sponsor-logo">${sponsor.logo}</div>
                <h4>${sponsor.name}</h4>
                <p class="sponsor-desc">${sponsor.desc}</p>
                <div class="sponsor-income"> +${sponsor.income.toLocaleString()} / minggu</div>
                ${isLocked ? `<div class="sponsor-req">🔒 Butuh Popularitas ${sponsor.reqPop}%</div>` : ''}
                ${isActive 
                    ? `<button class="btn-fire" onclick="fireSponsor(${sponsor.id})">❌ Putus Kontrak</button>` 
                    : `<button class="btn-sign" ${isLocked || isFull ? 'disabled' : ''} onclick="signSponsor(${sponsor.id})">🤝 Tanda Tangani</button>`
                }
            </div>
        `;

        if (isActive) {
            activeContainer.innerHTML += cardHTML;
        } else {
            availableContainer.innerHTML += cardHTML;
        }
    });

    if (activeContainer.innerHTML === '') {
        activeContainer.innerHTML = '<p style="grid-column: 1/-1; text-align:center; color:#999;">Belum ada sponsor aktif.</p>';
    }
}

function signSponsor(id) {
    const officeData = loadOfficeData();
    if (officeData.activeSponsors.length >= facilitiesDB[officeData.level].maxSlots) {
        alert(' Slot sponsor penuh! Upgrade fasilitas kantor dulu.');
        return;
    }
    if (officeData.activeSponsors.includes(id)) return;

    officeData.activeSponsors.push(id);
    saveOfficeData(officeData);
    
    renderSponsors();
    renderFinance();
    alert('✅ Sponsor berhasil ditandatangani! Pemasukan mingguan meningkat.');
}

function fireSponsor(id) {
    if (!confirm('Yakin mau memutus kontrak sponsor ini?')) return;
    
    const officeData = loadOfficeData();
    officeData.activeSponsors = officeData.activeSponsors.filter(sId => sId !== id);
    saveOfficeData(officeData);
    
    renderSponsors();
    renderFinance();
    alert('❌ Kontrak sponsor diputus.');
}

// Render Fasilitas
function renderFacilities() {
    const officeData = loadOfficeData();
    const currentFac = facilitiesDB[officeData.level];
    
    document.getElementById('currentFacilityName').textContent = currentFac.name;
    document.getElementById('currentFacilityLevel').textContent = officeData.level;
    document.getElementById('currentMaxSlots').textContent = currentFac.maxSlots;
    
    const btnUpgrade = document.getElementById('btnUpgradeFacility');
    
    if (officeData.level < 3) {
        const nextFac = facilitiesDB[officeData.level + 1];
        document.getElementById('nextFacilityName').textContent = nextFac.name;
        document.getElementById('nextMaxSlots').textContent = nextFac.maxSlots;
        document.getElementById('upgradeCost').textContent = currentFac.upgradeCost.toLocaleString() + ' Gold';
        btnUpgrade.style.display = 'block';
    } else {
        document.getElementById('nextFacilityName').textContent = 'MAKSIMAL';
        document.getElementById('nextMaxSlots').textContent = '-';
        document.getElementById('upgradeCost').textContent = '-';
        btnUpgrade.style.display = 'none';
    }
}

function upgradeFacility() {
    const officeData = loadOfficeData();
    const currentFac = facilitiesDB[officeData.level];
    const funds = getTeamFunds();
    
    if (funds < currentFac.upgradeCost) {
        alert(`❌ Dana tidak cukup! Butuh ${currentFac.upgradeCost.toLocaleString()} Gold.`);
        return;
    }
    
    if (!confirm(`Upgrade kantor ke Level ${officeData.level + 1} seharga ${currentFac.upgradeCost.toLocaleString()} Gold?`)) return;
    
    localStorage.setItem('esportbos_team_funds', (funds - currentFac.upgradeCost).toString());
    officeData.level++;
    saveOfficeData(officeData);
    
    updateFundsDisplay();
    renderFacilities();
    renderSponsors();
    alert('️ Kantor berhasil di-upgrade! Slot sponsor bertambah.');
}

// Modal Helpers
function showKantorModal(title, content) {
    document.getElementById('kantorModalBody').innerHTML = `<h3>${title}</h3>${content}`;
    document.getElementById('kantorModal').style.display = 'block';
}

function closeKantorModal() {
    document.getElementById('kantorModal').style.display = 'none';
}

function switchKantorTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(`tab-${tabName}`).style.display = 'block';
    event.target.classList.add('active');
    
    if (tabName === 'keuangan') renderFinance();
    if (tabName === 'sponsor') renderSponsors();
    if (tabName === 'fasilitas') renderFacilities();
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
    renderFinance();
    renderSponsors();
    renderFacilities();
    
    window.onclick = function(event) {
        const modal = document.getElementById('kantorModal');
        if (event.target === modal) {
            closeKantorModal();
        }
    };
});
