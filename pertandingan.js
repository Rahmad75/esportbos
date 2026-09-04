// ===== ESPORTBOS - LIVE MATCH SIMULATION (PART 1) =====

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

// ===== LIVE MATCH VARIABLES =====

let matchInterval = null;
let currentMap = 1;
let matchTime = 0;
let myKills = 0;
let enemyKills = 0;
let myGold = 0;
let enemyGold = 0;
let myTowers = 0;
let enemyTowers = 0;
let myDragons = 0;
let enemyDragons = 0;
let commentary = [];
let mapResults = [];
let myMapWins = 0;
let enemyMapWins = 0;

const MAX_MAP_TIME = 2100; // 35 menit dalam detik
const SIMULATION_SPEED = 50; // Update setiap 50ms
const TIME_MULTIPLIER = 10; // 1 detik real = 10 detik game

// Event templates untuk commentary
const eventTemplates = {
    kill: [
        "{player} mendapatkan kill di {lane}!",
        "First Blood untuk {player}!",
        "{player} clutch 1v2 di {lane}!",
        "Outplay luar biasa dari {player}!",
        "{player} double kill!",
        "{player} triple kill!",
        "{player} quadra kill!",
        "{player} PENTAKILL! UNBELIEVABLE!",
        "Gank sukses! {player} dapat kill",
        "Counter-gank! {player} selamat dan dapat kill"
    ],
    objective: [
        "🐉 RRQ Hoshi mengambil Dragon! ({dragons}/4)",
        "🐉 Inter FC mengambil Dragon! ({dragons}/4)",
        "👑 Baron Nashor diambil oleh RRQ Hoshi!",
        " Baron Nashor diambil oleh Inter FC!",
        "🏰 Tower {lane} hancur!",
        " Inhibitor hancur di {lane}!",
        "🎯 Elder Dragon diambil RRQ Hoshi!",
        "🎯 Elder Dragon diambil Inter FC!"
    ],
    teamfight: [
        "⚔️ Team fight besar di {location}! RRQ Hoshi menang 4-1!",
        "⚔️ Team fight di {location}! Inter FC menang 3-2!",
        "️ 5v5 team fight! RRQ Hoshi ace!",
        "⚔️ Team fight berdarah! Kedua tim losses berat",
        "⚔️ Pick off sukses! RRQ Hoshi dapat advantage"
    ],
    momentum: [
        "🔥 RRQ Hoshi sedang on fire! Momentum bagus!",
        "🔥 Inter FC comeback! Momentum berbalik!",
        " Gold difference: +{gold}k untuk RRQ Hoshi",
        "📉 Inter FC mulai ketinggalan!",
        " RRQ Hoshi push lane {lane}!",
        "🛡️ Inter FC defend base dengan baik"
    ]
};

const lanes = ["Top", "Mid", "Bot", "Jungle"];
const locations = ["Dragon pit", "Baron pit", "Mid lane", "Bot lane", "Top lane", "River", "Base"];

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

function getRandomPlayer() {
    const players = JSON.parse(localStorage.getItem('esportbos_players') || '[]');
    if (players.length === 0) return "Faker Jr.";
    return players[Math.floor(Math.random() * players.length)].nama;
}

