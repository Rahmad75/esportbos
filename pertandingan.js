// ===== ESPORTBOS - SISTEM PERTANDINGAN =====

// Data lawan (dummy)
const opponents = [
    { nama: "Inter FC", rank: 14, power: 2450, logo: "⚽" },
    { nama: "Modena", rank: 12, power: 2580, logo: "🔵" },
    { nama: "Team Liquid", rank: 8, power: 2890, logo: "💧" },
    { nama: "Fnatic", rank: 5, power: 3120, logo: "🟠" },
    { nama: "T1", rank: 2, power: 3450, logo: "🔴" }
];

// Jadwal pertandingan
const schedule = [
    { hari: 3, lawan: "Inter FC", waktu: "12 Jam lagi", home: true },
    { hari: 5, lawan: "Modena", waktu: "2 Hari lagi", home: false },
    { hari: 7, lawan: "Team Liquid", waktu: "4 Hari lagi", home: true },
    { hari: 10, lawan: "Fnatic", waktu: "7 Hari lagi", home: false },
    { hari: 14, lawan: "T1", waktu: "11 Hari lagi", home: true }
];

// Klasemen liga
const standings = [
    { rank: 1, nama: "T1", main: 2, menang: 2, kalah: 0, poin: 6 },
    { rank: 2, nama: "Fnatic", main: 2, menang: 2, kalah: 0, poin: 6 },
    { rank: 3, nama: "Team Liquid", main: 2, menang: 1, kalah: 1, poin: 3 },
    { rank: 14, nama: "Inter FC", main: 2, menang: 1, kalah: 1, poin: 3 },
    { rank: 15, nama: "Modena", main: 2, menang: 0, kalah: 2, poin: 0 },
    { rank: 16, nama: "RRQ Hoshi", main: 2, menang: 0, kalah: 2, poin: 0 }
];

// Hitung power tim dari stats pemain
function hitungTeamPower() {
    const players = JSON.parse(localStorage.getItem('esportbos_players') || '[]');
    if (players.length === 0) return 2000;
    
    let totalPower = 0;
    players.forEach(p => {
        const avg = (p.stats.mechanics + p.stats.gameSense + p.stats.teamwork + p.stats.stamina) / 4;
        totalPower += avg * 10;
    });
    return Math.round(totalPower);
}

// Render jadwal
function renderSchedule() {
    const list = document.getElementById('scheduleList');
    if (!list) return;
    
    list.innerHTML = schedule.map(m => `
        <div class="schedule-item ${m.home ? 'home' : 'away'}">
            <div class="schedule-day">Hari ${m.hari}</div>
            <div class="schedule-opponent">
                ${m.home ? '🏠' : '✈️'} vs ${m.lawan}
            </div>
            <div class="schedule-time">${m.waktu}</div>
        </div>
    `).join('');
}

// Render klasemen
function renderStandings() {
    const tbody = document.getElementById('standingsBody');
    if (!tbody) return;
    
    tbody.innerHTML = standings.map(s => `
        <tr class="${s.nama === 'RRQ Hoshi' ? 'my-team' : ''}">
            <td>${s.rank}</td>
            <td><strong>${s.nama}</strong></td>
            <td>${s.main}</td>
            <td>${s.menang}</td>
            <td>${s.kalah}</td>
            <td><strong>${s.poin}</strong></td>
        </tr>
    `).join('');
}

// ===== MATCH ENGINE =====

function mulaiMatch() {
    const myPower = hitungTeamPower();
    const strategi = document.getElementById('strategi').value;
    const objective = document.getElementById('objective').value;
    const target = document.getElementById('target').value;
    
    // Lawan saat ini (Inter FC)
    const lawan = { nama: "Inter FC", power: 2450 };
    
    // Hitung win chance
    let powerDiff = myPower - lawan.power;
    
    // Bonus dari strategi
    if (strategi === 'aggressive') powerDiff += 50;
    if (strategi === 'defensive') powerDiff -= 30;
    if (objective === 'early') powerDiff += 30;
    if (target === 'carry') powerDiff += 20;
    
    // Base win chance 50% + power diff
    let winChance = 50 + (powerDiff / 50);
    winChance = Math.max(10, Math.min(90, winChance));
    
    // Simulasi BO3 (Best of 3)
    const maps = [];
    let myWins = 0;
    let lawanWins = 0;
    
    for (let i = 0; i < 3; i++) {
        const roll = Math.random() * 100;
        const menang = roll < winChance;
        
        if (menang) myWins++;
        else lawanWins++;
        
        maps.push({
            map: i + 1,
            menang: menang,
            kills: Math.floor(Math.random() * 20) + 10,
            deaths: Math.floor(Math.random() * 20) + 10,
            duration: Math.floor(Math.random() * 20) + 25
        });
        
        // BO3 berhenti kalau salah satu udah 2 win
        if (myWins === 2 || lawanWins === 2) break;
    }
    
    const menangMatch = myWins > lawanWins;
    
    // Generate highlight events
    const players = JSON.parse(localStorage.getItem('esportbos_players') || '[]');
    const highlights = generateHighlights(maps, players, menangMatch);
    
    // Tampilkan hasil
    tampilkanHasilMatch({
        lawan: lawan.nama,
        myWins,
        lawanWins,
        menang: menangMatch,
        maps,
        highlights,
        strategi,
        objective
    });
    
    // Update klasemen
    updateStandings(menangMatch);
    
    // Save ke history
    saveMatchHistory({
        lawan: lawan.nama,
        myWins,
        lawanWins,
        menang: menangMatch,
        tanggal: new Date().toLocaleDateString('id-ID')
    });
}

