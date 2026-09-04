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

// ===== MINI MAP FUNCTIONS =====

function initMiniMap() {
    const players = JSON.parse(localStorage.getItem('esportbos_players') || '[]');
    const positions = ['top', 'jungle', 'mid', 'bot', 'support'];
    
    playerPositions = {};
    
    players.forEach((player, index) => {
        playerPositions[player.nama] = {
            position: positions[index] || 'mid',
            team: 'my'
        };
    });
    
    // Enemy positions
    const enemyPlayers = ['Enemy Top', 'Enemy Jungle', 'Enemy Mid', 'Enemy ADC', 'Enemy Support'];
    enemyPlayers.forEach((player, index) => {
        playerPositions[player] = {
            position: positions[index] || 'mid',
            team: 'enemy'
        };
    });
    
    updateMiniMap();
}

function updateMiniMap() {
    const container = document.getElementById('miniMapPlayers');
    if (!container) return;
    
    container.innerHTML = '';
    
    Object.keys(playerPositions).forEach(playerName => {
        const data = playerPositions[playerName];
        const dot = document.createElement('div');
        dot.className = `map-player ${data.team}-team ${data.position}`;
        dot.title = playerName;
        
        // Random movement
        const randomX = (Math.random() - 0.5) * 10;
        const randomY = (Math.random() - 0.5) * 10;
        dot.style.transform = `translate(${randomX}px, ${randomY}px)`;
        
        container.appendChild(dot);
    });
}

// ===== GOLD GRAPH FUNCTIONS =====

function initGoldGraph() {
    goldHistory = [];
    drawGoldGraph();
}

function updateGoldGraph() {
    const diff = (myGold - enemyGold) / 1000;
    goldHistory.push({
        time: Math.floor(matchTime / 10),
        value: diff
    });
    
    // Keep only last 50 points
    if (goldHistory.length > 50) {
        goldHistory.shift();
    }
    
    drawGoldGraph();
}

function drawGoldGraph() {
    const canvas = document.getElementById('goldGraph');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Background
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(0, 0, width, height);
    
    // Grid lines
    ctx.strokeStyle = '#3a3a3a';
    ctx.lineWidth = 1;
    for (let i = 0; i < height; i += 30) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(width, i);
        ctx.stroke();
    }
    
    // Zero line
    const zeroY = height / 2;
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, zeroY);
    ctx.lineTo(width, zeroY);
    ctx.stroke();
    
    if (goldHistory.length < 2) return;
    
    // Find min/max for scaling
    const values = goldHistory.map(h => h.value);
    const maxVal = Math.max(...values, 5);
    const minVal = Math.min(...values, -5);
    const range = maxVal - minVal || 10;
    
    // Draw line
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    
    goldHistory.forEach((point, index) => {
        const x = (index / (goldHistory.length - 1)) * width;
        const y = zeroY - ((point.value - 0) / range) * (height / 2) * 0.8;
        
        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    
    ctx.stroke();
    
    // Draw area under line
    ctx.lineTo(width, zeroY);
    ctx.lineTo(0, zeroY);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 212, 255, 0.2)';
    ctx.fill();
    
    // Draw current value
    const currentValue = goldHistory[goldHistory.length - 1].value;
    ctx.fillStyle = currentValue >= 0 ? '#28a745' : '#dc3545';
    ctx.font = 'bold 14px Arial';
    ctx.fillText(`${currentValue >= 0 ? '+' : ''}${currentValue.toFixed(1)}k`, width - 70, 20);
}

// ===== PLAYER PERFORMANCE FUNCTIONS =====

function updatePerformanceData() {
    const players = JSON.parse(localStorage.getItem('esportbos_players') || '[]');
    
    players.forEach(player => {
        if (!performanceData[player.nama]) {
            performanceData[player.nama] = {
                kills: 0,
                deaths: 0,
                assists: 0,
                gold: 0,
                cs: 0,
                damage: 0
            };
        }
        
        // Random updates
        if (Math.random() < 0.3) {
            performanceData[player.nama].kills += Math.floor(Math.random() * 2);
            performanceData[player.nama].gold += Math.floor(Math.random() * 500);
            performanceData[player.nama].cs += Math.floor(Math.random() * 5);
            performanceData[player.nama].damage += Math.floor(Math.random() * 100);
        }
    });
}

function showPerformancePopup() {
    const popup = document.getElementById('playerPerformance');
    const content = document.getElementById('performanceContent');
    
    if (!popup || !content) return;
    
    const players = JSON.parse(localStorage.getItem('esportbos_players') || '[]');
    
    let html = '';
    
    players.forEach(player => {
        const perf = performanceData[player.nama] || { kills: 0, gold: 0, cs: 0, damage: 0 };
        const kda = perf.deaths === 0 ? perf.kills : (perf.kills / perf.deaths).toFixed(1);
        
        html += `
            <div class="performance-card ${player.role.toLowerCase()}">
                <img src="${getAvatarUrl(player.avatar, player.avatarIndex)}" 
                     alt="${player.nama}" class="performance-avatar">
                <div class="performance-info">
                    <h5>${player.nama}</h5>
                    <p>${player.posisi} • ${player.role}</p>
                    <p>K/D/A: ${perf.kills}/${perf.deaths}/${perf.assists} (KDA: ${kda})</p>
                </div>
                <div class="performance-stats">
                    <span class="stat-value">${(perf.gold/1000).toFixed(1)}k</span>
                    <span class="stat-label">Gold</span>
                    <span class="stat-value">${perf.cs}</span>
                    <span class="stat-label">CS</span>
                </div>
            </div>
        `;
    });
    
    content.innerHTML = html;
    popup.classList.add('show');
}

function closePerformancePopup() {
    const popup = document.getElementById('playerPerformance');
    if (popup) {
        popup.classList.remove('show');
    }
}

// ===== UPDATE FUNCTIONS =====

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
    goldHistory = [];
    performanceData = {};
    
    document.getElementById('mapIndicator').textContent = `Map ${currentMap}/3`;
    document.getElementById('mapScore').textContent = `${myMapWins} - ${enemyMapWins}`;
    
    // Initialize features
    initMiniMap();
    initGoldGraph();
    
    matchInterval = setInterval(() => {
        matchTime += TIME_MULTIPLIER;
        
        if (matchTime % 20 === 0 || matchTime % 30 === 0) {
            const event = generateEvent();
            commentary.push(event);
        }
        
        updateLiveDisplay();
        updateMiniMap();
        updateGoldGraph();
        updatePerformanceData();
        
        // Show performance popup every 10 minutes
        if (matchTime % 600 === 0 && matchTime > 0) {
            showPerformancePopup();
        }
        
        if (matchTime >= MAX_MAP_TIME) {
            endMap();
        }
    }, SIMULATION_SPEED);
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