function generateEvent() {
    const myPower = hitungTeamPower();
    const enemyPower = 2450;
    const powerRatio = myPower / (myPower + enemyPower);
    
    const roll = Math.random();
    let eventType, eventText;
    
    if (roll < 0.4) {
        eventType = 'kill';
        const template = eventTemplates.kill[Math.floor(Math.random() * eventTemplates.kill.length)];
        const player = getRandomPlayer();
        const lane = lanes[Math.floor(Math.random() * lanes.length)];
        eventText = template.replace('{player}', player).replace('{lane}', lane);
        
        if (Math.random() < powerRatio) {
            myKills++;
        } else {
            enemyKills++;
        }
    } else if (roll < 0.6) {
        eventType = 'objective';
        const template = eventTemplates.objective[Math.floor(Math.random() * eventTemplates.objective.length)];
        const lane = lanes[Math.floor(Math.random() * lanes.length)];
        eventText = template.replace('{lane}', lane);
        
        if (eventText.includes('RRQ Hoshi')) {
            if (eventText.includes('Dragon')) myDragons++;
            else if (eventText.includes('Baron')) myGold += 500;
            else if (eventText.includes('Tower')) myTowers++;
            myGold += 300;
        } else {
            if (eventText.includes('Inter FC')) {
                if (eventText.includes('Dragon')) enemyDragons++;
                else if (eventText.includes('Baron')) enemyGold += 500;
                else if (eventText.includes('Tower')) enemyTowers++;
                enemyGold += 300;
            }
        }
    } else if (roll < 0.8) {
        eventType = 'teamfight';
        const template = eventTemplates.teamfight[Math.floor(Math.random() * eventTemplates.teamfight.length)];
        const location = locations[Math.floor(Math.random() * locations.length)];
        eventText = template.replace('{location}', location);
        
        if (eventText.includes('RRQ Hoshi menang') || eventText.includes('RRQ Hoshi ace')) {
            myKills += Math.floor(Math.random() * 3) + 2;
            myGold += 1000;
        } else {
            enemyKills += Math.floor(Math.random() * 3) + 2;
            enemyGold += 1000;
        }
    } else {
        eventType = 'momentum';
        const template = eventTemplates.momentum[Math.floor(Math.random() * eventTemplates.momentum.length)];
        const goldDiff = Math.abs(myGold - enemyGold) / 1000;
        eventText = template.replace('{gold}', goldDiff.toFixed(1));
    }
    
    return { time: matchTime, text: eventText, type: eventType };
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function updateLiveDisplay() {
    const timer = document.getElementById('liveTimer');
    const score = document.getElementById('liveScore');
    const stats = document.getElementById('liveStats');
    const commentaryList = document.getElementById('liveCommentary');
    const progressBar = document.getElementById('matchProgress');
    
    if (timer) {
        const gameMinutes = Math.floor(matchTime / 60);
        timer.textContent = `⏱️ ${formatTime(matchTime)} | Game Time: ${formatTime(gameMinutes * 10)}`;
    }
    
    if (score) {
        score.innerHTML = `
            <div class="live-score-item">
                <span class="team-name">RRQ Hoshi</span>
                <span class="score-value">${myKills}</span>
            </div>
            <div class="live-score-item">
                <span class="score-label">KILLS</span>
            </div>
            <div class="live-score-item">
                <span class="score-value">${enemyKills}</span>
                <span class="team-name">Inter FC</span>
            </div>
        `;
    }
    
    if (stats) {
        const goldDiff = myGold - enemyGold;
        stats.innerHTML = `
            <div class="stat-item">
                <span>💰 Gold</span>
                <span>${(myGold/1000).toFixed(1)}k vs ${(enemyGold/1000).toFixed(1)}k</span>
                <span class="${goldDiff > 0 ? 'positive' : 'negative'}">${goldDiff > 0 ? '+' : ''}${(goldDiff/1000).toFixed(1)}k</span>
            </div>
            <div class="stat-item">
                <span>🏰 Towers</span>
                <span>${myTowers} vs ${enemyTowers}</span>
            </div>
            <div class="stat-item">
                <span> Dragons</span>
                <span>${myDragons} vs ${enemyDragons}</span>
            </div>
        `;
    }
    
    if (commentaryList) {
        commentaryList.innerHTML = commentary.slice(-8).map(c => `
            <div class="commentary-item ${c.type}">
                <span class="commentary-time">[${formatTime(Math.floor(c.time / 10))}]</span>
                <span class="commentary-text">${c.text}</span>
            </div>
        `).join('');
        commentaryList.scrollTop = commentaryList.scrollHeight;
    }
    
    if (progressBar) {
        const progress = (matchTime / MAX_MAP_TIME) * 100;
        progressBar.style.width = `${progress}%`;
    }
}

function startLiveMatch() {
    currentMap = 1;
    myMapWins = 0;
    enemyMapWins = 0;
    mapResults = [];
    
    document.getElementById('btnMainMatch').style.display = 'none';
    document.getElementById('tacticSetup').style.display = 'none';
    document.getElementById('liveMatchUI').style.display = 'block';
    
    startMap();
}

function startMap() {
    matchTime = 0;
    myKills = 0;
    enemyKills = 0;
    myGold = 0;
    enemyGold = 0;
    myTowers = 0;
    enemyTowers = 0;
    myDragons = 0;
    enemyDragons = 0;
    commentary = [];
    
    document.getElementById('mapIndicator').textContent = `Map ${currentMap}/3`;
    document.getElementById('mapScore').textContent = `${myMapWins} - ${enemyMapWins}`;
    
    matchInterval = setInterval(() => {
        matchTime += TIME_MULTIPLIER;
        
        if (matchTime % 20 === 0 || matchTime % 30 === 0) {
            const event = generateEvent();
            commentary.push(event);
        }
        
        updateLiveDisplay();
        
        if (matchTime >= MAX_MAP_TIME) {
            endMap();
        }
    }, SIMULATION_SPEED);
}

function endMap() {
    clearInterval(matchInterval);
    
    const myScore = myKills * 100 + myGold + myTowers * 500 + myDragons * 300;
    const enemyScore = enemyKills * 100 + enemyGold + enemyTowers * 500 + enemyDragons * 300;
    
    const mapWon = myScore > enemyScore;
    
    if (mapWon) myMapWins++;
    else enemyMapWins++;
    
    mapResults.push({
        map: currentMap,
        won: mapWon,
        kills: `${myKills}-${enemyKills}`,
        duration: formatTime(Math.floor(MAX_MAP_TIME / 10))
    });
    
    showMapResult(mapWon);
}
// ===== ESPORTBOS - LIVE MATCH SIMULATION (PART 2) =====

function showMapResult(won) {
    const modal = document.getElementById('mapResultModal');
    const body = document.getElementById('mapResultBody');
    
    body.innerHTML = `
        <div class="map-result-display">
            <h2 class="${won ? 'victory' : 'defeat'}">
                ${won ? ' MAP WIN!' : '❌ MAP LOSS'}
            </h2>
            <div class="map-score">
                <span>RRQ Hoshi</span>
                <span class="score">${myKills} - ${enemyKills}</span>
                <span>Inter FC</span>
            </div>
            <div class="map-stats">
                <p>💰 Gold: ${(myGold/1000).toFixed(1)}k vs ${(enemyGold/1000).toFixed(1)}k</p>
                <p> Towers: ${myTowers} vs ${enemyTowers}</p>
                <p> Dragons: ${myDragons} vs ${enemyDragons}</p>
            </div>
            <div class="map-score-update">
                <p>Score: <strong>${myMapWins} - ${enemyMapWins}</strong></p>
            </div>
            <button class="btn-futuristic" onclick="nextMap()">
                ${myMapWins === 2 || enemyMapWins === 2 ? 'Lihat Hasil Akhir' : 'Lanjut Map Berikutnya'}
            </button>
        </div>
    `;
    
    modal.style.display = 'block';
}

function nextMap() {
    document.getElementById('mapResultModal').style.display = 'none';
    
    if (myMapWins === 2 || enemyMapWins === 2) {
        endMatch();
    } else {
        currentMap++;
        startMap();
    }
}

function endMatch() {
    const matchWon = myMapWins > enemyMapWins;
    
    updateStandings(matchWon);
    
    saveMatchHistory({
        lawan: "Inter FC",
        myWins: myMapWins,
        lawanWins: enemyMapWins,
        menang: matchWon,
        tanggal: new Date().toLocaleDateString('id-ID'),
        maps: mapResults
    });
    
    showFinalResult(matchWon);
}

function showFinalResult(won) {
    const modal = document.getElementById('matchModal');
    const body = document.getElementById('matchResultBody');
    
    const resultColor = won ? '#28a745' : '#dc3545';
    const resultText = won ? ' VICTORY!' : ' DEFEAT';
    const reward = won ? '+150 💰 | +5 Popularitas' : '+30 💰 | -2 Popularitas';
    
    body.innerHTML = `
        <div class="match-result-display">
            <div class="result-header" style="background: ${resultColor};">
                <h1>${resultText}</h1>
                <p>vs Inter FC</p>
            </div>
            
            <div class="result-score">
                <div class="score-team my-team">
                    <div class="team-logo-big">🏆</div>
                    <h3>RRQ Hoshi</h3>
                    <div class="score-number">${myMapWins}</div>
                </div>
                <div class="score-vs">-</div>
                <div class="score-team enemy-team">
                    <div class="team-logo-big">⚽</div>
                    <h3>Inter FC</h3>
                    <div class="score-number">${enemyMapWins}</div>
                </div>
            </div>
            
            <div class="maps-result">
                <h3>📊 Detail Maps</h3>
                ${mapResults.map(m => `
                    <div class="map-result ${m.won ? 'win' : 'lose'}">
                        <span>Map ${m.map}</span>
                        <span>${m.won ? '✅ WIN' : '❌ LOSE'}</span>
                        <span>K/D: ${m.kills}</span>
                        <span>⏱️ ${m.duration}</span>
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
    
    document.getElementById('liveMatchUI').style.display = 'none';
    document.getElementById('btnMainMatch').style.display = 'block';
    document.getElementById('tacticSetup').style.display = 'block';
}

function closeMatchModal() {
    document.getElementById('matchModal').style.display = 'none';
    renderMatchHistory();
}

// ===== HELPER FUNCTIONS =====

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