function generateHighlights(maps, players, menang) {
    const events = [];
    const playerNames = players.map(p => p.nama);
    
    const eventTemplates = [
        (p) => `${p} mendapatkan PENTAKILL di team fight!`,
        (p) => `${p} clutch 1v3 untuk win round!`,
        (p) => `${p} steal Baron dengan smite sempurna!`,
        (p) => `${p} first blood di early game!`,
        (p) => `${p} outplay mekanik luar biasa!`,
        (p) => `${p} roaming gank berhasil 3 kill!`
    ];
    
    maps.forEach((map, idx) => {
        if (map.menang) {
            const player = playerNames[Math.floor(Math.random() * playerNames.length)];
            const event = eventTemplates[Math.floor(Math.random() * eventTemplates.length)];
            events.push({ map: idx + 1, text: event(player), type: 'good' });
        } else {
            const player = playerNames[Math.floor(Math.random() * playerNames.length)];
            events.push({ map: idx + 1, text: `${player} terkena CC dan tim kalah fight`, type: 'bad' });
        }
    });
    
    return events;
}

function tampilkanHasilMatch(result) {
    const modal = document.getElementById('matchModal');
    const body = document.getElementById('matchResultBody');
    
    const resultColor = result.menang ? '#28a745' : '#dc3545';
    const resultText = result.menang ? '🎉 VICTORY!' : ' DEFEAT';
    const reward = result.menang ? '+150  | +5 Popularitas' : '+30 💰 | -2 Popularitas';
    
    body.innerHTML = `
        <div class="match-result-display">
            <div class="result-header" style="background: ${resultColor};">
                <h1>${resultText}</h1>
                <p>vs ${result.lawan}</p>
            </div>
            
            <div class="result-score">
                <div class="score-team my-team">
                    <div class="team-logo-big"></div>
                    <h3>RRQ Hoshi</h3>
                    <div class="score-number">${result.myWins}</div>
                </div>
                <div class="score-vs">-</div>
                <div class="score-team enemy-team">
                    <div class="team-logo-big">⚽</div>
                    <h3>${result.lawan}</h3>
                    <div class="score-number">${result.lawanWins}</div>
                </div>
            </div>
            
            <div class="maps-result">
                <h3>📊 Detail Maps</h3>
                ${result.maps.map(m => `
                    <div class="map-result ${m.menang ? 'win' : 'lose'}">
                        <span>Map ${m.map}</span>
                        <span>${m.menang ? '✅ WIN' : '❌ LOSE'}</span>
                        <span>K/D: ${m.kills}/${m.deaths}</span>
                        <span>⏱️ ${m.duration} min</span>
                    </div>
                `).join('')}
            </div>
            
            <div class="match-highlights">
                <h3>🎬 Highlight</h3>
                ${result.highlights.map(h => `
                    <div class="highlight-item ${h.type}">
                        <span class="highlight-map">Map ${h.map}</span>
                        <span>${h.text}</span>
                    </div>
                `).join('')}
            </div>
            
            <div class="match-reward wood-panel">
                <h3>🎁 Reward</h3>
                <p>${reward}</p>
            </div>
            
            <button class="btn-futuristic" onclick="closeMatchModal()">Lanjut</button>
        </div>
    `;
    
    modal.style.display = 'block';
}

function closeMatchModal() {
    document.getElementById('matchModal').style.display = 'none';
    renderMatchHistory();
}

function updateStandings(menang) {
    const myTeam = standings.find(s => s.nama === 'RRQ Hoshi');
    if (myTeam) {
        myTeam.main++;
        if (menang) {
            myTeam.menang++;
            myTeam.poin += 3;
        } else {
            myTeam.kalah++;
        }
    }
    renderStandings();
}

function saveMatchHistory(match) {
    const history = JSON.parse(localStorage.getItem('esportbos_match_history') || '[]');
    history.unshift(match);
    
    // BATASI CUMA 10 MATCH TERAKHIR
    if (history.length > 10) {
        history.length = 10;
    }
    
    localStorage.setItem('esportbos_match_history', JSON.stringify(history));
}

function renderMatchHistory() {
    const container = document.getElementById('matchHistory');
    if (!container) return;
    
    const history = JSON.parse(localStorage.getItem('esportbos_match_history') || '[]');
    
    if (history.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#999;">Belum ada pertandingan.</p>';
        return;
    }
    
    container.innerHTML = history.map(m => `
        <div class="history-item ${m.menang ? 'win' : 'lose'}">
            <div class="history-result">${m.menang ? '✅ WIN' : '❌ LOSE'}</div>
            <div class="history-opponent">vs ${m.lawan}</div>
            <div class="history-score">${m.myWins} - ${m.lawanWins}</div>
            <div class="history-date">${m.tanggal}</div>
        </div>
    `).join('');
}

// Tab switching
function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(`tab-${tabName}`).style.display = 'block';
    event.target.classList.add('active');
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
    
    const power = hitungTeamPower();
    document.getElementById('myPower').textContent = power;
    
    renderSchedule();
    renderStandings();
    renderMatchHistory();
});
